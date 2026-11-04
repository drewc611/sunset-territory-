import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Horse.glb: one mesh, 15 morph targets, one 1.5s gallop clip "horse_A_".
// Model units are about 1/0.0095 m, head faces +Z, hooves at y≈0.
const SCALE = 0.0095;
const CLIP_LEN = 1.5;

// The clip is a gallop and there is no walk or idle clip yet. Playback rate follows
// ground speed; below a trot the clip fades out to the rest pose so a standing horse
// isn't frozen mid stride.
const STRIDE_SPEED = 11; // m/s of ground speed per 1x clip rate

const _v = new THREE.Vector3();

// Morphed position of one vertex in model space, so the rider can sit on the real back.
function morphedVertex(mesh, index, out) {
  const g = mesh.geometry;
  const basePos = g.attributes.position;
  out.fromBufferAttribute(basePos, index);
  const targets = g.morphAttributes.position;
  const w = mesh.morphTargetInfluences;
  if (!targets || !w) return out;
  for (let i = 0; i < targets.length; i++) {
    if (!w[i]) continue;
    const t = targets[i];
    if (g.morphTargetsRelative) {
      out.x += t.getX(index) * w[i]; out.y += t.getY(index) * w[i]; out.z += t.getZ(index) * w[i];
    } else {
      out.x += (t.getX(index) - basePos.getX(index)) * w[i];
      out.y += (t.getY(index) - basePos.getY(index)) * w[i];
      out.z += (t.getZ(index) - basePos.getZ(index)) * w[i];
    }
  }
  return out;
}

// Highest vertex on the spine within a z band (model units).
function spineVertex(geo, zMin, zMax) {
  const p = geo.attributes.position;
  let best = -1, by = -Infinity;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (Math.abs(x) < 15 && z >= zMin && z <= zMax && y > by) { by = y; best = i; }
  }
  return best;
}

function buildRider() {
  // Same proportions as the prototype rider, scaled to this horse.
  const rider = new THREE.Group();
  const m = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 });
  const coat = m(0x3f3a33), skin = new THREE.MeshStandardMaterial({ color: 0xc69a74, roughness: 0.9 });
  const hat = m(0x3b2a1e), pants = m(0x2c2a30), scarf = m(0xb04040), rein = m(0x241610);
  const part = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); mesh.castShadow = true;
    rider.add(mesh); return mesh;
  };
  part(new THREE.CylinderGeometry(0.32, 0.38, 1.0, 10), coat, 0, 0.55, 0);
  part(new THREE.SphereGeometry(0.24, 12, 10), skin, 0, 1.25, 0.02);
  part(new THREE.CylinderGeometry(0.58, 0.58, 0.05, 16), hat, 0, 1.42, 0, 0.08);
  part(new THREE.CylinderGeometry(0.27, 0.3, 0.32, 12), hat, 0, 1.6, 0, 0.08);
  part(new THREE.BoxGeometry(0.5, 0.12, 0.45), scarf, 0, 1.02, 0.05);
  for (const lx of [0.36, -0.36]) {
    part(new THREE.CylinderGeometry(0.1, 0.09, 0.85, 8), coat, lx, 0.55, 0.25, -1.1);
    part(new THREE.CylinderGeometry(0.13, 0.11, 0.9, 8), pants, lx * 1.4, 0.05, 0.1, 0.35, 0, lx > 0 ? -0.25 : 0.25);
  }
  part(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 4), rein, 0, 0.75, 0.75, -1.3);
  rider.scale.setScalar(0.56);
  return rider;
}

export function createHorse(scene, base) {
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  scene.add(root);

  const rider = buildRider();
  rider.position.set(0, 1.33, -0.15);
  root.add(rider);

  let mixer = null, action = null, mesh = null, seat = -1, seatFront = -1, seatRear = -1;
  const ready = new Promise((resolve, reject) => {
    new GLTFLoader().load(`${base}assets/Horse.glb`, (gltf) => {
      const model = gltf.scene;
      model.scale.setScalar(SCALE);
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material) { o.material.roughness = 0.8; o.material.metalness = 0; }
        if (!mesh && o.morphTargetInfluences) mesh = o;
      });
      root.add(model);
      mixer = new THREE.AnimationMixer(model);
      action = mixer.clipAction(gltf.animations[0]);
      action.play();
      action.setEffectiveWeight(0);
      if (mesh) {
        mesh.frustumCulled = false; // morphs move it outside its static bounds
        seat = spineVertex(mesh.geometry, -40, 0);
        seatRear = spineVertex(mesh.geometry, -70, -45);
        seatFront = spineVertex(mesh.geometry, 5, 30);
      }
      resolve();
    }, undefined, reject);
  });

  const a = new THREE.Vector3(), b = new THREE.Vector3();
  let lean = 0;

  // speed in m/s (negative when backing up), turn in [-1, 1].
  function update(dt, speed, turn) {
    const s = Math.abs(speed);
    if (mixer) {
      const w = THREE.MathUtils.smoothstep(s, 0.4, 4);
      action.setEffectiveWeight(w);
      action.timeScale = THREE.MathUtils.clamp(s / STRIDE_SPEED, 0.35, 2.6);
      mixer.update(dt);
    }
    // Lean into the turn, harder at speed.
    const targetLean = -turn * Math.min(1, s / 25) * 0.2;
    lean += (targetLean - lean) * Math.min(1, dt * 4);
    root.rotation.z = lean;

    if (mesh && seat >= 0) {
      morphedVertex(mesh, seat, _v);
      rider.position.set(_v.x * SCALE, _v.y * SCALE - 0.02, _v.z * SCALE);
      morphedVertex(mesh, seatFront, a);
      morphedVertex(mesh, seatRear, b);
      rider.rotation.x = -Math.atan2(a.y - b.y, a.z - b.z) * 0.6;
      rider.rotation.z = -lean * 0.5; // rider stays a bit more upright than the horse
    }
  }

  return { root, rider, update, ready };
}
