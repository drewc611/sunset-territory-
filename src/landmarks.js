import * as THREE from 'three';
import { BIG, hash, height, masks, riverInfo } from './world.js';
import { sites } from './sites.js';
import { Builder, rng, wagon, pine } from './models.js';

// Things to find out in the territory, away from any settlement: hoodoo spires in
// canyon country, a wagon that never made it across the desert, a pine older than
// anyone, a cairn on a summit, a ruined fort, a lone grave on the grass. Each gets a
// discovery stamp and a mark on the map. Placed per 2.5 km square from the square's
// coordinates, so they're the same every game. Pure placement; meshes stream in
// within 2 km.

const CELL = 2500, KEEP_CLEAR = 1300, FROM_SITE = 700, LOAD = 2000, UNLOAD = 2400;

const KINDS = {
  hoodoos: { names: ['The Chimneys', 'Hoodoo Garden', 'Goblin Spires', 'The Stacks', 'Devil’s Pickets'], sub: 'Rock left standing when the rest washed away', r: 16 },
  wreck: { names: ['Wagon Wreck', 'Emigrant’s Rest', 'The Broken Axle', 'Thirst Wagon'], sub: 'Somebody turned back here, or didn’t', r: 10 },
  bigpine: { names: ['Grandfather Pine', 'The Old Man', 'Lightning Pine', 'Council Tree'], sub: 'Older than anyone who could tell you', r: 12 },
  cairn: { names: ['Surveyor’s Cairn', 'Lookout Cairn', 'Pike’s Marker', 'High Cairn'], sub: 'A pile of stones and a long view', r: 10 },
  fort: { names: ['Fort Hale', 'Fort Larkin', 'Old Fort Ruin', 'Fort Sorrel'], sub: 'Adobe walls going back to dirt', r: 22 },
  grave: { names: ['Lone Grave', 'Prairie Grave', 'Unmarked Grave', 'The Cross'], sub: 'No name on it anymore', r: 8 },
};

let LIST = null;
function build() {
  LIST = [];
  const used = {};
  const n = Math.ceil(BIG / CELL), set = sites();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const seed = i * 523 + j * 1291 + 17;
    if (hash(seed, 0.7) > 0.55) continue;
    const x = -BIG / 2 + (i + 0.2 + hash(seed, 1.7) * 0.6) * CELL, z = -BIG / 2 + (j + 0.2 + hash(seed, 2.1) * 0.6) * CELL;
    if (Math.hypot(x, z) < KEEP_CLEAR || Math.max(Math.abs(x), Math.abs(z)) > BIG / 2 - 300) continue;
    if (riverInfo(x, z).bank > 0) continue;
    if (set.some((s) => Math.hypot(s.x - x, s.z - z) < FROM_SITE)) continue;
    const m = masks(x, z), h = height(x, z), r = hash(seed, 3.3);
    let kind;
    if (m.canyon > 0.5) kind = 'hoodoos';
    else if (m.mountain > 0.5 || h > 170) kind = r < 0.5 ? 'cairn' : 'bigpine';
    else if (m.moisture > 1.1) kind = r < 0.6 ? 'bigpine' : 'grave';
    else if (m.moisture < 0.86) kind = r < 0.6 ? 'wreck' : 'fort';
    else kind = r < 0.45 ? 'fort' : r < 0.75 ? 'grave' : 'wreck';
    const K = KINDS[kind], k = used[kind] = (used[kind] || 0);
    used[kind]++;
    const name = K.names[k % K.names.length] + (k >= K.names.length ? ` ${['II', 'III', 'IV'][Math.floor(k / K.names.length) - 1] || ''}` : '');
    LIST.push({ name: name.trim(), sub: K.sub, kind, x, z, r: K.r, type: 'landmark', seed, generated: true });
  }
}
export function landmarks() { if (!LIST) build(); return LIST; }
export function nearLandmark(x, z, pad = 0) {
  for (const l of landmarks()) if (Math.abs(l.x - x) < l.r + pad && Math.abs(l.z - z) < l.r + pad && Math.hypot(l.x - x, l.z - z) < l.r + pad) return l;
  return null;
}

// --- models: { geo, boxes: [{x, z, w, d}] } in local space ---------------------
const MODELS = {
  hoodoos(seed) {
    const R = rng(seed), b = new Builder(), boxes = [];
    const tones = [0xb87a50, 0xa86a44, 0xc89064, 0x9a5e3c];
    for (let s = 0; s < 6; s++) {
      const a = R() * 6.28, d = 2 + R() * 9, x = Math.cos(a) * d, z = Math.sin(a) * d;
      const tiers = 3 + Math.floor(R() * 4);
      let y = 0, w = 2.2 + R() * 1.4;
      for (let t = 0; t < tiers; t++) {
        const hh = 1.6 + R() * 1.6;
        b.add(new THREE.CylinderGeometry(w * 0.8, w, hh, 7), tones[(s + t) % 4], { x, y: y + hh / 2, z, ry: R() * 6 }, { jitter: 0.6, seed: seed + s * 10 + t, shade: 0.3 });
        y += hh; w *= 0.78;
      }
      b.add(new THREE.CylinderGeometry(w * 1.6, w * 1.1, 0.7, 7), 0x7a4a30, { x, y: y + 0.35, z }, { jitter: 0.3, seed: seed + s }); // cap rock
      boxes.push({ x, z, w: 3.6, d: 3.6 });
    }
    return { geo: b.build(), boxes };
  },
  wreck(seed) {
    const R = rng(seed), b = new Builder();
    const wg = wagon();
    const tilted = wg.clone().applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.08, 0.4, 0.32)));
    tilted.deleteAttribute('normal'); b.parts.push(tilted);
    b.add(new THREE.CylinderGeometry(0.6, 0.6, 0.1, 10), 0x4a3424, { x: 2.4, y: 0.06, z: 1.2, rx: Math.PI / 2 - 0.1 }); // a wheel off
    for (let i = 0; i < 5; i++) b.add(new THREE.BoxGeometry(0.9, 0.12, 0.25), 0x6a4a30, { x: -2 + R() * 4, y: 0.06, z: -3 + R() * 2, ry: R() * 3 });
    b.add(new THREE.BoxGeometry(0.3, 0.18, 0.4), 0xe8e0d0, { x: -1.8, y: 0.1, z: 2.4 }); // skull
    return { geo: b.build(), boxes: [{ x: 0, z: 0, w: 2.2, d: 4 }] };
  },
  bigpine(seed) {
    const b = new Builder();
    const p = pine(seed).geo.clone().scale(2.6, 2.8, 2.6);
    p.deleteAttribute('normal'); b.parts.push(p);
    for (let i = 0; i < 5; i++) { const a = i * 1.26; b.add(new THREE.CylinderGeometry(0.15, 0.35, 3.2, 5), 0x4a301e, { x: Math.cos(a) * 1.2, y: 0.25, z: Math.sin(a) * 1.2, rz: Math.cos(a) * 1.25, rx: -Math.sin(a) * 1.25 }); } // roots
    return { geo: b.build(), boxes: [{ x: 0, z: 0, w: 2.2, d: 2.2 }] };
  },
  cairn(seed) {
    const R = rng(seed), b = new Builder();
    let y = 0, w = 2.4;
    for (let i = 0; i < 7; i++) { const hh = 0.5 + R() * 0.3; b.add(new THREE.DodecahedronGeometry(w / 2, 0), i % 2 ? 0x8a8478 : 0x9c958a, { y: y + hh / 2, sy: hh / w * 1.4, ry: R() * 6 }, { jitter: 0.15, seed: seed + i }); y += hh * 0.8; w *= 0.8; }
    b.add(new THREE.CylinderGeometry(0.05, 0.05, 2, 4), 0x5a3a20, { y: y + 1 });
    b.add(new THREE.BoxGeometry(0.02, 0.4, 0.6), 0x9a2a20, { y: y + 1.7, z: 0.3 }); // rag flag
    return { geo: b.build(), boxes: [{ x: 0, z: 0, w: 2.4, d: 2.4 }] };
  },
  fort(seed) {
    const R = rng(seed), b = new Builder(), boxes = [];
    const S = 16, adobe = [0xb89a74, 0xa88a66, 0xc2a680];
    for (let side = 0; side < 4; side++) {
      for (let k = 0; k < 6; k++) {
        if (side === 0 && (k === 2 || k === 3)) continue; // the gate
        if (R() < 0.18) continue;                         // fallen
        const t = -S / 2 + (k + 0.5) * (S / 6), hh = 1 + R() * 2.4;
        const [x, z, w, d] = side % 2 ? [side === 1 ? S / 2 : -S / 2, t, 0.8, S / 6] : [t, side === 0 ? S / 2 : -S / 2, S / 6, 0.8];
        b.add(new THREE.BoxGeometry(w, hh, d), adobe[k % 3], { x, y: hh / 2, z }, { jitter: 0.25, seed: seed + side * 10 + k, shade: 0.35 });
        boxes.push({ x, z, w: w + 0.2, d: d + 0.2 });
      }
    }
    b.add(new THREE.BoxGeometry(3.4, 4.5, 3.4), adobe[0], { x: -S / 2, y: 2.25, z: -S / 2 }, { jitter: 0.3, seed, shade: 0.35 }); // corner tower
    boxes.push({ x: -S / 2, z: -S / 2, w: 3.6, d: 3.6 });
    b.add(new THREE.CylinderGeometry(0.06, 0.06, 6, 4), 0x5a3a20, { x: S / 2 - 1, y: 3, z: -S / 2 + 1 }); // bare flagpole
    return { geo: b.build(), boxes };
  },
  grave() {
    const b = new Builder();
    b.add(new THREE.BoxGeometry(1.1, 0.35, 2.2), 0x7a6248, { y: 0.1 }, { jitter: 0.2, seed: 3 });
    b.add(new THREE.BoxGeometry(0.12, 1.3, 0.1), 0x8a7458, { y: 0.65, z: -1.1, rz: 0.08 });
    b.add(new THREE.BoxGeometry(0.7, 0.12, 0.1), 0x8a7458, { y: 1.0, z: -1.1, rz: 0.08 });
    for (let i = 0; i < 6; i++) b.add(new THREE.DodecahedronGeometry(0.22, 0), 0x8a8478, { x: Math.cos(i) * 0.7, y: 0.12, z: Math.sin(i) * 1.2 });
    return { geo: b.build(), boxes: [{ x: 0, z: 0, w: 1.2, d: 2.4 }] };
  },
};

export function createLandmarks(scene, material, { collision }) {
  const loaded = new Map();
  function load(l) {
    const m = MODELS[l.kind](l.seed);
    const rot = hash(l.seed, 8.8) * 6.28;
    let y = Infinity;
    for (let a = 0; a < 6.28; a += 0.7) y = Math.min(y, height(l.x + Math.cos(a) * 3, l.z + Math.sin(a) * 3));
    const mesh = new THREE.Mesh(m.geo, material);
    mesh.position.set(l.x, Math.min(y, height(l.x, l.z)) - 0.15, l.z);
    mesh.rotation.y = rot;
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    const c = Math.cos(rot), s = Math.sin(rot), tag = `l:${l.name}`;
    if (collision) collision.addBoxes(tag, m.boxes.map((b) => ({ x: l.x + b.x * c + b.z * s, z: l.z - b.x * s + b.z * c, w: b.w, d: b.d, rot })));
    loaded.set(l.name, { mesh, tag });
  }
  function drop(name) {
    const e = loaded.get(name);
    scene.remove(e.mesh); e.mesh.geometry.dispose();
    if (collision) collision.removeTag(e.tag);
    loaded.delete(name);
  }
  let next = 0;
  function update(px, pz) {
    const list = landmarks();
    if (!list.length) return;
    for (let k = 0; k < 6; k++) {
      const l = list[next = (next + 1) % list.length], d = Math.hypot(l.x - px, l.z - pz);
      if (!loaded.has(l.name) && d < LOAD) { load(l); break; }
      if (loaded.has(l.name) && d > UNLOAD) drop(l.name);
    }
  }
  function settle(px, pz) { for (const l of landmarks()) if (!loaded.has(l.name) && Math.hypot(l.x - px, l.z - pz) < LOAD) load(l); }
  return { update, settle, loadedCount: () => loaded.size };
}
