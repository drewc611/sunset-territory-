import { BIG, naturalHeight as bigHeight, masks, hash } from './world.js';

// Settlements across the territory and the dirt roads between them. Pure and
// deterministic, so the main thread and the terrain worker agree on every site.
// Computed lazily on first use (this module and world.js import each other).
//
// A site: { name, sub, kind: 'town' | 'ranch' | 'camp', x, z, r, base, axis }
//   base: flattened ground height; axis: main street direction (towns).

const CELL = 1800;           // one candidate site per 1.8 km square
const ROAD_CELL = 250;
const KEEP_CLEAR = 1100;     // no generated sites this close to the valley

const FIRST = ['Copper', 'Dry', 'Juniper', 'Lone', 'Red', "Cutter's", 'Bitter', 'Saddle', 'Gallow', 'Sweetwater', 'Iron', 'Mesa',
  'Coyote', 'Rattle', 'Silver', 'Broken', 'Thistle', 'Quarry', 'Pike', 'Hatcher', 'Ember', 'Dutch', 'Cinder', 'Antler', 'Willow',
  'Granite', 'Buckle', 'Tinder', 'Larkin', 'Sorrel', 'Wolfe', 'Marrow', 'Ochre', 'Carver', 'Halfmoon', 'Deacon'];
const LAST = {
  town: ['Springs', 'Wells', 'Junction', 'Bend', 'Gulch', 'Flat', 'Crossing', 'Fork'],
  ranch: ['Ranch', 'Spread', 'Station', 'Place'],
  camp: ['Camp', 'Draw', 'Tanks', 'Hollow'],
};
const SUB = {
  town: ['Trail town with a saloon and a store', 'Stage stop, a well and a few roofs', 'Freight town on the main road', 'Quiet town, too far from the rail'],
  ranch: ['Cattle spread, house and corral', 'Horse ranch on good grass', 'Homestead with a windbreak of cottonwoods'],
  camp: ['Survey camp, two tents and a fire', 'Hunters’ camp, smoke most evenings', 'Prospectors working the draw'],
};
const R = { town: 42, ranch: 22, camp: 14 };

const ss = (a, b, t) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };

let SITES = null, ROADS = null, siteGrid = null, roadGrid = null;

function slopeAt(x, z) {
  const h = bigHeight(x, z);
  let m = 0;
  for (const [dx, dz] of [[25, 0], [-25, 0], [0, 25], [0, -25]]) m = Math.max(m, Math.abs(bigHeight(x + dx, z + dz) - h));
  return m / 25;
}

function build() {
  SITES = [];
  const used = new Set();
  const n = Math.ceil(BIG / CELL);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const seed = i * 131 + j * 977;
    // Try a few spots in the square and keep the flattest.
    let best = null;
    for (let t = 0; t < 6; t++) {
      const x = -BIG / 2 + (i + 0.15 + hash(seed + t, 1.3) * 0.7) * CELL;
      const z = -BIG / 2 + (j + 0.15 + hash(seed + t, 2.9) * 0.7) * CELL;
      if (Math.hypot(x, z) < KEEP_CLEAR || Math.max(Math.abs(x), Math.abs(z)) > BIG / 2 - 400) continue;
      const s = slopeAt(x, z);
      if (!best || s < best.s) best = { x, z, s };
    }
    if (!best || best.s > 0.18) continue;
    const m = masks(best.x, best.z), h = bigHeight(best.x, best.z);
    if (m.mountain > 0.45 || h > 190) continue;
    const r = hash(seed, 7.7);
    let kind = null;
    if (m.canyon > 0.5) kind = r < 0.35 ? 'camp' : null;
    else if (m.moisture > 1.1 || h > 80) kind = r < 0.3 ? 'camp' : r < 0.5 ? 'ranch' : null;
    else if (m.moisture < 0.86) kind = r < 0.22 ? 'town' : r < 0.4 ? 'camp' : null;
    else kind = r < 0.3 ? 'town' : r < 0.72 ? 'ranch' : r < 0.8 ? 'camp' : null;
    if (!kind) continue;
    // A name nobody else has.
    let name;
    for (let k = 0; k < 40 && (!name || used.has(name)); k++) {
      const a = FIRST[Math.floor(hash(seed + k, 3.1) * FIRST.length)], b = LAST[kind][Math.floor(hash(seed + k, 4.1) * LAST[kind].length)];
      name = `${a} ${b}`;
    }
    used.add(name);
    SITES.push({
      name, kind, x: best.x, z: best.z, r: R[kind], base: h,
      axis: hash(seed, 9.1) * Math.PI, type: kind === 'ranch' ? 'ranch' : kind,
      sub: SUB[kind][Math.floor(hash(seed, 5.5) * SUB[kind].length)], generated: true,
    });
  }

  // Roads: each town and ranch joins its two nearest neighbors, the sites nearest
  // the valley join its four gates, and nothing crosses high mountains.
  ROADS = [];
  const seen = new Set();
  const gates = [[0, -470], [470, 0], [0, 470], [-470, 0]].map(([x, z]) => ({ x, z, gate: true }));
  const nodes = SITES.filter((s) => s.kind !== 'camp');
  const crossesPeaks = (a, b) => {
    for (let t = 0.1; t < 1; t += 0.1) { const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t; if (masks(x, z).mountain > 0.55) return true; }
    return false;
  };
  const link = (a, b) => {
    const k = [a.name || `${a.x},${a.z}`, b.name || `${b.x},${b.z}`].sort().join('|');
    if (seen.has(k) || crossesPeaks(a, b)) return;
    seen.add(k);
    ROADS.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z });
  };
  for (const s of SITES) {
    const pool = s.kind === 'camp' ? nodes : nodes.filter((o) => o !== s);
    const near = pool.map((o) => [o, Math.hypot(o.x - s.x, o.z - s.z)]).sort((p, q) => p[1] - q[1]);
    const count = s.kind === 'camp' ? 1 : 2;
    for (let k = 0; k < Math.min(count, near.length); k++) if (near[k][1] < 4200) link(s, near[k][0]);
  }
  for (const g of gates) {
    const near = nodes.map((o) => [o, Math.hypot(o.x - g.x, o.z - g.z)]).sort((p, q) => p[1] - q[1]);
    if (near[0]) link(g, near[0][0]);
  }

  siteGrid = new Map();
  for (const s of SITES) {
    const k = `${Math.floor(s.x / CELL)},${Math.floor(s.z / CELL)}`;
    if (!siteGrid.has(k)) siteGrid.set(k, []);
    siteGrid.get(k).push(s);
  }
  roadGrid = new Map();
  for (const rd of ROADS) {
    const x0 = Math.min(rd.ax, rd.bx) - 10, x1 = Math.max(rd.ax, rd.bx) + 10, z0 = Math.min(rd.az, rd.bz) - 10, z1 = Math.max(rd.az, rd.bz) + 10;
    for (let cx = Math.floor(x0 / ROAD_CELL); cx <= Math.floor(x1 / ROAD_CELL); cx++) for (let cz = Math.floor(z0 / ROAD_CELL); cz <= Math.floor(z1 / ROAD_CELL); cz++) {
      // Only cells the segment actually passes near.
      const px = (cx + 0.5) * ROAD_CELL, pz = (cz + 0.5) * ROAD_CELL;
      if (segDist(px, pz, rd) > ROAD_CELL) continue;
      const k = `${cx},${cz}`;
      if (!roadGrid.has(k)) roadGrid.set(k, []);
      roadGrid.get(k).push(rd);
    }
  }
}

function segDist(x, z, rd) {
  const dx = rd.bx - rd.ax, dz = rd.bz - rd.az, l2 = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((x - rd.ax) * dx + (z - rd.az) * dz) / l2));
  return Math.hypot(x - (rd.ax + dx * t), z - (rd.az + dz * t));
}

export function sites() { if (!SITES) build(); return SITES; }
export function roads() { if (!SITES) build(); return ROADS; }

// Sites whose ground reaches (x, z).
function nearby(x, z) {
  if (!SITES) build();
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), out = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const l = siteGrid.get(`${cx + dx},${cz + dz}`); if (l) out.push(...l); }
  return out;
}

// Levels the ground under settlements. Returns the adjusted height.
export function flattenSites(x, z, h) {
  for (const s of nearby(x, z)) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < s.r * 1.8) h = s.base + (h - s.base) * ss(s.r, s.r * 1.8, d);
  }
  return h;
}

// 0..1, how much of a road is under (x, z): 1 within 2.5 m of the center line.
export function roadAt(x, z) {
  if (!SITES) build();
  const l = roadGrid.get(`${Math.floor(x / ROAD_CELL)},${Math.floor(z / ROAD_CELL)}`);
  if (!l) return 0;
  let best = Infinity;
  for (const rd of l) best = Math.min(best, segDist(x, z, rd));
  // A little wobble so the edges aren't ruled lines.
  const wob = (hash(Math.floor(x / 3), Math.floor(z / 3)) - 0.5) * 1.2;
  return 1 - ss(2.5, 4.5, best + wob);
}

// Is (x, z) within a settlement's ground (plus pad)? For keeping trees off it.
export function nearSite(x, z, pad = 0) {
  for (const s of nearby(x, z)) if (Math.hypot(x - s.x, z - s.z) < s.r + pad) return s;
  return null;
}
