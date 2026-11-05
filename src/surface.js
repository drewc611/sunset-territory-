import { POIS, LAKE, LAKE_Y, fbm, vnoise, masks, valleyBlend, riverInfo } from './world.js';
import { roadAt, nearSite } from './sites.js';

// What the ground is made of at a point: a grass tint, a dirt/snow/mud mix, and a
// tint for dirt and rock (red in canyon country, pale in the desert). Pure, no
// three.js, so the terrain worker can run it. Colors are linear.

const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const hex = (h) => [lin((h >> 16) & 255), lin((h >> 8) & 255), lin(h & 255)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const cl = (v) => Math.min(1, Math.max(0, v));

const GRASS = hex(0x5f7a35), GRASS2 = hex(0x8a8f3f), DRY = hex(0xa89258);
const FOREST = hex(0x4a6a2e), DESERT = hex(0xb09a62), CANYON = hex(0x9a7048);
const towns = POIS.filter((p) => p.type === 'town' || p.type === 'camp');
const flats = POIS.find((p) => p.type === 'flat');

// The prototype's valley rules.
function valleySurface(x, z, h) {
  const m = fbm(x * 0.03 + 50, z * 0.03), m2 = vnoise(x * 0.08, z * 0.08);
  let c = mix(DRY, m2 > 0.5 ? GRASS : GRASS2, cl((h + 3) / 9));
  const k = 1 + (m - 0.5) * 0.32;
  c = [c[0] * k, c[1] * k, c[2] * k];
  let dirt = cl(1 - (h + 6) / 10);
  dirt = Math.max(dirt, (vnoise(x * 0.05 + 11, z * 0.05) - 0.62) * 2.2);
  const df = Math.hypot(x - flats.x, z - flats.z);
  dirt = Math.max(dirt, 1 - Math.max(0, (df - flats.r * 0.7) / (flats.r * 0.5)));
  for (const p of towns) {
    const d = Math.hypot(x - p.x, z - p.z);
    dirt = Math.max(dirt, 0.9 * (1 - Math.max(0, (d - p.r * 0.75) / (p.r * 0.35))));
  }
  const mud = h < LAKE_Y + 1.5 && Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 2 ? 1 : 0;
  const snow = cl((h - 40) / 10) * (0.4 + vnoise(x * 0.09, z * 0.09) * 0.6);
  return { c, dirt: cl(dirt), snow, mud, tint: [1, 1, 1] };
}

// Biomes out in the territory, from the same masks that shape the land.
function bigSurface(x, z, h) {
  const { mountain, canyon, moisture } = masks(x, z);
  const desert = cl((0.86 - moisture) / 0.18) * (1 - mountain);
  const forest = Math.max(cl((moisture - 1.1) / 0.15), cl((h - 80) / 40)) * (1 - canyon);
  const v = vnoise(x * 0.06, z * 0.06);
  let c = mix(GRASS, GRASS2, v);
  c = mix(c, FOREST, forest);
  c = mix(c, DESERT, desert);
  c = mix(c, CANYON, canyon * 0.55);
  const k = 1 + (fbm(x * 0.02 + 50, z * 0.02) - 0.97) * 0.3;
  c = [c[0] * k, c[1] * k, c[2] * k];
  let dirt = Math.max(desert * 0.85, canyon * 0.9, (vnoise(x * 0.03 + 11, z * 0.03) - 0.66) * 2.4);
  // River banks: wet mud at the water, then greener grass.
  const rv = riverInfo(x, z);
  if (rv.bank > 0) { c = mix(c, GRASS, rv.bank * 0.6); dirt *= 1 - rv.bank * 0.7; }
  const mud = rv.core > 0.2 ? cl((rv.core - 0.2) * 2) : 0;
  // Roads and the trodden ground of settlements.
  dirt = Math.max(dirt, roadAt(x, z));
  const site = nearSite(x, z, 4);
  if (site) dirt = Math.max(dirt, 0.85 * cl(1.2 - Math.hypot(x - site.x, z - site.z) / (site.r + 4)));
  const snow = cl((h - 210) / 40) * (0.5 + vnoise(x * 0.02, z * 0.02) * 0.5);
  const tint = mix(mix([1, 1, 1], [1.15, 1.05, 0.88], desert), [1.32, 0.88, 0.7], canyon); // red rock, short of solid red
  return { c, dirt: cl(dirt), snow, mud, tint };
}

// Blended between the valley and the territory.
export function surface(x, z, h) {
  const w = valleyBlend(x, z);
  if (w <= 0) return valleySurface(x, z, h);
  if (w >= 1) return bigSurface(x, z, h);
  const a = valleySurface(x, z, h), b = bigSurface(x, z, h);
  return { c: mix(a.c, b.c, w), dirt: a.dirt + (b.dirt - a.dirt) * w, snow: a.snow + (b.snow - a.snow) * w, mud: a.mud * (1 - w), tint: mix(a.tint, b.tint, w) };
}

// Minimap color for a point (sRGB bytes), from the same surface the ground uses.
const toSrgb = (v) => Math.round(255 * Math.min(1, v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
const DIRT = hex(0x8a6a44), SNOW = hex(0xd8d2ca), ROCK = hex(0x7a6a5c);
export function mapColor(x, z, h, slope = 0) {
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r - 1) return [45, 85, 105];
  if (riverInfo(x, z).depth > 0.3) return [52, 92, 112];
  const s = surface(x, z, h);
  let c = mix(s.c, [DIRT[0] * s.tint[0], DIRT[1] * s.tint[1], DIRT[2] * s.tint[2]], s.dirt * 0.85);
  c = mix(c, [ROCK[0] * s.tint[0], ROCK[1] * s.tint[1], ROCK[2] * s.tint[2]], cl((slope - 0.35) * 3));
  c = mix(c, SNOW, s.snow);
  return [toSrgb(c[0] * 1.5), toSrgb(c[1] * 1.5), toSrgb(c[2] * 1.5)];
}
