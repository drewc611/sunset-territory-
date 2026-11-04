import * as THREE from 'three';

// Textured terrain. Grass, dirt, rock and snow are blended per pixel in a patched
// MeshStandardMaterial: rock by slope and height (triplanar so cliffs don't stretch),
// dirt and snow from a per-vertex splat attribute. Biome tint comes from the
// prototype's palette so the valley keeps its colors. There are no normal map assets
// yet, so surface relief is a bump derived from texture luminance with screen-space
// derivatives, faded out with distance.

const GRASS_AVG = new THREE.Vector3(0.108, 0.213, 0.019); // measured linear averages of grass.jpg
const GRASS_LUM = 0.16;
const ROCK_LUM = 0.2;

function loadTex(loader, url, anisotropy) {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

// Terrain for the whole 20 km territory, streamed in chunks built by a worker:
//   near: 256 m chunks every 4 m, a square of them around the player (radius by tier),
//         plus one more ring loaded but hidden, so moving never opens a hole;
//   far:  1024 m chunks every 32 m out to the fog. Where near chunks are showing,
//         far vertices are sunk 8 m so they hide underneath.
const NEAR = 256, NEAR_RES = 64, FAR = 1024, FAR_RES = 32;
export const TERRAIN_TIERS = { low: { near: 1, far: 1 }, medium: { near: 1, far: 1 }, high: { near: 2, far: 2 } };

export function createTerrain(scene, renderer, base) {
  const loader = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tGrass = loadTex(loader, `${base}assets/grass.jpg`, aniso);
  const tRock = loadTex(loader, `${base}assets/rock.jpg`, aniso);

  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  mat.userData.textures = [tGrass, tRock]; // shader uniforms, listed so the perf HUD counts them
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      tGrass: { value: tGrass }, tRock: { value: tRock },
      grassAvg: { value: GRASS_AVG }, bumpAmt: { value: 0.9 },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 biome; attribute vec3 splat; attribute vec3 tint;
        varying vec3 vBiome; varying vec3 vSplat; varying vec3 vTint; varying vec3 vWPos; varying vec3 vWNrm;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vBiome = biome; vSplat = splat; vTint = tint;
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNrm = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tGrass; uniform sampler2D tRock; uniform vec3 grassAvg; uniform float bumpAmt;
        varying vec3 vBiome; varying vec3 vSplat; varying vec3 vTint; varying vec3 vWPos; varying vec3 vWNrm;
        float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
        float tHeight;`)
      .replace('#include <map_fragment>', `
        vec3 wn = normalize(vWNrm);
        float slope = 1.0 - wn.y;
        // Grass: two scales plus a rotated copy so the 1024px tile never lines up.
        vec2 p = vWPos.xz;
        vec3 g1 = texture2D(tGrass, p * 0.21).rgb;
        vec3 g2 = texture2D(tGrass, mat2(0.8, -0.6, 0.6, 0.8) * p * 0.047 + 0.31).rgb;
        vec3 gt = mix(g1, g2, 0.4);
        float gl = lum(gt) / ${GRASS_LUM.toFixed(3)};
        vec3 grassCol = vBiome * mix(vec3(gl), gt / grassAvg, 0.22);
        // Rock: triplanar.
        vec3 bw = pow(abs(wn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        vec3 rt = texture2D(tRock, vWPos.zy * 0.11).rgb * bw.x
                + texture2D(tRock, vWPos.xz * 0.11).rgb * bw.y
                + texture2D(tRock, vWPos.xy * 0.11).rgb * bw.z;
        float rl = lum(rt) / ${ROCK_LUM.toFixed(3)};
        vec3 rockCol = vec3(0.30, 0.25, 0.21) * rl * vTint;
        // Dirt: rock texture at a finer scale, dusty tint; mud by the lake.
        float dl = lum(texture2D(tRock, p * 0.37 + 0.5).rgb) / ${ROCK_LUM.toFixed(3)};
        vec3 dirtCol = mix(vec3(0.34, 0.24, 0.14), vec3(0.12, 0.09, 0.06), vSplat.z) * mix(1.0, dl, 0.6) * vTint;
        // Macro variation, very low frequency, breaks up repetition at 30m+.
        float macro = texture2D(tGrass, p * 0.0043).g / grassAvg.g;
        float dirtW = clamp(vSplat.x + (macro - 1.0) * 0.25, 0.0, 1.0);
        dirtW = max(dirtW, vSplat.z);
        float rockW = smoothstep(0.24, 0.42, slope + (rl - 1.0) * 0.12);
        // The valley ridge goes to rock with height; out in the territory only slope does.
        rockW = max(rockW, smoothstep(20.0, 30.0, vWPos.y) * 0.75 * (1.0 - smoothstep(230.0, 480.0, length(vWPos.xz))));
        vec3 alb = mix(grassCol, dirtCol, smoothstep(0.25, 0.75, dirtW));
        alb = mix(alb, rockCol, rockW);
        alb = mix(alb, vec3(0.62, 0.6, 0.57), smoothstep(0.2, 0.6, vSplat.y) * (1.0 - rockW * 0.6));
        alb *= mix(0.86, 1.14, clamp(macro * 0.5, 0.0, 1.0));
        diffuseColor.rgb *= alb;
        tHeight = mix(mix(gl, dl, dirtW), rl, rockW);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 vp = -vViewPosition;
          vec3 dpdx = dFdx(vp), dpdy = dFdy(vp);
          float dhx = dFdx(tHeight), dhy = dFdy(tHeight);
          vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
          float det = dot(dpdx, r1);
          float fade = 1.0 - smoothstep(18.0, 55.0, length(vViewPosition));
          vec3 grad = sign(det) * (dhx * r1 + dhy * r2) * bumpAmt * 0.04 * fade;
          normal = normalize(abs(det) * normal - grad);
        }`);
  };

  // --- chunk streaming ---------------------------------------------------------
  const worker = new Worker(new URL('./terrain-worker.js', import.meta.url), { type: 'module' });
  const chunks = new Map(); // key -> { mesh, kind, cx, cz, drop }
  const pending = new Map(); // id -> { key, resolve }
  let nextId = 1, tier = TERRAIN_TIERS.high, inflight = 0;
  const queue = [];

  worker.onmessage = (e) => {
    const m = e.data;
    const job = pending.get(m.id);
    if (!job) return;
    pending.delete(m.id);
    inflight--;
    job.resolve(m);
  };
  function request(msg) {
    return new Promise((resolve) => { const id = nextId++; pending.set(id, { resolve }); inflight++; worker.postMessage({ ...msg, id }); });
  }

  function makeMesh(r) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(r.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(r.nor, 3));
    g.setAttribute('biome', new THREE.BufferAttribute(r.biome, 3));
    g.setAttribute('splat', new THREE.BufferAttribute(r.splat, 3));
    g.setAttribute('tint', new THREE.BufferAttribute(r.tint, 3));
    g.setIndex(new THREE.BufferAttribute(r.index, 1));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  const key = (kind, cx, cz) => `${kind}:${cx}:${cz}`;
  let nearCX = null, nearCZ = null, dropBox = null;

  function want(kind, cx, cz, drop) {
    const k = key(kind, cx, cz);
    const have = chunks.get(k);
    const dropKey = drop ? `${drop.x0},${drop.z0},${drop.x1},${drop.z1}` : '';
    if (have && have.dropKey === dropKey) return have;
    if (have && have.loading) return have;
    const size = kind === 'n' ? NEAR : FAR, res = kind === 'n' ? NEAR_RES : FAR_RES;
    const entry = have || { kind, cx, cz };
    entry.loading = true;
    entry.wantDrop = dropKey;
    chunks.set(k, entry);
    queue.push(() => request({ type: 'chunk', x0: cx * size, z0: cz * size, size, res, drop }).then((r) => {
      const mesh = makeMesh(r);
      if (entry.mesh) { scene.remove(entry.mesh); entry.mesh.geometry.dispose(); }
      entry.mesh = mesh; entry.dropKey = dropKey; entry.loading = false;
      if (kind === 'n') entry.pos = r.pos; // kept for sampleHeight
      if (entry.wantDrop !== dropKey) dropBox = null; // the near square moved while this built: recheck
      scene.add(mesh);
      applyVisibility();
    }));
    return entry;
  }

  function applyVisibility() {
    for (const c of chunks.values()) {
      if (!c.mesh) continue;
      if (c.kind === 'n') c.mesh.visible = Math.abs(c.cx - nearCX) <= tier.near && Math.abs(c.cz - nearCZ) <= tier.near;
    }
  }

  // Call every frame with the player position.
  function update(px, pz) {
    const ncx = Math.floor(px / NEAR), ncz = Math.floor(pz / NEAR);
    if (ncx !== nearCX || ncz !== nearCZ || !dropBox) {
      nearCX = ncx; nearCZ = ncz;
      const r = tier.near;
      dropBox = { x0: (ncx - r) * NEAR, z0: (ncz - r) * NEAR, x1: (ncx + r + 1) * NEAR, z1: (ncz + r + 1) * NEAR };
      const keep = new Set();
      // Near chunks: the visible square plus one ring preloaded, nearest first.
      const list = [];
      for (let dz = -r - 1; dz <= r + 1; dz++) for (let dx = -r - 1; dx <= r + 1; dx++) list.push([dx, dz]);
      list.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
      for (const [dx, dz] of list) { want('n', ncx + dx, ncz + dz, null); keep.add(key('n', ncx + dx, ncz + dz)); }
      // Far chunks around the player, sunk where they overlap the visible near square.
      const fcx = Math.floor(px / FAR), fcz = Math.floor(pz / FAR), fr = tier.far;
      for (let dz = -fr; dz <= fr; dz++) for (let dx = -fr; dx <= fr; dx++) {
        const cx = fcx + dx, cz = fcz + dz;
        const x0 = cx * FAR, z0 = cz * FAR;
        const overlaps = dropBox.x0 < x0 + FAR && dropBox.x1 > x0 && dropBox.z0 < z0 + FAR && dropBox.z1 > z0;
        want('f', cx, cz, overlaps ? dropBox : null);
        keep.add(key('f', cx, cz));
      }
      for (const [k, c] of chunks) {
        if (keep.has(k) || c.loading) continue;
        if (c.mesh) { scene.remove(c.mesh); c.mesh.geometry.dispose(); }
        chunks.delete(k);
      }
      applyVisibility();
    }
    // Keep the worker busy but not flooded.
    while (queue.length && inflight < 2) queue.shift()();
  }

  function setTier(name) { tier = TERRAIN_TIERS[name] || TERRAIN_TIERS.high; dropBox = null; }

  // Resolves once every chunk around (px, pz) is built, for the loading screen.
  function settle(px, pz) {
    update(px, pz);
    return new Promise((resolve) => {
      const tick = () => {
        update(px, pz);
        const loading = [...chunks.values()].some((c) => c.loading);
        if (!loading && !queue.length) resolve(); else setTimeout(tick, 30);
      };
      tick();
    });
  }

  // Height of the drawn surface at (x, z), from a loaded near chunk, or null.
  // Interpolates on the same triangles the mesh uses, so things sit on the ground.
  const step = NEAR / NEAR_RES, n = NEAR_RES + 1;
  function sampleHeight(x, z) {
    const cx = Math.floor(x / NEAR), cz = Math.floor(z / NEAR);
    const c = chunks.get(key('n', cx, cz));
    if (!c || !c.pos) return null;
    const fx = (x - cx * NEAR) / step, fz = (z - cz * NEAR) / step;
    const i = Math.min(NEAR_RES - 1, Math.floor(fx)), j = Math.min(NEAR_RES - 1, Math.floor(fz));
    const u = fx - i, v = fz - j, p = c.pos;
    const ya = p[(j * n + i) * 3 + 1], yb = p[(j * n + i + 1) * 3 + 1], yc = p[((j + 1) * n + i) * 3 + 1], yd = p[((j + 1) * n + i + 1) * 3 + 1];
    // Triangles (a, c, b) and (b, c, d), split along the b to c diagonal.
    return u + v <= 1 ? ya + (yb - ya) * u + (yc - ya) * v : yd + (yc - yd) * (1 - u) + (yb - yd) * (1 - v);
  }

  function map(cx, cz, span, px) { return request({ type: 'map', cx, cz, span, px }); }

  return { update, setTier, settle, map, sampleHeight, material: mat, chunkCount: () => chunks.size };
}
