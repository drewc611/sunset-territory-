import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { height, hash } from './world.js';
import { roads } from './sites.js';
import { Builder, wagon } from './models.js';
import { npcGeometry, personMaterial, PALETTES } from './character.js';

// Covered wagons on the dirt roads. One per road, hauling between towns at a walk,
// resting a while at each end and then turning back. All of them move all the time
// (it's cheap, there are a few dozen); only the ones near you are drawn, as three
// instanced meshes: wagon, horse body, horse legs, plus one for the drivers.

const DRAW = 1500, MAX = 24, KEEP_RIGHT = 1.4;
const COAT = 0x5a3a26, DARK = 0x2a1a12;

function horseBody() {
  const b = new Builder();
  b.add(new THREE.BoxGeometry(0.62, 0.62, 1.7), COAT, {}, { shade: 0.3 });                        // barrel
  b.add(new THREE.BoxGeometry(0.3, 0.75, 0.34), COAT, { y: 0.4, z: 0.85, rx: 0.6 });               // neck, leaning forward
  b.add(new THREE.BoxGeometry(0.26, 0.3, 0.58), COAT, { y: 0.72, z: 1.18, rx: 0.5 });              // head
  b.add(new THREE.BoxGeometry(0.1, 0.5, 0.12), DARK, { y: -0.05, z: -0.9, rx: 0.3 });              // tail
  b.add(new THREE.BoxGeometry(0.66, 0.08, 0.5), 0x3a2416, { y: 0.32, z: 0.15 });                  // collar strap
  return b.build();
}
function horseLeg() {
  const b = new Builder();
  b.add(new THREE.BoxGeometry(0.11, 0.95, 0.11), COAT, { y: -0.475 }, { shade: 0.35 });
  b.add(new THREE.BoxGeometry(0.12, 0.1, 0.14), DARK, { y: -0.92 });
  return b.build();
}
function driver() {
  const g = npcGeometry(PALETTES.rancher);
  const head = g.head.clone().translate(0, g.headY, 0);
  return mergeGeometries([g.body, head], false).scale(0.92, 0.92, 0.92);
}

export function createTraffic(scene, material) {
  const mk = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.castShadow = true; m.frustumCulled = false; scene.add(m); return m; };
  const wagons = mk(wagon(), material, MAX), bodies = mk(horseBody(), material, MAX), legs = mk(horseLeg(), material, MAX * 4), drivers = mk(driver(), personMaterial, MAX);

  // One traveler per road, starting somewhere along it.
  const list = roads().map((rd, i) => {
    const len = Math.hypot(rd.bx - rd.ax, rd.bz - rd.az);
    return { rd, len, t: hash(i, 3.1), dir: hash(i, 5.7) > 0.5 ? 1 : -1, speed: 2.4 + hash(i, 7.3) * 1.2, wait: 0, phase: hash(i, 9.9) * 6.28, x: 0, z: 0, h: 0 };
  });

  const m4 = new THREE.Matrix4(), part = new THREE.Matrix4(), rot = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);

  function update(dt, px, pz) {
    let n = 0;
    for (const w of list) {
      const { rd, len } = w;
      if (w.wait > 0) w.wait -= dt;
      else {
        w.t += (w.dir * w.speed * dt) / len;
        if (w.t > 1 || w.t < 0) { w.t = Math.min(1, Math.max(0, w.t)); w.dir = -w.dir; w.wait = 20 + Math.random() * 40; } // rest at the town, then head back
        w.phase += dt * w.speed * 2.2;
      }
      const dx = (rd.bx - rd.ax) / len, dz = (rd.bz - rd.az) / len;
      const fx = dx * w.dir, fz = dz * w.dir;          // direction of travel
      // Keep to the right of the center line, stopping short of the town square.
      const t = 0.02 + w.t * 0.96;
      w.x = rd.ax + (rd.bx - rd.ax) * t - fz * KEEP_RIGHT;
      w.z = rd.az + (rd.bz - rd.az) * t + fx * KEEP_RIGHT;
      w.h = Math.atan2(fx, fz);
      if (n >= MAX || Math.hypot(w.x - px, w.z - pz) > DRAW) continue;

      const y = height(w.x, w.z), moving = w.wait <= 0;
      q.setFromAxisAngle(up, w.h);
      v.set(w.x, y, w.z); m4.compose(v, q, one);
      wagons.setMatrixAt(n, m4);
      part.makeTranslation(0, 0.95, 0.9); drivers.setMatrixAt(n, part.premultiply(m4));
      // The horse walks ahead of the tongue.
      const hz = 4.3, bob = moving ? Math.abs(Math.sin(w.phase)) * 0.03 : 0;
      const hy = height(w.x + fx * hz, w.z + fz * hz) - y;
      part.makeTranslation(0, hy + 1.32 + bob, hz); bodies.setMatrixAt(n, part.clone().premultiply(m4));
      [[0.2, 0.62, 0], [-0.2, 0.62, Math.PI], [0.2, -0.62, Math.PI], [-0.2, -0.62, 0]].forEach(([lx, lz, ph], k) => {
        rot.makeRotationX(moving ? Math.sin(w.phase + ph) * 0.35 : 0);
        part.makeTranslation(lx, hy + 1.18, hz + lz).multiply(rot);
        legs.setMatrixAt(n * 4 + k, part.premultiply(m4));
      });
      n++;
    }
    for (const [m, k] of [[wagons, 1], [bodies, 1], [drivers, 1], [legs, 4]]) { m.count = n * k; m.instanceMatrix.needsUpdate = true; }
  }

  return { update, list: () => list };
}
