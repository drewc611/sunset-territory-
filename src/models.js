import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Low poly models built in code for this project: trees, rocks, buildings, tents.
// Every part is flat shaded with vertex colors and merged into one geometry per model,
// so a whole tree type or a whole town is a single draw call.
//
// Extra vertex attributes the shared props material reads:
//   glow  0..1, lit windows and lamps; brightens at night
//   sway  0..1, how far wind moves this vertex (foliage tips)

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

// Small seeded random so every model is the same on every load.
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Deterministic noise on a position, used to displace vertices without cracks:
// vertices that share a position get the same offset.
function pnoise(x, y, z, seed) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 4.1) * 43758.5453;
  return n - Math.floor(n);
}

export class Builder {
  constructor() { this.parts = []; }

  // geo: any BufferGeometry. color: hex or THREE.Color. t: {x,y,z, rx,ry,rz, sx,sy,sz, s}.
  // o: {glow, sway, swayBase, swayTop, jitter (vertex displacement in local units), shade (bottom darkening 0..1), seed}
  add(geo, color, t = {}, o = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    const pos = g.attributes.position;

    if (o.jitter) {
      const seed = o.seed || 0;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const k = (v) => Math.round(v * 1000) / 1000;
        pos.setXYZ(i,
          x + (pnoise(k(x), k(y), k(z), seed) - 0.5) * o.jitter,
          y + (pnoise(k(y), k(z), k(x), seed + 1) - 0.5) * o.jitter,
          z + (pnoise(k(z), k(x), k(y), seed + 2) - 0.5) * o.jitter);
      }
    }

    // Local heights before the transform, for bottom shading and sway weights.
    g.computeBoundingBox();
    const minY = g.boundingBox.min.y, spanY = Math.max(1e-4, g.boundingBox.max.y - minY);
    const n = pos.count;
    const localH = new Float32Array(n);
    for (let i = 0; i < n; i++) localH[i] = (pos.getY(i) - minY) / spanY;

    _e.set(t.rx || 0, t.ry || 0, t.rz || 0);
    _q.setFromEuler(_e);
    const s = t.s ?? 1;
    _s.set((t.sx ?? 1) * s, (t.sy ?? 1) * s, (t.sz ?? 1) * s);
    _p.set(t.x || 0, t.y || 0, t.z || 0);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);

    const col = new Float32Array(n * 3), glow = new Float32Array(n), sway = new Float32Array(n);
    _c.set(color);
    for (let i = 0; i < n; i++) {
      const k = o.shade ? 1 - o.shade * (1 - localH[i]) : 1; // darker low down, a cheap occlusion
      col[i * 3] = _c.r * k; col[i * 3 + 1] = _c.g * k; col[i * 3 + 2] = _c.b * k;
      glow[i] = o.glow || 0;
      if (o.sway) sway[i] = o.sway * THREE.MathUtils.lerp(o.swayBase ?? 0, o.swayTop ?? 1, localH[i]);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
    g.setAttribute('sway', new THREE.BufferAttribute(sway, 1));
    this.parts.push(g);
    return this;
  }

  build() {
    const g = mergeGeometries(this.parts, false);
    g.computeVertexNormals(); // non-indexed, so these are face normals: flat shading
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// Color helpers.
export const shadeHex = (hex, k) => _c.set(hex).multiplyScalar(k).clone();
function vary(hex, rand, amt = 0.08) {
  const c = new THREE.Color(hex);
  c.offsetHSL((rand() - 0.5) * amt * 0.3, (rand() - 0.5) * amt, (rand() - 0.5) * amt);
  return c;
}

// ---------------------------------------------------------------- trees

// Ponderosa pine: tall straight trunk, stacked ragged cones, open at the bottom.
export function pine(seed) {
  const R = rng(seed), b = new Builder();
  const H = 9 + R() * 4;
  b.add(new THREE.CylinderGeometry(0.16, 0.34, H * 0.55, 6), vary(0x5a3b26, R), { y: H * 0.275 }, { shade: 0.4 });
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const r = THREE.MathUtils.lerp(2.5, 0.7, t) * (0.85 + R() * 0.3);
    const h = THREE.MathUtils.lerp(3.2, 2.0, t);
    const y = H * 0.32 + t * H * 0.58;
    b.add(new THREE.ConeGeometry(r, h, 7, 1, true), vary(i % 2 ? 0x3d5a2a : 0x46632e, R, 0.1),
      { y: y + h / 2, ry: R() * 6.28, rx: (R() - 0.5) * 0.12, rz: (R() - 0.5) * 0.12 },
      { jitter: 0.5, seed: seed + i, shade: 0.45, sway: 0.5 + t * 0.5, swayBase: 0.2, swayTop: 1 });
  }
  return { geo: b.build(), height: H, trunk: 0.34 };
}

// Cottonwood: thick forked trunk, broad lumpy crown. Grows near water and in towns.
export function cottonwood(seed) {
  const R = rng(seed), b = new Builder();
  const H = 7 + R() * 3;
  const bark = vary(0x6a5440, R);
  b.add(new THREE.CylinderGeometry(0.3, 0.5, H * 0.45, 6), bark, { y: H * 0.225 }, { shade: 0.35 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * 6.28 + R();
    b.add(new THREE.CylinderGeometry(0.12, 0.24, H * 0.35, 5), bark,
      { x: Math.cos(a) * 0.5, y: H * 0.55, z: Math.sin(a) * 0.5, rx: Math.sin(a) * 0.5, rz: -Math.cos(a) * 0.5 });
  }
  const blobs = 6 + Math.floor(R() * 3);
  for (let i = 0; i < blobs; i++) {
    const a = R() * 6.28, d = R() * 2.2, r = 1.6 + R() * 1.3;
    b.add(new THREE.IcosahedronGeometry(r, 1), vary(i % 3 ? 0x5b7a32 : 0x6e8a3a, R, 0.12),
      { x: Math.cos(a) * d, y: H * 0.68 + R() * H * 0.25, z: Math.sin(a) * d, sy: 0.75 },
      { jitter: 0.7, seed: seed * 7 + i, shade: 0.5, sway: 0.7, swayBase: 0.3, swayTop: 1 });
  }
  return { geo: b.build(), height: H, trunk: 0.5 };
}

// Juniper: squat, dense, dark. Scattered on dry ground and slopes.
export function juniper(seed) {
  const R = rng(seed), b = new Builder();
  b.add(new THREE.CylinderGeometry(0.1, 0.2, 1.2, 5), vary(0x4a3424, R), { y: 0.6, rz: (R() - 0.5) * 0.4 });
  for (let i = 0; i < 4; i++) {
    const a = R() * 6.28, d = R() * 0.6;
    b.add(new THREE.IcosahedronGeometry(0.9 + R() * 0.5, 0), vary(0x3f5230, R, 0.1),
      { x: Math.cos(a) * d, y: 1.3 + R() * 1.0, z: Math.sin(a) * d, sy: 1.2 },
      { jitter: 0.35, seed: seed + i * 3, shade: 0.4, sway: 0.4 });
  }
  return { geo: b.build(), height: 2.6, trunk: 0.2 };
}

// ---------------------------------------------------------------- rocks

// Boulder: displaced icosahedron, flattened, with a lighter top like weathered sandstone.
export function boulder(seed, tone = 0x8a7462) {
  const R = rng(seed), b = new Builder();
  b.add(new THREE.IcosahedronGeometry(1, 1), vary(tone, R, 0.08), { sy: 0.65 + R() * 0.25 }, { jitter: 0.55, seed, shade: 0.45 });
  if (R() > 0.4) {
    b.add(new THREE.IcosahedronGeometry(0.55, 0), vary(tone, R, 0.1),
      { x: 0.8 + R() * 0.3, y: -0.15, z: (R() - 0.5) * 0.8, sy: 0.7 }, { jitter: 0.25, seed: seed + 9, shade: 0.4 });
  }
  return b.build();
}

// Slab: blocky layered outcrop for ridge tops.
export function slab(seed, tone = 0x7d6a5c) {
  const R = rng(seed), b = new Builder();
  for (let i = 0; i < 3; i++) {
    b.add(new THREE.BoxGeometry(1.8 - i * 0.4, 0.5, 1.3 - i * 0.25), vary(i % 2 ? tone : 0x957d68, R, 0.06),
      { y: i * 0.45, ry: (R() - 0.5) * 0.5, x: (R() - 0.5) * 0.3 }, { jitter: 0.18, seed: seed + i, shade: 0.25 });
  }
  return b.build();
}

// ---------------------------------------------------------------- buildings

// Shared helpers for buildings. Local frame: ground at y=0, front wall at z=0 facing +z.
const WOOD = [0x8c6b45, 0x7a5c3c, 0x9a7a52, 0x6f5236, 0xa58a62];
const PAINT = [0xb8a07a, 0x8a5a40, 0x6e7a6a, 0xa8865a, 0x7a4a36];
const ROOF = 0x4a3a2e, DARK = 0x3a2a1e, GLASS = 0x2a2a30, LAMP = 0xffb060;

function windows(b, w, h, z, rows, R) {
  const cols = Math.max(1, Math.floor(w / 2.6));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + (c + 0.5) * (w / cols);
      if (r === 0 && Math.abs(x) < 0.9) continue; // door goes here
      const y = 1.7 + r * 2.8;
      if (y + 0.6 > h - 0.3) continue;
      const lit = R() > 0.35 ? 1 : 0;
      b.add(new THREE.BoxGeometry(0.95, 1.15, 0.1), GLASS, { x, y, z: z + 0.04 }, { glow: lit });
      b.add(new THREE.BoxGeometry(1.15, 0.12, 0.16), 0xd8c7a1, { x, y: y - 0.62, z: z + 0.06 });
      b.add(new THREE.BoxGeometry(1.15, 0.12, 0.16), 0xd8c7a1, { x, y: y + 0.62, z: z + 0.06 });
    }
  }
}

function boardwalk(b, w, depth, roofH, R) {
  b.add(new THREE.BoxGeometry(w + 0.6, 0.28, depth), vary(0x6a5038, R, 0.05), { y: 0.14, z: depth / 2 });
  const posts = Math.max(2, Math.round(w / 3) + 1);
  for (let i = 0; i < posts; i++) {
    const x = -w / 2 + (i / (posts - 1)) * w;
    b.add(new THREE.BoxGeometry(0.18, roofH, 0.18), DARK, { x, y: roofH / 2, z: depth - 0.15 });
  }
  b.add(new THREE.BoxGeometry(w + 0.8, 0.14, depth + 0.3), vary(ROOF, R, 0.05), { y: roofH, z: depth / 2, rx: 0.12 });
}

// False front shop: the classic tall square facade hiding a gabled roof.
export function shop(seed) {
  const R = rng(seed), b = new Builder();
  const w = 7 + Math.floor(R() * 3) * 1.5, d = 9 + R() * 4, h = 4.2 + R() * 1.6;
  const wall = vary(PAINT[Math.floor(R() * PAINT.length)], R, 0.06);
  b.add(new THREE.BoxGeometry(w, h, d), wall, { y: h / 2, z: -d / 2 }, { shade: 0.25 });
  // Gable roof behind the facade.
  const pitch = 0.42, half = w / 2 / Math.cos(pitch);
  for (const sgn of [-1, 1]) {
    b.add(new THREE.BoxGeometry(half + 0.3, 0.16, d + 0.3), vary(ROOF, R, 0.05),
      { x: sgn * w / 4, y: h + Math.tan(pitch) * w / 4, z: -d / 2, rz: -sgn * pitch });
  }
  // Facade, stepped top.
  const fh = h + 2.2 + R() * 1.2;
  b.add(new THREE.BoxGeometry(w + 0.2, fh, 0.3), wall, { y: fh / 2, z: 0.15 }, { shade: 0.2 });
  b.add(new THREE.BoxGeometry(w * 0.55, 0.9, 0.32), wall, { y: fh + 0.45, z: 0.15 });
  b.add(new THREE.BoxGeometry(w + 0.5, 0.2, 0.5), 0xd8c7a1, { y: fh, z: 0.25 });
  // Sign board.
  b.add(new THREE.BoxGeometry(w * 0.75, 1.0, 0.12), 0x2e241a, { y: h + 1.05, z: 0.36 });
  b.add(new THREE.BoxGeometry(w * 0.68, 0.14, 0.14), 0xc9a24d, { y: h + 1.05, z: 0.42 });
  // Door, windows, boardwalk, lamp.
  b.add(new THREE.BoxGeometry(1.4, 2.4, 0.12), DARK, { y: 1.2, z: 0.36 });
  windows(b, w, h, 0.32, 2, R);
  boardwalk(b, w, 2.6, h * 0.62, R);
  b.add(new THREE.BoxGeometry(0.25, 0.35, 0.25), LAMP, { x: w / 2 - 0.4, y: h * 0.62 - 0.3, z: 2.3 }, { glow: 1 });
  return { geo: b.build(), w: w + 0.2, d: d + 0.3, zc: -d / 2 + 0.15 }; // footprint: walls and facade, not the boardwalk
}

// House: gabled cabin with a porch and chimney.
export function house(seed) {
  const R = rng(seed), b = new Builder();
  const w = 6 + R() * 2.5, d = 6 + R() * 3, h = 3.2 + R() * 0.8;
  const wall = vary(WOOD[Math.floor(R() * WOOD.length)], R, 0.06);
  b.add(new THREE.BoxGeometry(w, h, d), wall, { y: h / 2, z: -d / 2 }, { shade: 0.25 });
  // Horizontal log lines.
  for (let y = 0.5; y < h; y += 0.55) b.add(new THREE.BoxGeometry(w + 0.12, 0.08, 0.08), shadeHex(wall.getHex(), 0.7), { y, z: 0.03 });
  const pitch = 0.6, half = d / 2 / Math.cos(pitch);
  for (const sgn of [-1, 1]) {
    b.add(new THREE.BoxGeometry(w + 0.6, 0.18, half + 0.4), vary(ROOF, R, 0.05),
      { y: h + Math.tan(pitch) * d / 4, z: -d / 2 + sgn * d / 4, rx: sgn * pitch });
  }
  // Gable end triangles.
  const tri = new THREE.CylinderGeometry(0, d / 2 / Math.cos(0.01), Math.tan(pitch) * d / 2, 3, 1);
  for (const sx of [-1, 1]) {
    b.add(tri, wall, { x: sx * (w / 2 - 0.05), y: h + Math.tan(pitch) * d / 4, z: -d / 2, sx: 0.08, sz: 1.15, rx: 0, ry: Math.PI / 2 });
  }
  b.add(new THREE.BoxGeometry(0.9, 2.2, 0.9), 0x6a5a50, { x: w / 2 - 1, y: h + 1.2, z: -d * 0.7 });
  b.add(new THREE.BoxGeometry(1.2, 2.2, 0.12), DARK, { y: 1.1, z: 0.06 });
  windows(b, w, h, 0.02, 1, R);
  boardwalk(b, w, 2.2, h * 0.75, R);
  return { geo: b.build(), w: w + 0.2, d: d + 0.1, zc: -d / 2 };
}

// Church: white board walls, steep roof, bell tower over the door.
export function church(seed) {
  const R = rng(seed), b = new Builder();
  const w = 7, d = 12, h = 5;
  const wall = new THREE.Color(0xd8cfbd);
  b.add(new THREE.BoxGeometry(w, h, d), wall, { y: h / 2, z: -d / 2 }, { shade: 0.2 });
  const pitch = 0.8, half = w / 2 / Math.cos(pitch);
  for (const sgn of [-1, 1]) {
    b.add(new THREE.BoxGeometry(half + 0.3, 0.18, d + 0.4), 0x5a4a3e, { x: sgn * w / 4, y: h + Math.tan(pitch) * w / 4, z: -d / 2, rz: -sgn * pitch });
  }
  b.add(new THREE.BoxGeometry(2.4, 5, 2.4), wall, { y: h + 2.5, z: -1.2 });
  b.add(new THREE.ConeGeometry(2, 3.4, 4), 0x5a4a3e, { y: h + 6.7, z: -1.2, ry: Math.PI / 4 });
  b.add(new THREE.BoxGeometry(0.2, 1.6, 0.2), 0xc9a24d, { y: h + 9.1, z: -1.2 });
  b.add(new THREE.BoxGeometry(1.0, 0.2, 0.2), 0xc9a24d, { y: h + 9.3, z: -1.2 });
  b.add(new THREE.BoxGeometry(1.6, 2.8, 0.12), DARK, { y: 1.4, z: 0.06 });
  for (const z of [-3, -6, -9]) for (const sx of [-1, 1]) {
    b.add(new THREE.BoxGeometry(0.1, 1.8, 0.9), GLASS, { x: sx * (w / 2 + 0.02), y: 2.6, z }, { glow: R() > 0.5 ? 1 : 0 });
  }
  return { geo: b.build(), w, d, zc: -d / 2 };
}

// Water tower on stilts.
export function waterTower() {
  const b = new Builder();
  for (const [x, z] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
    b.add(new THREE.BoxGeometry(0.25, 6, 0.25), DARK, { x, y: 3, z, rx: z * -0.03, rz: x * 0.03 });
  }
  b.add(new THREE.CylinderGeometry(2.2, 2.2, 3, 10), 0x7a5c3c, { y: 7.5 }, { shade: 0.3 });
  b.add(new THREE.ConeGeometry(2.5, 1.4, 10), ROOF, { y: 9.7 });
  return { geo: b.build(), w: 3.2, d: 3.2, zc: 0 };
}

// Street dressing: barrels, a trough, hitching rail, crates.
export function streetBits(seed) {
  const R = rng(seed), b = new Builder();
  b.add(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 8), 0x6a4a2e, { x: 0, y: 0.5, z: 0 }, { shade: 0.3 });
  b.add(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 8), 0x5e4228, { x: 0.9, y: 0.5, z: 0.2 }, { shade: 0.3 });
  b.add(new THREE.BoxGeometry(0.9, 0.9, 0.9), 0x8a6a44, { x: 0.4, y: 0.45, z: -0.9, ry: R() }, { shade: 0.2 });
  return b.build();
}

export function hitchRail() {
  const b = new Builder();
  b.add(new THREE.BoxGeometry(0.16, 1.1, 0.16), DARK, { x: -1.4, y: 0.55 });
  b.add(new THREE.BoxGeometry(0.16, 1.1, 0.16), DARK, { x: 1.4, y: 0.55 });
  b.add(new THREE.BoxGeometry(3.1, 0.14, 0.14), 0x6a5038, { y: 1.05 });
  b.add(new THREE.BoxGeometry(2.4, 0.5, 0.6), 0x5a4a3a, { y: 0.25, z: 0.9 }); // trough
  b.add(new THREE.BoxGeometry(2.2, 0.06, 0.45), 0x2a4a55, { y: 0.48, z: 0.9 });
  return b.build();
}

export function well() {
  const b = new Builder();
  b.add(new THREE.CylinderGeometry(1.2, 1.3, 0.9, 10), 0x8a8078, { y: 0.45 }, { jitter: 0.06, shade: 0.3 });
  b.add(new THREE.BoxGeometry(0.15, 2.2, 0.15), DARK, { x: -1.0, y: 1.1 });
  b.add(new THREE.BoxGeometry(0.15, 2.2, 0.15), DARK, { x: 1.0, y: 1.1 });
  for (const sgn of [-1, 1]) b.add(new THREE.BoxGeometry(2.6, 0.1, 1.1), ROOF, { y: 2.45, z: sgn * 0.45, rx: sgn * 0.6 });
  return b.build();
}

// ---------------------------------------------------------------- camps

export function tent(seed) {
  const R = rng(seed), b = new Builder();
  const L = 3.2, W = 2.6, H = 2.1;
  const canvas = vary(0xd2c3a4, R, 0.05);
  const side = Math.hypot(W / 2, H);
  const ang = Math.atan2(W / 2, H);
  for (const sgn of [-1, 1]) {
    b.add(new THREE.BoxGeometry(0.05, side, L), canvas, { x: sgn * W / 4, y: H / 2, rz: sgn * ang }, { shade: 0.35 });
  }
  // Back panel; the front is open.
  b.add(new THREE.CylinderGeometry(0, W / 2 / Math.cos(Math.PI / 6) * 0.98, H, 3), shadeHex(canvas.getHex(), 0.85),
    { y: H / 2, z: -L / 2, sz: 0.04, ry: Math.PI / 6 + Math.PI }, {});
  b.add(new THREE.BoxGeometry(0.08, H + 0.3, 0.08), DARK, { y: (H + 0.3) / 2, z: L / 2 });
  b.add(new THREE.BoxGeometry(0.08, H + 0.3, 0.08), DARK, { y: (H + 0.3) / 2, z: -L / 2 });
  b.add(new THREE.BoxGeometry(1.6, 0.18, 0.8), 0x6a3a2a, { y: 0.09, z: 0.2 }); // bedroll
  return b.build();
}

export function campfire() {
  const b = new Builder();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * 6.28;
    b.add(new THREE.IcosahedronGeometry(0.28, 0), 0x6e6660, { x: Math.cos(a) * 1.0, y: 0.12, z: Math.sin(a) * 1.0 }, { jitter: 0.1, seed: i });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * 6.28 + 0.3;
    b.add(new THREE.CylinderGeometry(0.1, 0.12, 1.3, 5), 0x3e2a1c, { x: Math.cos(a) * 0.25, y: 0.3, z: Math.sin(a) * 0.25, rx: Math.sin(a) * 1.1, rz: -Math.cos(a) * 1.1 });
  }
  // Sitting logs.
  for (const a of [0.6, 2.4, 4.4]) {
    b.add(new THREE.CylinderGeometry(0.25, 0.28, 2.0, 7), 0x5a3e28, { x: Math.cos(a) * 2.6, y: 0.25, z: Math.sin(a) * 2.6, rz: Math.PI / 2, ry: -a }, { shade: 0.3 });
  }
  return b.build();
}

export function wagon() {
  const b = new Builder();
  b.add(new THREE.BoxGeometry(1.8, 0.7, 3.6), 0x7a5a3a, { y: 1.1 }, { shade: 0.3 });
  for (let i = 0; i < 4; i++) {
    b.add(new THREE.TorusGeometry(1.1, 0.06, 4, 12, Math.PI), 0x8a8070, { y: 1.4, z: -1.3 + i * 0.87 });
  }
  b.add(new THREE.CylinderGeometry(1.1, 1.1, 3.0, 10, 1, true, -Math.PI / 2, Math.PI), 0xe0d4b8, { y: 1.45, rx: Math.PI / 2 }, {});
  for (const [x, z] of [[-1, -1.2], [1, -1.2], [-1, 1.2], [1, 1.2]]) {
    b.add(new THREE.CylinderGeometry(0.6, 0.6, 0.1, 10), 0x4a3424, { x, y: 0.6, z, rz: Math.PI / 2 });
  }
  b.add(new THREE.BoxGeometry(0.12, 0.12, 2.0), 0x4a3424, { y: 0.7, z: 2.6 });
  return b.build();
}
