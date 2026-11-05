// World definition and terrain height, ported from prototype/index.html.
// Pure functions only, no three.js, so collision, minimap and placement can share them.
export const WORLD = 400;
export const SEG = 200;

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
  h += Math.max(0, edge - 0.78) * 140;
  return h;
}

export function height(x, z) {
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
