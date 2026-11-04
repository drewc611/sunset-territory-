import { LAKE, LAKE_Y, height, WORLD } from './world.js';

// Circles (trees, rocks) and oriented boxes (buildings, props) in a uniform grid.
// resolve() pushes a moving circle out of anything it overlaps and reports whether
// it hit something, so the horse can lose speed on impact.
const CELL = 8;

export function createCollision({ trees, rocks, buildings }) {
  const grid = new Map();
  const key = (cx, cz) => cx * 73856093 ^ cz * 19349663;
  function insert(shape, minX, minZ, maxX, maxZ) {
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
      for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
        const k = key(cx, cz);
        let list = grid.get(k);
        if (!list) grid.set(k, (list = []));
        list.push(shape);
      }
    }
  }
  for (const t of trees.concat(rocks)) insert({ kind: 0, x: t.x, z: t.z, r: t.r }, t.x - t.r, t.z - t.r, t.x + t.r, t.z + t.r);
  function addBox(b) {
    const hw = b.w / 2, hd = b.d / 2, ext = Math.hypot(hw, hd);
    insert({ kind: 1, x: b.x, z: b.z, hw, hd, c: Math.cos(b.rot), s: Math.sin(b.rot) }, b.x - ext, b.z - ext, b.x + ext, b.z + ext);
  }
  buildings.forEach(addBox);

  const out = { x: 0, z: 0, hit: false };
  const seen = new Set();

  // Push circle (x, z, r) out of overlapping shapes. Two passes settle corners.
  function resolve(x, z, r) {
    out.hit = false;
    for (let pass = 0; pass < 2; pass++) {
      seen.clear();
      for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
        for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) {
          const list = grid.get(key(cx, cz));
          if (!list) continue;
          for (const sh of list) {
            if (seen.has(sh)) continue;
            seen.add(sh);
            if (sh.kind === 0) {
              const dx = x - sh.x, dz = z - sh.z, d = Math.hypot(dx, dz), min = r + sh.r;
              if (d < min && d > 1e-5) { x = sh.x + (dx / d) * min; z = sh.z + (dz / d) * min; out.hit = true; }
            } else {
              // Into the box's frame: local z runs along (sin rot, cos rot).
              const dx = x - sh.x, dz = z - sh.z;
              const lx = dx * sh.c - dz * sh.s, lz = dx * sh.s + dz * sh.c;
              const px = Math.max(-sh.hw, Math.min(sh.hw, lx)), pz = Math.max(-sh.hd, Math.min(sh.hd, lz));
              let ex = lx - px, ez = lz - pz, d = Math.hypot(ex, ez);
              let nx, nz;
              if (d > 1e-5) {
                if (d >= r) continue;
                nx = px + (ex / d) * r; nz = pz + (ez / d) * r;
              } else {
                // Center inside the box: leave by the nearest face.
                const fx = sh.hw - Math.abs(lx), fz = sh.hd - Math.abs(lz);
                if (fx < fz) { nx = Math.sign(lx || 1) * (sh.hw + r); nz = lz; } else { nx = lx; nz = Math.sign(lz || 1) * (sh.hd + r); }
              }
              x = sh.x + nx * sh.c + nz * sh.s;
              z = sh.z - nx * sh.s + nz * sh.c;
              out.hit = true;
            }
          }
        }
      }
    }
    const lim = WORLD / 2 - 10;
    x = Math.max(-lim, Math.min(lim, x)); z = Math.max(-lim, Math.min(lim, z));
    out.x = x; out.z = z;
    return out;
  }

  // Deepest water each kind of mover will walk into. The horse wades, a person stops sooner.
  function tooDeep(x, z, maxDepth) {
    if (Math.hypot(x - LAKE.x, z - LAKE.z) > LAKE.r) return false;
    return height(x, z) < LAKE_Y - maxDepth;
  }

  return { resolve, tooDeep, addBox };
}
