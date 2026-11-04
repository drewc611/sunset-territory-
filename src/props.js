import * as THREE from 'three';
import { WORLD, POIS, LAKE, LAKE_Y, hash, fbm, height, nearPOI } from './world.js';

// Everything placed in the world, ported from the prototype with the same seeds so
// the valley matches. Trees, rocks, buildings and tents are still primitives: job 3
// swaps them for instanced GLTF models.

const L = Math.PI; // legacy to physical light units, see sky.js
const flat = { flatShading: true, roughness: 1 };
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
  let grassCell = null;
  function updateGrass(px, pz) {
    const key = Math.floor(px / 10) + ',' + Math.floor(pz / 10);
    if (key === grassCell) return;
    grassCell = key;
    let n = 0;
    const gx0 = Math.floor((px - GR) / GSP), gz0 = Math.floor((pz - GR) / GSP), cnt = Math.floor(GR * 2 / GSP);
    for (let i = 0; i < cnt; i++) for (let j = 0; j < cnt; j++) {
      const gx = gx0 + i, gz = gz0 + j, r1 = hash(gx, gz), r2 = hash(gz, gx);
      const x = gx * GSP + r1 * GSP, z = gz * GSP + r2 * GSP, h = height(x, z);
      if (h < -4 || h > 12 || nearPOI(x, z, 2) || r1 < 0.25) continue;
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

  // Trees.
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4e3421, ...flat });
  const leafMats = [0x3a5a2c, 0x4f6b2f, 0x6b7a33, 0x7a8a3c].map((c) => new THREE.MeshStandardMaterial({ color: c, ...flat }));
  const tierGeo = new THREE.ConeGeometry(1, 1, 7), trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 1, 6);
  const treeBatches = leafMats.map((m) => { const im = new THREE.InstancedMesh(tierGeo, m, 1800); im.castShadow = im.receiveShadow = true; return im; });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, 1200);
  trunks.castShadow = true;
  const tc = [0, 0, 0, 0];
  let tk = 0;
  const trees = []; // {x, z, r} trunk circles for collision later
  for (let i = 0; i < 9000 && tk < 1200; i++) {
    const x = (hash(i, 3) - 0.5) * WORLD * 0.9, z = (hash(i, 9) - 0.5) * WORLD * 0.9, h = height(x, z);
    if (h < -3 || h > 26 || nearPOI(x, z, 7)) continue;
    if (fbm(x * 0.02, z * 0.02 + 9) < 0.98) continue;
    const s = 0.8 + hash(i, 5) * 1.1, b = Math.floor(hash(i, 13) * 4);
    if (tc[b] >= 1800 - 3) continue;
    dummy.rotation.set(0, hash(i, 7) * 6.28, 0);
    dummy.position.set(x, h + 1.5 * s, z);
    dummy.scale.set(s, 3 * s, s);
    dummy.updateMatrix();
    trunks.setMatrixAt(tk++, dummy.matrix);
    trees.push({ x, z, r: 0.45 * s });
    const tiers = 2 + Math.floor(hash(i, 17) * 2);
    for (let t = 0; t < tiers; t++) {
      const r = (2.6 - t * 0.6) * s, hh = (3.2 - t * 0.3) * s;
      dummy.position.set(x, h + 2.4 * s + t * 1.9 * s + hh / 2, z);
      dummy.scale.set(r, hh, r);
      dummy.updateMatrix();
      treeBatches[b].setMatrixAt(tc[b]++, dummy.matrix);
    }
  }
  treeBatches.forEach((im, i) => { im.count = tc[i]; scene.add(im); });
  trunks.count = tk;
  scene.add(trunks);

  // Rocks.
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x75685d, ...flat }), 500);
  let ri = 0;
  for (let i = 0; i < 3000 && ri < 500; i++) {
    const x = (hash(i + 77, 2) - 0.5) * WORLD * 0.92, z = (hash(i + 77, 8) - 0.5) * WORLD * 0.92, h = height(x, z);
    if (h < 10 && hash(i, 4) > 0.2) continue;
    if (nearPOI(x, z, 4)) continue;
    dummy.position.set(x, h + 0.3, z);
    dummy.rotation.set(hash(i, 1) * 3, hash(i, 2) * 3, hash(i, 3));
    const s = 0.6 + hash(i, 6) * 2.6;
    dummy.scale.set(s, s * (0.6 + hash(i, 8) * 0.6), s);
    dummy.updateMatrix();
    rocks.setMatrixAt(ri++, dummy.matrix);
  }
  rocks.count = ri;
  rocks.castShadow = rocks.receiveShadow = true;
  scene.add(rocks);

  // Clouds.
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, fog: false });
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group();
    const n = 3 + Math.floor(hash(i, 1) * 4);
    for (let j = 0; j < n; j++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(6 + hash(i, j) * 8, 8, 6), cloudMat);
      s.position.set((hash(j, i) - 0.5) * 26, (hash(i, j + 5) - 0.5) * 3, (hash(j + 3, i) - 0.5) * 12);
      s.scale.y = 0.45;
      g.add(s);
    }
    g.position.set((hash(i, 22) - 0.5) * 600, 110 + hash(i, 23) * 40, (hash(i, 24) - 0.5) * 600);
    g.userData.v = 1.5 + hash(i, 25) * 2;
    scene.add(g);
    clouds.push(g);
  }

  // Towns and camps.
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8c6b45, ...flat });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3e2f27, ...flat });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x5a4330, ...flat });
  const canvasMat = new THREE.MeshStandardMaterial({ color: 0xcbbda2, ...flat });
  const windowMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, emissive: 0xffb060, emissiveIntensity: 0 });
  const buildings = []; // {x, z, w, d, rot} footprints for collision later

  function building(x, z, w, d, h, rot) {
    const g = new THREE.Group();
    const add = (geo, mat, px, py, pz, ry = 0, shadow = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz); m.rotation.y = ry;
      m.castShadow = shadow; m.receiveShadow = true;
      g.add(m); return m;
    };
    add(new THREE.BoxGeometry(w, h, d), woodMat, 0, h / 2, 0);
    add(new THREE.ConeGeometry(Math.max(w, d) * 0.74, h * 0.55, 4), roofMat, 0, h + h * 0.27, 0, Math.PI / 4);
    add(new THREE.BoxGeometry(w, 0.25, 2), darkWood, 0, 0.12, d / 2 + 1, 0, false);
    add(new THREE.BoxGeometry(w, 0.18, 2.2), roofMat, 0, h * 0.62, d / 2 + 1);
    [-w / 2 + 0.3, w / 2 - 0.3].forEach((px) => add(new THREE.BoxGeometry(0.2, h * 0.62, 0.2), darkWood, px, h * 0.31, d / 2 + 1.9));
    add(new THREE.BoxGeometry(1, 2.2, 0.2), darkWood, 0, 1.1, d / 2 + 0.05, 0, false);
    add(new THREE.BoxGeometry(0.9, 0.9, 0.2), windowMat, w / 4 + 0.4, 1.9, d / 2 + 0.05, 0, false);
    g.position.set(x, height(x, z), z);
    g.rotation.y = rot;
    scene.add(g);
    buildings.push({ x, z, w, d, rot });
  }

  function town(p) {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, r = p.r * 0.55 + hash(i, p.x) * 6;
      building(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, 6 + hash(i, 2) * 5, 6 + hash(i, 3) * 4, 4 + hash(i, 4) * 4, -a + Math.PI / 2);
    }
    const y = height(p.x, p.z);
    const well = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1.1, 10), new THREE.MeshStandardMaterial({ color: 0x8a8078, ...flat }));
    well.position.set(p.x, y + 0.55, p.z);
    well.castShadow = true;
    scene.add(well);
    const postGeo = new THREE.BoxGeometry(0.25, 1.2, 0.25);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * 6.28;
      const post = new THREE.Mesh(postGeo, darkWood);
      post.position.set(p.x + Math.cos(a) * p.r * 0.35, y + 0.6, p.z + Math.sin(a) * p.r * 0.35);
      scene.add(post);
    }
  }

  function camp(p) {
    const y = height(p.x, p.z);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + 0.5;
      const tent = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.2, 4), canvasMat);
      tent.position.set(p.x + Math.cos(a) * 6.5, y + 1.6, p.z + Math.sin(a) * 6.5);
      tent.rotation.y = -a;
      tent.castShadow = true;
      scene.add(tent);
    }
    const logs = new THREE.Mesh(new THREE.TorusGeometry(1, 0.28, 6, 10), darkWood);
    logs.rotation.x = Math.PI / 2;
    logs.position.set(p.x, y + 0.2, p.z);
    scene.add(logs);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.5, 6), new THREE.MeshBasicMaterial({ color: 0xffa030 }));
    flame.position.set(p.x, y + 0.95, p.z);
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

    const elev = sky.elev, night = sky.night;
    cloudMat.color.copy(sky.sunColor).lerp(tmp.copy(white), 0.5).multiplyScalar(0.35 + Math.max(0, elev) * 0.65);
    const fl = 1.2 - Math.max(0, elev);
    fires.forEach((f) => { f.light.intensity = (1.6 + Math.random() * 0.8) * fl * L; f.flame.scale.y = 0.8 + Math.random() * 0.5; });
    windowMat.emissiveIntensity = night * 1.2;
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

  return { update, trees, buildings };
}
