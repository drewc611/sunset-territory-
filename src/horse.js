import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createRig } from './character.js';

// Horse.glb: one mesh, 15 morph targets, one 1.5s gallop clip "horse_A_".
// Model units are about 1/0.0095 m, head faces +Z, hooves at y≈0.
const SCALE = 0.0095;
const CLIP_LEN = 1.5;
const IDLE_T = 1.35; // standing frame, see below

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

export function createHorse(scene, base) {
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  scene.add(root);

  // The player's rig. It sits on the horse while mounted; main.js moves it into
  // the scene when the player gets down.
  const rig = createRig();
  const seat = new THREE.Group();
  seat.position.set(0, 1.33, -0.15);
  root.add(seat);
  seat.add(rig.root);

  let mixer = null, action = null, idle = null, mesh = null, seatV = -1, seatFront = -1, seatRear = -1;
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
      const clip = gltf.animations[0];
      action = mixer.clipAction(clip);
      // The model's rest pose is a stride frame, so a standing horse would freeze
      // mid gallop. Hold the clip frame where all four hooves are down and the legs
      // are closest together instead (scored offline over 30 frames: 1.35 s).
      idle = mixer.clipAction(clip.clone());
      idle.play();
      idle.time = IDLE_T;
      idle.timeScale = 0;
      action.time = IDLE_T;
      action.play();
      action.setEffectiveWeight(0);
      if (mesh) {
        mesh.frustumCulled = false; // morphs move it outside its static bounds
        seatV = spineVertex(mesh.geometry, -40, 0);
        seatRear = spineVertex(mesh.geometry, -70, -45);
        seatFront = spineVertex(mesh.geometry, 5, 30);
      }
      resolve();
    }, undefined, reject);
  });

  const a = new THREE.Vector3(), b = new THREE.Vector3();
  let lean = 0;

  // speed in m/s (negative when backing up), turn in [-1, 1], mounted: rider aboard.
  function update(dt, speed, turn, mounted = true) {
    const s = Math.abs(speed);
    if (mixer) {
      const w = THREE.MathUtils.smoothstep(s, 0.4, 4);
      action.setEffectiveWeight(w);
      if (idle) idle.setEffectiveWeight(1 - w);
      action.timeScale = THREE.MathUtils.clamp(s / STRIDE_SPEED, 0.35, 2.6);
      mixer.update(dt);
    }
    // Lean into the turn, harder at speed.
    const targetLean = -turn * Math.min(1, s / 25) * 0.2;
    lean += (targetLean - lean) * Math.min(1, dt * 4);
    root.rotation.z = lean;

    if (mesh && seatV >= 0) {
      morphedVertex(mesh, seatV, _v);
      seat.position.set(_v.x * SCALE, _v.y * SCALE + 0.06, _v.z * SCALE);
      morphedVertex(mesh, seatFront, a);
      morphedVertex(mesh, seatRear, b);
      seat.rotation.x = -Math.atan2(a.y - b.y, a.z - b.z) * 0.6;
      seat.rotation.z = -lean * 0.5; // rider stays a bit more upright than the horse
    }
    if (mounted) rig.update(dt, 'ride', s);
  }

  return { root, rig, seat, update, ready };
}
