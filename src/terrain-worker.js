import { height, riverInfo } from './world.js';
import { surface, mapColor } from './surface.js';

// Builds terrain chunks and minimap images off the main thread.
//
// chunk: { id, x0, z0, size, res, drop } → positions, normals, biome, splat, tint, index.
//   drop: optional {x0, z0, x1, z1}; vertices strictly inside are sunk 8 m so a
//   coarse chunk hides under the fine chunks that cover that area.
// map:   { id, cx, cz, span, px } → RGBA bytes, px x px, centered on (cx, cz).

function buildChunk({ x0, z0, size, res, drop }) {
  const n = res + 1, step = size / res;
  // Heights with a one cell border, so normals match across chunk edges.
  const hb = new Float32Array((n + 2) * (n + 2));
  for (let j = -1; j <= n; j++) for (let i = -1; i <= n; i++) hb[(j + 1) * (n + 2) + (i + 1)] = height(x0 + i * step, z0 + j * step);
  const H = (i, j) => hb[(j + 1) * (n + 2) + (i + 1)];

  const pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3);
  const wy = new Float32Array(n * n), wet = new Uint8Array(n * n); // river surface height, and whether there's water
  const biome = new Float32Array(n * n * 3), splat = new Float32Array(n * n * 3), tint = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = x0 + i * step, z = z0 + j * step;
    let y = H(i, j);
    const s = surface(x, z, y);
    const rv = riverInfo(x, z);
    wy[k] = y + rv.carve - 3.4; wet[k] = rv.depth > -0.4 ? 1 : 0;
    if (drop && x > drop.x0 && x < drop.x1 && z > drop.z0 && z < drop.z1) { y -= 8; wy[k] -= 8; }
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    const dx = H(i + 1, j) - H(i - 1, j), dz = H(i, j + 1) - H(i, j - 1);
    const nx = -dx, ny = 2 * step, nz = -dz, l = Math.hypot(nx, ny, nz);
    nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l;
    biome.set(s.c, k * 3);
    splat[k * 3] = s.dirt; splat[k * 3 + 1] = s.snow; splat[k * 3 + 2] = s.mud;
    tint.set(s.tint, k * 3);
  }
  const index = new Uint16Array(res * res * 6);
  let q = 0;
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    index[q++] = a; index[q++] = c; index[q++] = b;
    index[q++] = b; index[q++] = c; index[q++] = d;
  }
  // River water: a quad for every cell touching water, at the river's surface.
  let water = null;
  const wq = [];
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    if (wet[a] || wet[b] || wet[c] || wet[d]) wq.push(a, b, c, d);
  }
  if (wq.length) {
    const cells = wq.length / 4, wpos = new Float32Array(cells * 4 * 3), widx = new Uint32Array(cells * 6);
    for (let q = 0; q < cells; q++) {
      for (let v = 0; v < 4; v++) {
        const k = wq[q * 4 + v];
        wpos[(q * 4 + v) * 3] = pos[k * 3]; wpos[(q * 4 + v) * 3 + 1] = wy[k]; wpos[(q * 4 + v) * 3 + 2] = pos[k * 3 + 2];
      }
      const o = q * 4;
      widx.set([o, o + 2, o + 1, o + 1, o + 2, o + 3], q * 6);
    }
    water = { pos: wpos, index: widx };
  }
  return { pos, nor, biome, splat, tint, index, water };
}

function buildMap({ cx, cz, span, px }) {
  const out = new Uint8ClampedArray(px * px * 4);
  for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) {
    const x = cx + (i / px - 0.5) * span, z = cz + (j / px - 0.5) * span;
    const h = height(x, z), d = span / px;
    const hn = height(x - d, z - d);
    const c = mapColor(x, z, h, Math.abs(h - hn) / (d * 1.41));
    // Hill shading from the slope to the north west.
    const sh = Math.max(0.7, Math.min(1.25, 1 + (h - hn) * 0.04));
    const k = (j * px + i) * 4;
    out[k] = c[0] * sh; out[k + 1] = c[1] * sh; out[k + 2] = c[2] * sh; out[k + 3] = 255;
  }
  return out;
}

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'chunk') {
    const r = buildChunk(msg);
    const tr = [r.pos.buffer, r.nor.buffer, r.biome.buffer, r.splat.buffer, r.tint.buffer, r.index.buffer];
    if (r.water) tr.push(r.water.pos.buffer, r.water.index.buffer);
    self.postMessage({ type: 'chunk', id: msg.id, ...r }, tr);
  } else if (msg.type === 'map') {
    const px = buildMap(msg);
    self.postMessage({ type: 'map', id: msg.id, cx: msg.cx, cz: msg.cz, span: msg.span, size: msg.px, px }, [px.buffer]);
  }
};
