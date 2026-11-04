import { flattenSites } from './sites.js';

// World definition and terrain height. Pure functions only, no three.js, so
// collision, minimap, placement and terrain chunks all share them.
//
// The hand built valley from the prototype (WORLD, 400 m across) sits at the center
// of a 20 km x 20 km territory (BIG). Its bowl blends out into large scale terrain
// between VALLEY_IN and VALLEY_OUT meters from the center.
export const WORLD = 400;
export const SEG = 200;
export const BIG = 20000;
const VALLEY_IN = 230, VALLEY_OUT = 480;

export const POIS = [
  { name: 'Brass Hollow', sub: 'Mining town on the east bench', x: 95, z: -40, r: 34, type: 'town', flat: true },
  { name: 'Caldwell Crossing', sub: 'Lake town, ferry long gone', x: -110, z: 70, r: 30, type: 'town', flat: true },
  { name: 'Caldwell Lake', sub: 'Cold water, good fishing', x: -60, z: 105, r: 30, type: 'lake', flat: true },
  { name: "Drover's Camp", sub: 'Cattle outfit, three tents and a fire', x: -30, z: -120, r: 18, type: 'camp', flat: true },
  { name: "Widow's Rest", sub: 'Trapper camp under the cedars', x: 60, z: 130, r: 16, type: 'camp', flat: true },
  { name: 'Kettle Ridge', sub: 'Highest ground in the valley', x: -120, z: -90, r: 40, type: 'ridge', flat: false },
  { name: 'The Flats', sub: 'Dry lake, hard pan, no shade', x: 20, z: 30, r: 48, type: 'flat', flat: true },
  { name: 'Sandstone Arch', sub: 'Wind did this, given long enough', x: -150, z: 20, r: 14, type: 'landmark', flat: false },
  { name: 'Danner Mine', sub: 'Cole Danner digs here every morning', x: 140, z: -95, r: 14, type: 'landmark', flat: false },
  { name: 'Lookout Tower', sub: 'Built for fire watch, left for anyone', x: 150, z: 120, r: 12, type: 'landmark', flat: false },
  { name: 'Old Mission', sub: 'The bell still hangs', x: -40, z: 160, r: 14, type: 'landmark', flat: false },
];

export function hash(x, z) { const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n); }
export function smooth(t) { return t * t * (3 - 2 * t); }
export function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  const u = smooth(xf), v = smooth(zf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z) { let s = 0, a = 1, f = 1; for (let i = 0; i < 5; i++) { s += a * vnoise(x * f, z * f); a *= 0.5; f *= 2.1; } return s; }

function rawHeight(x, z) {
  let h = fbm(x * 0.012 + 7, z * 0.012 + 3) * 24 - 11;
  const ridge = Math.max(0, 1 - Math.hypot(x + 120, z + 90) / 95);
  h += ridge * ridge * 38;
  const edge = Math.max(Math.abs(x), Math.abs(z)) / (WORLD / 2);
  h += Math.min(36, Math.max(0, edge - 0.78) * 140); // the valley rim, capped so it meets the land beyond
  return h;
}

const ss = (a, b, t) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };

// Ridged noise for mountain ranges: sharp crests, broad valleys.
function ridged(x, z) {
  let r = 0, amp = 1, f = 1;
  for (let i = 0; i < 4; i++) { const n = 1 - Math.abs(2 * vnoise(x * f + 31, z * f + 17) - 1); r += n * n * amp; amp *= 0.5; f *= 2.1; }
  return r;
}

// Large scale masks, shared by the height and the biome so they agree.
export function masks(x, z) {
  const mountain = ss(1.02, 1.34, fbm(x * 0.00045 + 50, z * 0.00045 + 20));
  const canyon = ss(0.98, 1.24, fbm(x * 0.0004 + 80, z * 0.0004 + 60)) * (1 - mountain);
  const moisture = fbm(x * 0.0003 + 200, z * 0.0003 + 100);
  return { mountain, canyon, moisture };
}

// Terrain beyond the valley: rolling plains, mountain ranges, and red rock canyons
// cut into mesas.
export function bigHeight(x, z) { return flattenSites(x, z, naturalHeight(x, z)); }

// The land before settlements level it (used to choose where they go).
export function naturalHeight(x, z) {
  const m = masks(x, z);
  const continent = (fbm(x * 0.00028 + 13.1, z * 0.00028 + 5.7) - 0.97) * 120;
  const hills = (fbm(x * 0.0035 + 3, z * 0.0035 + 9) - 0.97) * 28;
  const mountains = m.mountain * ridged(x * 0.0016, z * 0.0016) * 170;
  const c = Math.abs(vnoise(x * 0.004 + 5, z * 0.004 + 5) * 2 - 1);
  let carve = m.canyon * ss(0.3, 0.0, c) * 55;
  // Mesas: terrace the canyon country into flat topped steps.
  let h = 30 + continent + hills + mountains + (fbm(x * 0.03, z * 0.03) - 0.97) * 3;
  if (m.canyon > 0.05) {
    const step = 14, tq = h / step, fl = Math.floor(tq), fr = tq - fl;
    const terraced = (fl + ss(0.55, 0.85, fr)) * step;
    h += (terraced - h) * m.canyon * 0.85;
  }
  return h - carve;
}

// 0 inside the valley, 1 out in the big terrain.
export function valleyBlend(x, z) { return ss(VALLEY_IN, VALLEY_OUT, Math.hypot(x, z)); }

export function height(x, z) {
  const w = valleyBlend(x, z);
  if (w >= 1) return bigHeight(x, z);
  let h = valleyHeight(x, z);
  if (w > 0) h += (bigHeight(x, z) - h) * w;
  return h;
}

function valleyHeight(x, z) {
  let h = rawHeight(x, z);
  for (const p of POIS) {
    if (!p.flat) continue;
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r * 1.4) {
      const base = rawHeight(p.x, p.z);
      const t = smooth(Math.min(1, Math.max(0, (d - p.r) / (p.r * 0.4))));
      h = base + (h - base) * t;
      if (p.type === 'lake' && d < p.r) { const k = 1 - d / p.r; h -= smooth(k) * 6; }
    }
  }
  return h;
}

export const LAKE = POIS.find((p) => p.type === 'lake');
export const LAKE_Y = rawHeight(LAKE.x, LAKE.z) - 1.4;

// Ground kept clear for the homestead you can buy, so trees and rocks don't grow there.
export const HOME = { x: 70, z: 114, r: 11 };

export function nearPOI(x, z, pad) {
  if (Math.hypot(x - HOME.x, z - HOME.z) < HOME.r + pad) return true;
  for (const p of POIS) {
    if ((p.type === 'town' || p.type === 'camp' || p.type === 'lake' || p.type === 'landmark') && Math.hypot(x - p.x, z - p.z) < p.r + pad) return true;
  }
  return false;
}

// Ground height the horse stands on: terrain, but never deeper than wading depth in the lake.
export function groundY(x, z) {
  let gy = height(x, z);
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r) gy = Math.max(gy, LAKE_Y - 1.2);
  return gy;
}
