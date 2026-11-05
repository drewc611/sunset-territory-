import * as THREE from 'three';
import { hash, height, masks, riverInfo, valleyBlend } from './world.js';
import { sites } from './sites.js';
import { Builder } from './models.js';

// Herds in the territory: deer in grassland and forest, pronghorn on the dry flats,
// cattle at the ranches. Deer and pronghorn graze until you ride close, then bolt;
// cattle just wander. Herds are placed per 512 m cell from the cell's coordinates
// and stream with the player. Each species is two draw calls: one instanced mesh
// for bodies (with neck and head) and one for legs, which swing with the gait.

const CELL = 512, RADIUS = 2;
const SPECIES = {
  deer: { coat: 0x8a5a36, belly: 0xd8c7a1, len: 1.3, ht: 0.95, legLen: 0.82, flee: 34, run: 13, walk: 0.9, size: [3, 6], antlers: true },
  pronghorn: { coat: 0xc08a50, belly: 0xf0e4cc, len: 1.15, ht: 0.85, legLen: 0.72, flee: 45, run: 16, walk: 0.8, size: [4, 8] },
  cattle: { coat: 0x6a4030, belly: 0xd8cfbd, len: 1.8, ht: 1.25, legLen: 0.7, flee: 0, run: 0, walk: 0.5, size: [5, 9] },
};

function bodyGeo(sp) {
  const b = new Builder(), L = sp.len, H = sp.ht;
  b.add(new THREE.BoxGeometry(L * 0.42, H * 0.42, L), sp.coat, { y: 0 }, { shade: 0.35 });          // barrel
  b.add(new THREE.BoxGeometry(L * 0.36, H * 0.12, L * 0.8), sp.belly, { y: -H * 0.2 });              // belly
  b.add(new THREE.BoxGeometry(L * 0.18, H * 0.5, L * 0.2), sp.coat, { y: H * 0.25, z: L * 0.5, rx: -0.5 }); // neck
  b.add(new THREE.BoxGeometry(L * 0.18, L * 0.18, L * 0.34), sp.coat, { y: H * 0.5, z: L * 0.66 });  // head
  b.add(new THREE.BoxGeometry(L * 0.12, L * 0.1, L * 0.1), 0x1a120c, { y: H * 0.47, z: L * 0.84 });  // nose
  b.add(new THREE.BoxGeometry(L * 0.1, L * 0.14, L * 0.06), sp.belly, { y: H * 0.05, z: -L * 0.52 }); // tail patch
  for (const sx of [-1, 1]) b.add(new THREE.ConeGeometry(0.05, 0.16, 4), sp.coat, { x: sx * L * 0.1, y: H * 0.64, z: L * 0.58, rz: sx * 0.6 }); // ears
  if (sp.antlers) for (const sx of [-1, 1]) {
    b.add(new THREE.CylinderGeometry(0.015, 0.025, 0.4, 4), 0xd8c8a8, { x: sx * 0.08, y: H * 0.78, z: L * 0.6, rz: sx * 0.5 });
    b.add(new THREE.CylinderGeometry(0.012, 0.02, 0.22, 4), 0xd8c8a8, { x: sx * 0.16, y: H * 0.88, z: L * 0.7, rx: 0.7 });
  }
  if (sp === SPECIES.cattle) b.add(new THREE.BoxGeometry(L * 0.19, L * 0.12, L * 0.2), 0xe0d4bc, { y: H * 0.47, z: L * 0.74 }); // white face
  return b.build();
}
function legGeo(sp) {
  const b = new Builder();
  b.add(new THREE.BoxGeometry(0.07, sp.legLen, 0.07), sp.coat, { y: -sp.legLen / 2 }, { shade: 0.3 });
  b.add(new THREE.BoxGeometry(0.075, 0.08, 0.09), 0x1a120c, { y: -sp.legLen + 0.04 });
  return b.build();
}

export function createWildlife(scene, material, { sampleHeight }) {
  const meshes = {};
  for (const [name, sp] of Object.entries(SPECIES)) {
    const body = new THREE.InstancedMesh(bodyGeo(sp), material, 160);
    const legs = new THREE.InstancedMesh(legGeo(sp), material, 640);
    for (const m of [body, legs]) { m.count = 0; m.castShadow = true; m.frustumCulled = false; scene.add(m); }
    meshes[name] = { body, legs };
  }
  const hAt = (x, z) => (sampleHeight && sampleHeight(x, z)) ?? height(x, z);
  const herds = new Map(); // cell key -> [animal]
  let centerKey = '';

  function spawnCell(cx, cz) {
    const out = [];
    const seed = cx * 7349 + cz * 1931;
    const x = (cx + 0.2 + hash(seed, 1.1) * 0.6) * CELL, z = (cz + 0.2 + hash(seed, 2.3) * 0.6) * CELL;
    let species = null;
    if (valleyBlend(x, z) >= 1 && riverInfo(x, z).core < 0.1) {
      const m = masks(x, z), r = hash(seed, 3.7);
      if (m.mountain < 0.5 && m.canyon < 0.5) {
        if (m.moisture > 0.95 && r < 0.45) species = 'deer';
        else if (m.moisture < 0.95 && r < 0.4) species = 'pronghorn';
      }
    }
    if (species) out.push(...herd(species, x, z, seed));
    // Cattle at any ranch in this cell.
    for (const s of sites()) {
      if (s.kind !== 'ranch' || Math.floor(s.x / CELL) !== cx || Math.floor(s.z / CELL) !== cz) continue;
      const a = s.axis + Math.PI / 2;
      out.push(...herd('cattle', s.x + Math.cos(a) * 45, s.z + Math.sin(a) * 45, seed + 99, s));
    }
    return out;
  }
  function herd(species, x, z, seed, home = null) {
    const sp = SPECIES[species], [n0, n1] = sp.size, n = n0 + Math.floor(hash(seed, 4.9) * (n1 - n0 + 1));
    const list = [];
    for (let i = 0; i < n; i++) {
      const ax = x + (hash(seed + i, 5.1) - 0.5) * 24, az = z + (hash(seed + i, 6.3) - 0.5) * 24;
      list.push({ species, sp, x: ax, z: az, hx: x, hz: z, heading: hash(seed + i, 7.7) * 6.28, speed: 0, phase: hash(seed + i, 8.1) * 6.28,
        flee: 0, wander: hash(seed + i, 9.3) * 6, home });
    }
    return list;
  }

  const m4 = new THREE.Matrix4(), leg = new THREE.Matrix4(), rot = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);

  function update(dt, player, t) {
    const ccx = Math.floor(player.x / CELL), ccz = Math.floor(player.z / CELL), ck = `${ccx},${ccz}`;
    if (ck !== centerKey) {
      centerKey = ck;
      const want = new Set();
      for (let dz = -RADIUS; dz <= RADIUS; dz++) for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        const key = `${ccx + dx},${ccz + dz}`;
        want.add(key);
        if (!herds.has(key)) herds.set(key, spawnCell(ccx + dx, ccz + dz));
      }
      for (const key of herds.keys()) if (!want.has(key)) herds.delete(key);
    }
    const counts = {};
    for (const name in meshes) counts[name] = 0;
    for (const list of herds.values()) for (const a of list) {
      const sp = a.sp;
      const dx = a.x - player.x, dz = a.z - player.z, d = Math.hypot(dx, dz);
      // Startle: run directly away, the herd scattering a little.
      if (sp.flee && d < sp.flee && player.speed > 0.5) a.flee = 6;
      let want = 0;
      if (a.flee > 0) {
        a.flee -= dt;
        let away = Math.atan2(dx, dz) + Math.sin(a.phase * 0.1) * 0.4, diff = away - a.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        a.heading += Math.max(-3 * dt, Math.min(3 * dt, diff));
        want = sp.run;
      } else {
        // Graze: drift in short walks, turning back toward the herd's center.
        a.wander -= dt;
        if (a.wander < 0) {
          a.wander = 3 + Math.random() * 6;
          const back = Math.atan2(a.hx - a.x, a.hz - a.z), far = Math.hypot(a.hx - a.x, a.hz - a.z);
          a.target = far > 25 ? back : a.heading + (Math.random() - 0.5) * 2;
          a.walking = Math.random() < 0.5;
        }
        if (a.target !== undefined) { let diff = a.target - a.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); a.heading += diff * Math.min(1, dt); }
        want = a.walking ? sp.walk : 0;
      }
      a.speed += (want - a.speed) * Math.min(1, dt * 3);
      const nx = a.x + Math.sin(a.heading) * a.speed * dt, nz = a.z + Math.cos(a.heading) * a.speed * dt;
      if (riverInfo(nx, nz).depth < 0.3) { a.x = nx; a.z = nz; } else a.heading += Math.PI * 0.5; // don't run into rivers
      // When the run ends, the herd settles where it stopped.
      if (a.flee <= 0 && a.speed > 4) { a.hx = a.x; a.hz = a.z; }
      a.phase += dt * (1.5 + a.speed * 0.9);

      const y = hAt(a.x, a.z);
      const bob = a.speed > 4 ? Math.abs(Math.sin(a.phase)) * 0.12 : 0;
      q.setFromAxisAngle(up, a.heading);
      v.set(a.x, y + sp.legLen + bob, a.z);
      m4.compose(v, q, one);
      const M = meshes[a.species], i = counts[a.species]++;
      if (i >= M.body.instanceMatrix.count) continue;
      M.body.setMatrixAt(i, m4);
      // Legs: diagonal pairs at a trot or walk, gathered and stretched at a run.
      const run = a.speed > 4, amp = run ? 0.75 : a.speed > 0.1 ? 0.35 : 0;
      const offs = [[0.14, 0.38, 0], [-0.14, 0.38, Math.PI], [0.14, -0.38, Math.PI], [-0.14, -0.38, 0]];
      offs.forEach(([lx, lz, ph], k) => {
        const ang = Math.sin(a.phase + (run ? (lz > 0 ? 0 : 1.2) : ph)) * amp;
        rot.makeRotationX(ang);
        leg.makeTranslation(lx * sp.len, -sp.ht * 0.18, lz * sp.len).multiply(rot);
        M.legs.setMatrixAt(i * 4 + k, leg.premultiply(m4));
      });
    }
    for (const name in meshes) {
      const M = meshes[name], n = Math.min(counts[name], M.body.instanceMatrix.count);
      M.body.count = n; M.legs.count = n * 4;
      M.body.instanceMatrix.needsUpdate = true; M.legs.instanceMatrix.needsUpdate = true;
    }
  }

  // Nearest few animals, for tests and the debug hook.
  function list() { return [...herds.values()].flat(); }
  return { update, list };
}
