import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { height, hash } from './world.js';
import { sites, residentsOf } from './sites.js';
import { npcGeometry, personMaterial, PALETTES } from './character.js';
import { shop, house, church, waterTower, streetBits, hitchRail, well, tent, campfire, wagon, barn, corral, windmill } from './models.js';

// Builds the territory's generated settlements as you come within range, and
// drops them again when you ride away. Each settlement is one merged mesh plus
// tagged collision boxes. Layouts come from the site's seed, so they're stable.

const LOAD = 1500, UNLOAD = 1900;

export function createSettlements(scene, material, { collision }) {
  const loaded = new Map(); // name -> { mesh, flame, people }
  const npcCache = {};
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
  let next = 0;

  function build(site) {
    const parts = [], boxes = [];
    let seed = Math.floor(Math.abs(site.x * 7 + site.z * 13));
    const put = (geo, x, z, rot, y = null) => {
      _q.setFromAxisAngle(_up, rot);
      _p.set(x, y ?? height(x, z), z);
      _m.compose(_p, _q, _s);
      const g = geo.clone(); g.applyMatrix4(_m); parts.push(g);
    };
    const box = (model, x, z, rot) => {
      const zc = model.zc || 0, xc = model.xc || 0;
      boxes.push({ x: x + Math.sin(rot) * zc + Math.cos(rot) * xc, z: z + Math.cos(rot) * zc - Math.sin(rot) * xc, w: model.w, d: model.d, rot });
    };
    const ux = Math.cos(site.axis), uz = Math.sin(site.axis), nx = -uz, nz = ux;

    if (site.kind === 'town') {
      const slots = [-26, -15.5, -5, 5.5, 16, 26.5].slice(0, 4 + Math.floor(hash(seed, 1) * 3));
      const mid = (slots[0] + slots[slots.length - 1]) / 2;
      for (const side of [-1, 1]) slots.forEach((t, k) => {
        seed++;
        const pick = hash(seed, 2);
        const model = side === 1 && k === 1 && pick > 0.6 ? church(seed) : pick > 0.62 ? house(seed) : shop(seed);
        const x = site.x + ux * (t - mid) + nx * side * 8.5, z = site.z + uz * (t - mid) + nz * side * 8.5;
        const rot = Math.atan2(-side * nx, -side * nz);
        put(model.geo, x, z, rot); box(model, x, z, rot);
      });
      put(well(), site.x, site.z, site.axis); boxes.push({ x: site.x, z: site.z, w: 2.6, d: 2.6, rot: site.axis });
      const rail = hitchRail();
      for (const [t, side] of [[-8, 1], [9, -1]]) {
        const x = site.x + ux * t + nx * side * 4.6, z = site.z + uz * t + nz * side * 4.6, rot = Math.atan2(ux, uz) + Math.PI / 2;
        put(rail, x, z, rot); boxes.push({ x, z, w: 3.2, d: 0.5, rot });
      }
      for (let k = 0; k < 3; k++) {
        const t = -14 + k * 14, side = k % 2 ? 1 : -1, x = site.x + ux * t + nx * side * 5.6, z = site.z + uz * t + nz * side * 5.6;
        put(streetBits(seed + k), x, z, k); boxes.push({ x, z, w: 1.8, d: 1.8, rot: k });
      }
      if (hash(seed, 3) > 0.4) {
        const tw = waterTower(), x = site.x - ux * 36, z = site.z - uz * 36;
        put(tw.geo, x, z, 0); boxes.push({ x, z, w: 3.2, d: 3.2, rot: 0 });
      }
    } else if (site.kind === 'ranch') {
      const h = house(seed), x = site.x + nx * 6, z = site.z + nz * 6, rot = site.axis;
      put(h.geo, x, z, rot); box(h, x, z, rot);
      const bn = barn(seed + 1), bx = site.x - nx * 10 + ux * 6, bz = site.z - nz * 10 + uz * 6, brot = site.axis + Math.PI / 2;
      put(bn.geo, bx, bz, brot); box(bn, bx, bz, brot);
      const cx = site.x - ux * 14, cz = site.z - uz * 14;
      put(corral(8), cx, cz, 0);
      for (let i = 1; i < 16; i++) { const a = (i / 16) * 6.28; boxes.push({ x: cx + Math.cos(a) * 8, z: cz + Math.sin(a) * 8, w: 3.2, d: 0.4, rot: -a + Math.PI / 2 }); }
      const wx = site.x + ux * 14, wz = site.z + uz * 14;
      put(windmill(), wx, wz, site.axis); boxes.push({ x: wx, z: wz, w: 2.2, d: 2.2, rot: site.axis });
    } else {
      const n = 2 + Math.floor(hash(seed, 4) * 2);
      for (let i = 0; i < n; i++) {
        const a = i * (6.28 / n) + site.axis, x = site.x + Math.cos(a) * 6, z = site.z + Math.sin(a) * 6;
        const rot = Math.atan2(site.x - x, site.z - z);
        put(tent(seed + i), x, z, rot); boxes.push({ x, z, w: 2.8, d: 3.4, rot });
      }
      put(campfire(), site.x, site.z, 0); boxes.push({ x: site.x, z: site.z, w: 2.2, d: 2.2, rot: 0 });
      if (hash(seed, 5) > 0.5) {
        const x = site.x + ux * 10, z = site.z + uz * 10;
        put(wagon(), x, z, site.axis); boxes.push({ x, z, w: 2, d: 4.6, rot: site.axis });
      }
    }

    const geo = mergeGeometries(parts, false);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    let flame = null;
    if (site.kind === 'camp') {
      flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.3, 6), new THREE.MeshBasicMaterial({ color: 0xffa030 }));
      flame.position.set(site.x, site.base + 0.75, site.z);
      scene.add(flame);
    }
    // The people who live here: one merged mesh, standing where sites.js put them.
    const folk = [];
    for (const r of residentsOf(site.name)) {
      const g = npcCache[r.role] || (npcCache[r.role] = npcGeometry(PALETTES[r.role]));
      for (const part of [g.body, g.head]) {
        const c = part.clone();
        _q.setFromAxisAngle(_up, r.face);
        _p.set(r.x, height(r.x, r.z) + (part === g.head ? g.headY : 0), r.z);
        _m.compose(_p, _q, _s);
        c.applyMatrix4(_m); folk.push(c);
      }
      boxes.push({ x: r.x, z: r.z, w: 0.7, d: 0.7, rot: 0 });
    }
    let people = null;
    if (folk.length) {
      people = new THREE.Mesh(mergeGeometries(folk, false), personMaterial);
      people.castShadow = true;
      scene.add(people);
    }
    const tag = `s:${site.name}`;
    if (collision) collision.addBoxes(tag, boxes);
    return { mesh, flame, people, tag };
  }

  function drop(name) {
    const e = loaded.get(name);
    scene.remove(e.mesh); e.mesh.geometry.dispose();
    if (e.flame) { scene.remove(e.flame); e.flame.geometry.dispose(); }
    if (e.people) { scene.remove(e.people); e.people.geometry.dispose(); }
    if (collision) collision.removeTag(e.tag);
    loaded.delete(name);
  }

  // Checks a few sites per frame; builds at most one.
  function update(px, pz) {
    const list = sites();
    let built = false;
    for (let k = 0; k < 8; k++) {
      const s = list[next = (next + 1) % list.length];
      const d = Math.hypot(s.x - px, s.z - pz);
      if (!loaded.has(s.name) && d < LOAD && !built) { loaded.set(s.name, build(s)); built = true; }
      else if (loaded.has(s.name) && d > UNLOAD) drop(s.name);
    }
    const t = performance.now() * 0.01;
    for (const e of loaded.values()) if (e.flame) e.flame.scale.y = 0.8 + Math.sin(t + e.mesh.id) * 0.25;
  }

  function settle(px, pz) { for (const s of sites()) if (Math.hypot(s.x - px, s.z - pz) < LOAD && !loaded.has(s.name)) loaded.set(s.name, build(s)); }

  return { update, settle, loadedCount: () => loaded.size };
}
