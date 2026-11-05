import * as THREE from 'three';
import { hash, fbm, height, masks, nearPOI, riverInfo } from './world.js';
import { nearSite, roadAt } from './sites.js';
import { nearLandmark } from './landmarks.js';
import { Builder, pine, cottonwood, juniper, boulder, slab, cactus, sage, snag } from './models.js';

// Trees, brush and rocks for the territory beyond the valley, streamed in 128 m
// cells around the player. Each cell is generated from its coordinates, so the same
// spot always grows the same trees. All cells share one InstancedMesh per variant,
// so a whole kind of tree is one draw call however many cells are loaded.

const CELL = 128, STEP = 8;            // one candidate spot every 8 m
const RADIUS = { low: 2, medium: 3, high: 4 };
const VALLEY = 190;                    // the valley has its own props inside this square

const cl = (v) => Math.min(1, Math.max(0, v));

// kind → { variants (geometry), radius (collision, per unit scale), scale range }
function kinds() {
  const g = (list) => list.map((m) => m.geo || m);
  return {
    pine: { geos: g([pine(101), pine(102), pine(103)]), r: 0.4, s: [0.8, 1.35] },
    cotton: { geos: g([cottonwood(104), cottonwood(105)]), r: 0.55, s: [0.8, 1.2] },
    juniper: { geos: g([juniper(106), juniper(107), juniper(108)]), r: 0.5, s: [0.7, 1.3] },
    cactus: { geos: g([cactus(109), cactus(110), cactus(111)]), r: 0.35, s: [0.8, 1.25] },
    sage: { geos: g([sage(112), sage(113)]), r: 0, s: [0.7, 1.4] },
    snag: { geos: g([snag(114), snag(115)]), r: 0.3, s: [0.8, 1.2] },
    boulder: { geos: [boulder(116), boulder(117, 0x9a8068), boulder(118, 0x8a5a40)], r: 0.95, s: [0.6, 2.6] },
    slab: { geos: [slab(119), slab(120, 0x9a6a4a)], r: 1.1, s: [0.8, 2.2] },
  };
}

// What grows at a spot: returns a kind name or null. r is a uniform random.
function pick(x, z, h, m, r, grove, slope) {
  const desert = cl((0.86 - m.moisture) / 0.18) * (1 - m.mountain);
  const forest = Math.max(cl((m.moisture - 1.1) / 0.15), cl((h - 80) / 40)) * (1 - m.canyon);
  if (h > 215) return r < 0.03 * slope ? 'slab' : null;
  if (slope > 0.75) return r < 0.06 ? 'slab' : null;
  // Thresholds are cumulative probabilities; groves concentrate trees.
  const t = [];
  t.push(['pine', forest * (0.15 + grove * 0.55) + m.mountain * 0.12 * grove]);
  t.push(['cotton', (1 - desert) * (1 - forest) * (1 - m.canyon) * cl((m.moisture - 0.95) / 0.2) * 0.05 * grove]);
  t.push(['juniper', (1 - forest) * (0.02 + m.canyon * 0.05 + (1 - desert) * 0.02) * (0.5 + grove)]);
  t.push(['cactus', desert * 0.03 + m.canyon * 0.008]);
  t.push(['sage', desert * 0.1 + (1 - forest) * 0.03 + m.canyon * 0.03]);
  t.push(['snag', (desert + m.canyon) * 0.004 + forest * 0.006]);
  t.push(['boulder', 0.006 + m.canyon * 0.04 + m.mountain * 0.03 + slope * 0.04]);
  t.push(['slab', m.canyon * 0.015 + m.mountain * 0.015 * slope]);
  let acc = 0;
  for (const [k, p] of t) { acc += p; if (r < acc) return k; }
  return null;
}

export function createWilds(scene, material, { sampleHeight, collision }) {
  const K = kinds();
  const meshes = {}; // kind -> [InstancedMesh per variant]
  const CAP = { pine: 14000, cotton: 2500, juniper: 6000, cactus: 4000, sage: 9000, snag: 1500, boulder: 6000, slab: 3000 };
  for (const [k, def] of Object.entries(K)) {
    meshes[k] = def.geos.map((geo) => {
      const im = new THREE.InstancedMesh(geo, material, Math.ceil(CAP[k] / def.geos.length));
      im.count = 0;
      im.castShadow = k !== 'sage';
      im.receiveShadow = true;
      im.frustumCulled = false; // spans many cells; bounds would be the whole loaded area anyway
      scene.add(im);
      return im;
    });
  }

  const cells = new Map(); // "cx,cz" -> { inst: {kind: [Float32Array per variant]} }
  let radius = RADIUS.high, centerKey = '', dirty = false;
  const todo = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const hAt = (x, z) => (sampleHeight && sampleHeight(x, z)) ?? height(x, z);

  function buildCell(cx, cz) {
    const lists = {};
    for (const k in K) lists[k] = K[k].geos.map(() => []);
    const circles = [];
    const x0 = cx * CELL, z0 = cz * CELL;
    // Masks change slowly: sample them on a 32 m grid within the cell.
    const coarse = {};
    for (let j = 0; j < CELL / STEP; j++) for (let i = 0; i < CELL / STEP; i++) {
      const id = (cx * 7919 + i) * 104729 + cz * 31 + j;
      const r1 = hash(id * 0.013, 1.7), r2 = hash(id * 0.017, 2.3), r3 = hash(id * 0.019, 3.1);
      const x = x0 + (i + r1) * STEP, z = z0 + (j + r2) * STEP;
      if (Math.abs(x) < VALLEY && Math.abs(z) < VALLEY) continue;
      if (nearPOI(x, z, 6) || nearSite(x, z, 10) || roadAt(x, z) > 0.05 || nearLandmark(x, z, 6)) continue;
      const ck = (i >> 2) * 8 + (j >> 2);
      const m = coarse[ck] || (coarse[ck] = masks(x, z));
      const h = hAt(x, z);
      const slope = Math.min(1.5, Math.hypot(hAt(x + 2, z) - h, hAt(x, z + 2) - h) / 2);
      const grove = cl((fbm(x * 0.012 + 40, z * 0.012 + 70) - 0.85) * 2.2);
      const rv = riverInfo(x, z, m);
      if (rv.core > 0.15) continue;
      const kind = rv.bank > 0.2 && r3 < rv.bank * 0.12 ? 'cotton' : pick(x, z, h, m, r3, grove, slope);
      if (!kind) continue;
      const def = K[kind], vi = Math.floor(hash(id * 0.023, 4.7) * def.geos.length);
      const s = def.s[0] + hash(id * 0.029, 5.3) * (def.s[1] - def.s[0]);
      e.set(0, hash(id * 0.031, 6.1) * 6.28, 0);
      q.setFromEuler(e);
      v.set(x, h - (kind === 'slab' ? 0.3 * s : kind === 'boulder' ? -0.05 * s : 0.15), z);
      sc.setScalar(s);
      m4.compose(v, q, sc);
      lists[kind][vi].push(...m4.elements);
      if (def.r) circles.push({ x, z, r: def.r * s * (kind === 'boulder' || kind === 'slab' ? 1 : 0.8) + 0.2 });
    }
    const inst = {};
    for (const k in lists) inst[k] = lists[k].map((a) => new Float32Array(a));
    const tag = `w${cx},${cz}`;
    if (collision) collision.addCircles(tag, circles);
    return { inst, tag };
  }

  function refill() {
    for (const k in meshes) {
      meshes[k].forEach((im, vi) => {
        const arr = im.instanceMatrix.array, cap = im.instanceMatrix.count;
        let n = 0;
        for (const c of cells.values()) {
          const a = c.inst[k][vi], cnt = a.length / 16;
          if (n + cnt > cap) break;
          arr.set(a, n * 16); n += cnt;
        }
        im.count = n;
        im.instanceMatrix.needsUpdate = true;
      });
    }
    dirty = false;
  }


  // --- far trees ---------------------------------------------------------------
  // Beyond the full detail cells, out to the haze: a ring of very cheap trees
  // (one cone or one blob, no trunk, no shadow, no collision) on a coarser 16 m
  // grid with four times the odds, so the forest reads the same from a distance.
  const FAR_RADIUS = { low: 0, medium: 6, high: 8 };
  let farRadius = FAR_RADIUS.high, farCenter = '';
  const farCells = new Map();
  const farTodo = [];
  const lowGeo = (geo, color) => { const b = new Builder(); b.add(geo, color, {}, { shade: 0.35, sway: 0.3 }); return b.build(); };
  const FAR_KINDS = {
    pine: lowGeo(new THREE.ConeGeometry(2.3, 10, 6).translate(0, 7, 0), 0x3f5c2c),
    cotton: lowGeo(new THREE.IcosahedronGeometry(3.2, 0).scale(1, 0.8, 1).translate(0, 7, 0), 0x5e7a34),
    juniper: lowGeo(new THREE.IcosahedronGeometry(1.4, 0).translate(0, 1.6, 0), 0x3f5230),
  };
  const farMesh = {};
  for (const [k, geo] of Object.entries(FAR_KINDS)) {
    const im = new THREE.InstancedMesh(geo, material, 20000);
    im.count = 0; im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false;
    scene.add(im); farMesh[k] = im;
  }
  function buildFarCell(cx, cz) {
    const out = { pine: [], cotton: [], juniper: [] };
    const x0 = cx * CELL, z0 = cz * CELL, FS = 16;
    for (let j = 0; j < CELL / FS; j++) for (let i = 0; i < CELL / FS; i++) {
      const id = (cx * 7919 + i) * 104729 + cz * 31 + j + 0.5;
      const x = x0 + (i + hash(id * 0.013, 1.9)) * FS, z = z0 + (j + hash(id * 0.017, 2.7)) * FS;
      if (Math.abs(x) < VALLEY && Math.abs(z) < VALLEY) continue;
      const m = masks(x, z);
      const grove = cl((fbm(x * 0.012 + 40, z * 0.012 + 70) - 0.85) * 2.2);
      // Rough odds first, so most spots skip the height lookup.
      const r = hash(id * 0.019, 3.3);
      const forest = cl((m.moisture - 1.1) / 0.15) * (1 - m.canyon);
      const desert = cl((0.86 - m.moisture) / 0.18) * (1 - m.mountain);
      const pPine = (forest * (0.15 + grove * 0.55) + m.mountain * 0.12 * grove) * 4;
      const pCotton = (1 - desert) * (1 - forest) * (1 - m.canyon) * cl((m.moisture - 0.95) / 0.2) * 0.05 * grove * 4;
      const pJun = (1 - forest) * (0.02 + m.canyon * 0.05 + (1 - desert) * 0.02) * (0.5 + grove) * 4;
      const kind = r < pPine ? 'pine' : r < pPine + pCotton ? 'cotton' : r < pPine + pCotton + pJun ? 'juniper' : null;
      if (!kind) continue;
      if (nearPOI(x, z, 6) || nearSite(x, z, 10) || riverInfo(x, z, m).core > 0.15 || nearLandmark(x, z, 6)) continue;
      const h = height(x, z);
      if (h > 215) continue;
      const s = 0.8 + hash(id * 0.029, 5.9) * 0.5;
      e.set(0, hash(id * 0.031, 6.3) * 6.28, 0); q.setFromEuler(e);
      v.set(x, h - 0.3, z); sc.setScalar(s); m4.compose(v, q, sc);
      out[kind].push(...m4.elements);
    }
    for (const k in out) out[k] = new Float32Array(out[k]);
    return out;
  }
  function refillFar() {
    for (const [k, im] of Object.entries(farMesh)) {
      const arr = im.instanceMatrix.array, cap = im.instanceMatrix.count;
      let n = 0;
      for (const c of farCells.values()) { const a = c[k], cnt = a.length / 16; if (n + cnt > cap) break; arr.set(a, n * 16); n += cnt; }
      im.count = n; im.instanceMatrix.needsUpdate = true;
    }
  }
  function updateFar(px, pz) {
    const ccx = Math.floor(px / CELL), ccz = Math.floor(pz / CELL), ck = `${ccx},${ccz}`;
    let dirtyFar = false;
    if (ck !== farCenter) {
      farCenter = ck;
      farTodo.length = 0;
      const want = new Set();
      for (let dz = -farRadius; dz <= farRadius; dz++) for (let dx = -farRadius; dx <= farRadius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) <= radius) continue; // the full detail cells cover this
        const key = `${ccx + dx},${ccz + dz}`;
        want.add(key);
        if (!farCells.has(key)) farTodo.push([ccx + dx, ccz + dz, dx * dx + dz * dz]);
      }
      farTodo.sort((a, b) => a[2] - b[2]);
      for (const key of farCells.keys()) if (!want.has(key)) { farCells.delete(key); dirtyFar = true; }
    }
    if (farTodo.length) { const [cx, cz] = farTodo.shift(); farCells.set(`${cx},${cz}`, buildFarCell(cx, cz)); dirtyFar = true; }
    if (dirtyFar) refillFar();
  }

  function update(px, pz) {
    updateFar(px, pz);
    const ccx = Math.floor(px / CELL), ccz = Math.floor(pz / CELL), ck = `${ccx},${ccz}`;
    if (ck !== centerKey) {
      centerKey = ck;
      todo.length = 0;
      const want = new Set();
      for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
        const key = `${ccx + dx},${ccz + dz}`;
        want.add(key);
        if (!cells.has(key)) todo.push([ccx + dx, ccz + dz, dx * dx + dz * dz]);
      }
      todo.sort((a, b) => a[2] - b[2]); // nearest first
      for (const [key, c] of cells) if (!want.has(key)) { if (collision) collision.removeTag(c.tag); cells.delete(key); dirty = true; }
    }
    // A couple of cells per frame keeps the cost per frame small.
    for (let i = 0; i < 2 && todo.length; i++) {
      const [cx, cz] = todo.shift();
      cells.set(`${cx},${cz}`, buildCell(cx, cz));
      dirty = true;
    }
    if (dirty) refill();
  }

  // Build everything around (px, pz) at once, for the loading screen.
  function settle(px, pz) {
    update(px, pz);
    while (todo.length) { const [cx, cz] = todo.shift(); cells.set(`${cx},${cz}`, buildCell(cx, cz)); }
    while (farTodo.length) { const [cx, cz] = farTodo.shift(); farCells.set(`${cx},${cz}`, buildFarCell(cx, cz)); }
    refill(); refillFar();
  }

  function setTier(name) { radius = RADIUS[name] || RADIUS.high; farRadius = FAR_RADIUS[name] ?? FAR_RADIUS.high; centerKey = ''; farCenter = ''; }

  return { update, settle, setTier };
}
