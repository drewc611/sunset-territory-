import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WORLD, POIS, LAKE, LAKE_Y, hash, fbm, height, nearPOI } from './world.js';
import { Builder, pine, cottonwood, juniper, boulder, slab, shop, house, church, waterTower, streetBits, hitchRail, well, tent, campfire, wagon } from './models.js';

// Everything placed in the world. Trees, rocks, towns and camps use the low poly
// models in models.js; placement uses the prototype's seeds so the valley matches.

const L = Math.PI; // legacy to physical light units, see sky.js
const dummy = new THREE.Object3D();

export function createProps(scene, base) {
  const uTime = { value: 0 };
  const windows = [];
  const fires = [];

  // Grass sway shared by the blade instances.
  function sway(mat, amp) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 wp = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float sw = sin(uTime * 1.8 + wp.x * 0.35 + wp.z * 0.25) * ${amp} * max(transformed.y, 0.0);
        transformed.x += sw; transformed.z += sw * 0.4;`);
    };
  }

  // Water: animated normal map from water.jpg.
  const waterNormal = new THREE.TextureLoader().load(`${base}assets/water.jpg`);
  waterNormal.wrapS = waterNormal.wrapT = THREE.RepeatWrapping;
  waterNormal.repeat.set(6, 6);
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(LAKE.r - 1, 48),
    new THREE.MeshPhongMaterial({
      color: 0x2a5566, specular: 0xffffff, shininess: 120, transparent: true, opacity: 0.86,
      normalMap: waterNormal, normalScale: new THREE.Vector2(0.35, 0.35),
    }),
  );
  // Fresnel: looking across the lake it mirrors the sky's horizon color; looking
  // down it goes clear and dark.
  const uSky = { value: new THREE.Color(0xd9b98c) };
  water.material.onBeforeCompile = (sh) => {
    sh.uniforms.uSky = uSky;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSky;')
      .replace('#include <opaque_fragment>', `
        float fres = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 4.0);
        outgoingLight = mix(outgoingLight, uSky, 0.12 + 0.72 * fres);
        diffuseColor.a = mix(0.72, 0.97, fres);
        #include <opaque_fragment>`);
  };
  water.rotation.x = -Math.PI / 2;
  water.position.set(LAKE.x, LAKE_Y, LAKE.z);
  scene.add(water);

  // Grass blades around the rider, re-laid when the rider crosses a 10m cell.
  const GR = 40, GSP = 0.9, GN = Math.floor((GR * 2 / GSP) ** 2);
  // A tuft of five tapered blades, darker at the root, leaning slightly outward.
  const bladeGeo = new THREE.BufferGeometry();
  {
    const v = [], col = [];
    const root = [0.32, 0.3, 0.14], tip = [0.95, 0.9, 0.55];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + k * 0.7, w = 0.05, h = 0.42 + (k % 3) * 0.1, lean = 0.12;
      const cx = Math.cos(a), sz = Math.sin(a), ox = cx * 0.06, oz = sz * 0.06;
      const px = -sz * w, pz = cx * w;
      const A = [ox - px, 0, oz - pz], B = [ox + px, 0, oz + pz], T = [ox + cx * lean, h, oz + sz * lean];
      v.push(...A, ...B, ...T, ...B, ...A, ...T); // both windings, so FrontSide covers both faces
      col.push(...root, ...root, ...tip, ...root, ...root, ...tip);
    }
    bladeGeo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    bladeGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    bladeGeo.computeVertexNormals();
    // Normals point up on both faces so blades light like the ground under them.
    // (DoubleSide would flip the back face normal downward and turn backlit blades black.)
    const n = bladeGeo.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  }
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x9a9550, vertexColors: true });
  sway(grassMat, 0.25);
  const grass = new THREE.InstancedMesh(bladeGeo, grassMat, GN);
  grass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  grass.frustumCulled = false;
  scene.add(grass);
  let grassCell = null, grassDensity = 1;
  function updateGrass(px, pz) {
    const key = Math.floor(px / 10) + ',' + Math.floor(pz / 10);
    if (key === grassCell) return;
    grassCell = key;
    let n = 0;
    const gx0 = Math.floor((px - GR) / GSP), gz0 = Math.floor((pz - GR) / GSP), cnt = Math.floor(GR * 2 / GSP);
    for (let i = 0; i < cnt; i++) for (let j = 0; j < cnt; j++) {
      const gx = gx0 + i, gz = gz0 + j, r1 = hash(gx, gz), r2 = hash(gz, gx);
      const x = gx * GSP + r1 * GSP, z = gz * GSP + r2 * GSP, h = height(x, z);
      if (h < -4 || h > 12 || nearPOI(x, z, 2) || r1 < 0.25 || r2 > grassDensity) continue;
      dummy.position.set(x, h, z);
      dummy.rotation.set(0, r1 * 6.28, 0);
      const sc = 0.8 + r2 * 0.7;
      dummy.scale.set(sc, sc * (0.8 + r1 * 0.6), sc);
      dummy.updateMatrix();
      grass.setMatrixAt(n++, dummy.matrix);
    }
    grass.count = n;
    grass.instanceMatrix.needsUpdate = true;
  }

  // Clouds: lumpy flattened clusters, one merged mesh per cloud, drifting east.
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: false, flatShading: true });
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const cb = new Builder();
    const n = 4 + Math.floor(hash(i, 1) * 4);
    for (let j = 0; j < n; j++) {
      cb.add(new THREE.IcosahedronGeometry(6 + hash(i, j) * 8, 1), 0xffffff,
        { x: (hash(j, i) - 0.5) * 30, y: (hash(i, j + 5) - 0.5) * 3, z: (hash(j + 3, i) - 0.5) * 14, sy: 0.42 },
        { jitter: 2.5, seed: i * 10 + j });
    }
    const g = new THREE.Mesh(cb.build(), cloudMat);
    g.position.set((hash(i, 22) - 0.5) * 600, 110 + hash(i, 23) * 40, (hash(i, 24) - 0.5) * 600);
    g.userData.v = 1.5 + hash(i, 25) * 2;
    scene.add(g);
    clouds.push(g);
  }

  // Shared material for everything built in models.js: vertex colors, wind sway on
  // foliage, and windows that light up at night.
  const uNight = { value: 0 };
  const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  propMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.uniforms.uNight = uNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float glow; attribute float sway; varying float vGlow; uniform float uTime;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vGlow = glow;
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float ph = uTime * 1.3 + ip.x * 0.21 + ip.z * 0.17;
        transformed.x += sin(ph) * sway * 0.22;
        transformed.z += cos(ph * 0.8) * sway * 0.14;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vGlow; uniform float uNight;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.6, 0.28) * vGlow * (0.05 + uNight * 4.0);`);
  };

  const trees = [];     // {x, z, r} trunk circles for collision
  const rocksCol = [];  // {x, z, r}
  const buildings = []; // {x, z, w, d, rot} oriented footprints for collision
  const towns = {};     // name -> street frame {x, z, ux, uz, nx, nz}, for placing people

  function instanced(variants, list, castShadow = true) {
    // list: [{v, x, y, z, ry, s}] → one InstancedMesh per variant.
    variants.forEach((geo, vi) => {
      const mine = list.filter((it) => it.v === vi);
      if (!mine.length) return;
      const im = new THREE.InstancedMesh(geo, propMat, mine.length);
      mine.forEach((it, k) => {
        dummy.position.set(it.x, it.y, it.z);
        dummy.rotation.set(it.rx || 0, it.ry || 0, 0);
        dummy.scale.setScalar(it.s);
        dummy.updateMatrix();
        im.setMatrixAt(k, dummy.matrix);
      });
      im.castShadow = castShadow;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      scene.add(im);
    });
  }

  // Trees: pines on the slopes and ridge, cottonwoods by water and low ground,
  // junipers scattered on dry ground. Same clustering noise as the prototype.
  const pines = [pine(11), pine(23), pine(37)];
  const cottons = [cottonwood(5), cottonwood(17)];
  const junipers = [juniper(3), juniper(8), juniper(13)];
  const pineList = [], cottonList = [], juniperList = [];
  for (let i = 0; i < 12000 && trees.length < 1400; i++) {
    const x = (hash(i, 3) - 0.5) * WORLD * 0.92, z = (hash(i, 9) - 0.5) * WORLD * 0.92, h = height(x, z);
    if (h < -4 || h > 30 || nearPOI(x, z, 7)) continue;
    const r = hash(i, 5), cl = fbm(x * 0.02, z * 0.02 + 9);
    const lakeD = Math.hypot(x - LAKE.x, z - LAKE.z);
    let kind = null;
    if (lakeD < LAKE.r + 22 && h < 6 && r > 0.55) kind = 'cotton';
    else if (cl > 0.98 && h > 2) kind = 'pine';
    else if (cl > 0.9 && h <= 2 && r > 0.6) kind = 'juniper';
    else if (cl > 0.75 && r > 0.985) kind = 'juniper';
    if (!kind) continue;
    const s = 0.75 + hash(i, 7) * 0.55, ry = hash(i, 13) * 6.28;
    if (kind === 'pine') { pineList.push({ v: i % 3, x, y: h - 0.2, z, ry, s }); trees.push({ x, z, r: 0.34 * s + 0.25 }); }
    if (kind === 'cotton') { cottonList.push({ v: i % 2, x, y: h - 0.2, z, ry, s }); trees.push({ x, z, r: 0.5 * s + 0.25 }); }
    if (kind === 'juniper') { juniperList.push({ v: i % 3, x, y: h - 0.1, z, ry, s: s * 0.9 }); trees.push({ x, z, r: 0.5 }); }
  }
  instanced(pines.map((p) => p.geo), pineList);
  instanced(cottons.map((p) => p.geo), cottonList);
  instanced(junipers.map((p) => p.geo), juniperList);

  // Rocks: boulders everywhere above the valley floor, slabs on the ridge.
  const boulders = [boulder(1), boulder(2, 0x9a8068), boulder(3, 0x7a6858)];
  const slabs = [slab(4), slab(5, 0x8a7060)];
  const boulderList = [], slabList = [];
  for (let i = 0; i < 4000 && boulderList.length + slabList.length < 520; i++) {
    const x = (hash(i + 77, 2) - 0.5) * WORLD * 0.92, z = (hash(i + 77, 8) - 0.5) * WORLD * 0.92, h = height(x, z);
    if (h < 10 && hash(i, 4) > 0.2) continue;
    if (nearPOI(x, z, 4)) continue;
    const s = 0.6 + hash(i, 6) * 2.4, ry = hash(i, 2) * 6.28;
    if (h > 20 && hash(i, 11) > 0.5) slabList.push({ v: i % 2, x, y: h - 0.3 * s, z, ry, s });
    else boulderList.push({ v: i % 3, x, y: h + 0.1 * s, z, ry, s });
    rocksCol.push({ x, z, r: 0.95 * s });
  }
  instanced(boulders, boulderList);
  instanced(slabs, slabList);

  // Towns: buildings in two rows along a main street, merged into one mesh per town.
  const TOWN_PLAN = {
    'Brass Hollow': { axis: 0.35, slots: [-21, -10.5, 0, 10.5, 21], church: 1, tower: true },
    'Caldwell Crossing': { axis: 1.25, slots: [-16, -5.5, 5, 15.5], church: 0, tower: false },
  };
  const _mat4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
  function placed(geo, x, y, z, rot) {
    const g = geo.clone();
    _q4.setFromAxisAngle(_up, rot);
    _mat4.compose(new THREE.Vector3(x, y, z), _q4, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(_mat4);
    return g;
  }
  function footprint(model, x, z, rot) {
    // model.zc is the footprint center along the model's local z.
    buildings.push({ x: x + Math.sin(rot) * model.zc, z: z + Math.cos(rot) * model.zc, w: model.w, d: model.d, rot });
  }

  function town(p) {
    const plan = TOWN_PLAN[p.name];
    const parts = [];
    const y0 = height(p.x, p.z);
    const ux = Math.cos(plan.axis), uz = Math.sin(plan.axis); // street direction
    const nx = -uz, nz = ux;                                   // across the street
    towns[p.name] = { x: p.x, z: p.z, ux, uz, nx, nz };
    let seed = Math.floor(p.x * 13 + p.z * 7);
    for (const side of [-1, 1]) {
      plan.slots.forEach((t, k) => {
        seed++;
        let model;
        if (side === 1 && k === plan.church && plan.church >= 0 && p.name === 'Brass Hollow') model = church(seed);
        else model = (k + (side > 0 ? 1 : 0)) % 3 === 2 ? house(seed) : shop(seed);
        const off = 8.5;
        const x = p.x + ux * t + nx * side * off, z = p.z + uz * t + nz * side * off;
        // Face the street: local +z points along -side * n.
        const rot = Math.atan2(-side * nx, -side * nz);
        parts.push(placed(model.geo, x, height(x, z), z, rot));
        footprint(model, x, z, rot);
      });
    }
    // Street dressing.
    const wl = well();
    parts.push(placed(wl, p.x, y0, p.z, plan.axis));
    buildings.push({ x: p.x, z: p.z, w: 2.6, d: 2.6, rot: plan.axis });
    const rail = hitchRail();
    for (const [t, side] of [[-6, 1], [6, -1], [14, 1], [-14, -1]]) {
      const x = p.x + ux * t + nx * side * 4.6, z = p.z + uz * t + nz * side * 4.6;
      const rot = Math.atan2(ux, uz) + Math.PI / 2;
      parts.push(placed(rail, x, height(x, z), z, rot));
      buildings.push({ x, z, w: 3.2, d: 0.5, rot });
    }
    for (let k = 0; k < 4; k++) {
      const t = -18 + k * 12, side = k % 2 ? 1 : -1;
      const x = p.x + ux * t + nx * side * 5.6, z = p.z + uz * t + nz * side * 5.6;
      parts.push(placed(streetBits(seed + k), x, height(x, z), z, k));
      buildings.push({ x, z, w: 1.8, d: 1.8, rot: k });
    }
    if (plan.tower) {
      const tw = waterTower();
      const x = p.x - ux * 29, z = p.z - uz * 29;
      parts.push(placed(tw.geo, x, height(x, z), z, 0));
      buildings.push({ x, z, w: 3.2, d: 3.2, rot: 0 });
    }
    // Cottonwoods shading the street ends.
    for (const t of [-30, 30]) for (const side of [-1, 1]) {
      const x = p.x + ux * t + nx * side * 7, z = p.z + uz * t + nz * side * 7;
      parts.push(placed(cottons[(t > 0) ? 0 : 1].geo, x, height(x, z) - 0.2, z, t + side));
      trees.push({ x, z, r: 0.75 });
    }
    const merged = mergeGeometries(parts, false);
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, propMat);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }

  function camp(p) {
    const y = height(p.x, p.z);
    const parts = [];
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + 0.5, x = p.x + Math.cos(a) * 6.5, z = p.z + Math.sin(a) * 6.5;
      // Open end faces the fire.
      const rot = Math.atan2(p.x - x, p.z - z);
      parts.push(placed(tent(i + Math.floor(p.x)), x, height(x, z), z, rot));
      buildings.push({ x, z, w: 2.8, d: 3.4, rot });
    }
    parts.push(placed(campfire(), p.x, y, p.z, 0));
    if (p.name === "Drover's Camp") {
      const x = p.x + 9, z = p.z - 4;
      parts.push(placed(wagon(), x, height(x, z), z, 0.6));
      buildings.push({ x, z, w: 2.0, d: 4.6, rot: 0.6 });
    }
    const merged = mergeGeometries(parts, false);
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, propMat);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    buildings.push({ x: p.x, z: p.z, w: 2.2, d: 2.2, rot: 0 });

    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.3, 6), new THREE.MeshBasicMaterial({ color: 0xffa030 }));
    flame.position.set(p.x, y + 0.75, p.z);
    scene.add(flame);
    const light = new THREE.PointLight(0xff8c3a, 2 * L, 34, 2);
    light.position.set(p.x, y + 2, p.z);
    scene.add(light);
    fires.push({ flame, light });
  }

  POIS.forEach((p) => { if (p.type === 'town') town(p); if (p.type === 'camp') camp(p); });

  // Dust kicked up at a gallop.
  const DUST = 80;
  const dustPos = new Float32Array(DUST * 3).fill(-999);
  const dustLife = new Float32Array(DUST);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const puff = document.createElement('canvas');
  puff.width = puff.height = 64;
  {
    const x = puff.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  }
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xc9b48a, size: 1.8, map: new THREE.CanvasTexture(puff), transparent: true, opacity: 0.5, depthWrite: false,
  }));
  dust.frustumCulled = false;
  scene.add(dust);
  let dustI = 0;

  const tmp = new THREE.Color(), white = new THREE.Color(0xffffff);

  function update(dt, sky, rider) {
    uTime.value += dt;
    waterNormal.offset.set(uTime.value * 0.012, uTime.value * 0.007);
    uSky.value.copy(sky.horizonTint);

    const elev = sky.elev, night = sky.night;
    cloudMat.color.copy(sky.sunColor).lerp(tmp.copy(white), 0.5).multiplyScalar((0.35 + Math.max(0, elev) * 0.65) * (1 - (sky.overcast || 0) * 0.4));
    const fl = 1.2 - Math.max(0, elev);
    fires.forEach((f) => { f.light.intensity = (1.6 + Math.random() * 0.8) * fl * L; f.flame.scale.y = 0.8 + Math.random() * 0.5; });
    uNight.value = night;
    clouds.forEach((cl) => { cl.position.x += cl.userData.v * dt; if (cl.position.x > 320) cl.position.x = -320; });

    updateGrass(rider.x, rider.z);

    if (rider.speed > 12 && Math.random() < dt * 30) {
      const i = dustI++ % DUST;
      dustPos[i * 3] = rider.x - Math.sin(rider.heading) * 1.5 + (Math.random() - 0.5);
      dustPos[i * 3 + 1] = rider.y + 0.2;
      dustPos[i * 3 + 2] = rider.z - Math.cos(rider.heading) * 1.5 + (Math.random() - 0.5);
      dustLife[i] = 1;
    }
    for (let i = 0; i < DUST; i++) {
      if (dustLife[i] > 0) { dustLife[i] -= dt * 0.8; dustPos[i * 3 + 1] += dt * 1.2; } else dustPos[i * 3 + 1] = -999;
    }
    dustGeo.attributes.position.needsUpdate = true;
  }

  function setGrassDensity(d) { grassDensity = d; grassCell = null; }

  // Distance to the nearest campfire, for crackle volume.
  function nearFire(x, z) {
    let best = Infinity;
    for (const f of fires) best = Math.min(best, Math.hypot(f.light.position.x - x, f.light.position.z - z));
    return best;
  }

  return { update, trees, rocks: rocksCol, buildings, towns, material: propMat, setGrassDensity, nearFire };
}
