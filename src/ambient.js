import * as THREE from 'three';
import { POIS, height, hash } from './world.js';

// Ambient life and weather: campfire smoke, birds over the trees by day, dust devils
// on The Flats, and a weather state (clear, overcast, rain) chosen each dawn.

function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createAmbient(scene, { forcedWeather } = {}) {
  const dot = softDot();

  // Campfire smoke: a column of soft puffs per camp, leaning with the wind.
  const camps = POIS.filter((p) => p.type === 'camp');
  const SMOKE = 26;
  const smoke = camps.map((c) => {
    const pos = new Float32Array(SMOKE * 3), life = new Float32Array(SMOKE);
    for (let i = 0; i < SMOKE; i++) life[i] = i / SMOKE;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbdb2a2, size: 2.6, map: dot, transparent: true, opacity: 0.28, depthWrite: false }));
    pts.frustumCulled = false;
    scene.add(pts);
    return { c, y: height(c.x, c.z), pos, life, g };
  });

  // Birds: two loose flocks circling above the trees.
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.15, -0.45, 0.05, -0.1, 0, 0, -0.05, 0, 0, 0.15, 0.45, 0.05, -0.1, 0, 0, -0.05], 3));
  birdGeo.computeVertexNormals();
  const BIRDS = 14;
  const birds = new THREE.InstancedMesh(birdGeo, new THREE.MeshBasicMaterial({ color: 0x2a2018, side: THREE.DoubleSide }), BIRDS);
  birds.frustumCulled = false;
  scene.add(birds);
  const flocks = [{ x: -70, z: -40, r: 30, y: 34 }, { x: 40, z: 90, r: 24, y: 30 }];
  const dm = new THREE.Object3D();

  // Dust devils on The Flats: a spinning funnel of dust that wanders and fades.
  const flats = POIS.find((p) => p.name === 'The Flats');
  const DEV = 90;
  const devPos = new Float32Array(DEV * 3);
  const devGeo = new THREE.BufferGeometry(); devGeo.setAttribute('position', new THREE.BufferAttribute(devPos, 3));
  const devMat = new THREE.PointsMaterial({ color: 0xc9b48a, size: 1.5, map: dot, transparent: true, opacity: 0, depthWrite: false });
  const devil = new THREE.Points(devGeo, devMat);
  devil.frustumCulled = false;
  scene.add(devil);
  const dv = { x: flats.x, z: flats.z, t: 0, life: 0, next: 20, vx: 0, vz: 0 };

  // Rain: streaks in a box that follows the camera.
  const RAIN = 700, BOX = 26;
  const rainPos = new Float32Array(RAIN * 6);
  for (let i = 0; i < RAIN; i++) {
    const x = (Math.random() - 0.5) * BOX * 2, y = Math.random() * 22, z = (Math.random() - 0.5) * BOX * 2;
    rainPos.set([x, y, z, x + 0.06, y - 0.7, z], i * 6);
  }
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: 0xaab4c0, transparent: true, opacity: 0, depthWrite: false });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  scene.add(rain);

  // Weather. overcast and wet ease toward their targets so changes roll in.
  const weather = { kind: 'clear', overcast: 0, wet: 0, day: -1 };
  const KINDS = { clear: [0, 0], overcast: [0.75, 0], rain: [1, 1] };
  function pickWeather(day) {
    if (forcedWeather) return forcedWeather;
    if (day === 0) return 'clear'; // the first day is always clear: first impressions
    const r = hash(day * 7.3, 2.1);
    return r < 0.62 ? 'clear' : r < 0.85 ? 'overcast' : 'rain';
  }

  let t = 0;
  function update(dt, { clockH, dayIndex, night, camera }) {
    t += dt;

    // New weather each dawn (and on the first frame).
    if (weather.day !== dayIndex && (weather.day === -1 || (clockH > 5 && clockH < 6))) {
      const first = weather.day === -1;
      weather.day = dayIndex;
      weather.kind = pickWeather(dayIndex);
      if (first) [weather.overcast, weather.wet] = KINDS[weather.kind]; // start as it is, roll in later changes
    }
    const [oc, wt] = KINDS[weather.kind];
    weather.overcast += (oc - weather.overcast) * Math.min(1, dt * 0.08);
    weather.wet += (wt - weather.wet) * Math.min(1, dt * 0.12);

    const wind = 0.6 + weather.overcast * 0.8;
    for (const s of smoke) {
      for (let i = 0; i < SMOKE; i++) {
        s.life[i] += dt * 0.12;
        if (s.life[i] > 1) s.life[i] -= 1;
        const l = s.life[i];
        s.pos[i * 3] = s.c.x + l * l * 6 * wind + Math.sin(t * 0.7 + i) * 0.3 * l;
        s.pos[i * 3 + 1] = s.y + 1.4 + l * 11;
        s.pos[i * 3 + 2] = s.c.z + l * l * 2.5 * wind + Math.cos(t * 0.6 + i) * 0.3 * l;
      }
      s.g.attributes.position.needsUpdate = true;
    }

    // Birds by day, settled at night.
    const day = 1 - night;
    birds.visible = day > 0.2 && weather.wet < 0.5;
    if (birds.visible) {
      for (let i = 0; i < BIRDS; i++) {
        const f = flocks[i % 2], k = i / BIRDS;
        const a = t * (0.18 + k * 0.05) + k * 6.28 * 2;
        const r = f.r * (0.7 + 0.3 * Math.sin(k * 9 + t * 0.2));
        dm.position.set(f.x + Math.cos(a) * r, f.y + Math.sin(t * 0.6 + k * 5) * 3, f.z + Math.sin(a) * r);
        dm.rotation.set(0, -a, 0);
        const flap = 0.4 + Math.abs(Math.sin(t * 9 + i * 1.7)) * 0.9;
        dm.scale.set(1, flap, 1);
        dm.updateMatrix();
        birds.setMatrixAt(i, dm.matrix);
      }
      birds.instanceMatrix.needsUpdate = true;
    }

    // Dust devil: spawns on clear afternoons, wanders across the Flats for ~25 s.
    dv.next -= dt;
    if (dv.life <= 0 && dv.next <= 0 && weather.kind === 'clear' && clockH > 11 && clockH < 17) {
      dv.life = 25; dv.t = 0;
      const a = Math.random() * 6.28;
      dv.x = flats.x + Math.cos(a) * flats.r * 0.4; dv.z = flats.z + Math.sin(a) * flats.r * 0.4;
      dv.vx = Math.cos(a + 2) * 2.2; dv.vz = Math.sin(a + 2) * 2.2;
    }
    if (dv.life > 0) {
      dv.life -= dt; dv.t += dt;
      if (dv.life <= 0) dv.next = 40 + Math.random() * 60;
      dv.x += dv.vx * dt; dv.z += dv.vz * dt;
      const fade = Math.min(1, dv.t / 3, dv.life / 3);
      devMat.opacity = 0.4 * fade;
      const gy = height(dv.x, dv.z);
      for (let i = 0; i < DEV; i++) {
        const k = i / DEV, h = k * 14, r = 0.5 + k * 3.2;
        const a = t * 5 + i * 2.4;
        devPos[i * 3] = dv.x + Math.cos(a) * r + Math.sin(t + k * 3) * k * 1.5;
        devPos[i * 3 + 1] = gy + h;
        devPos[i * 3 + 2] = dv.z + Math.sin(a) * r;
      }
      devGeo.attributes.position.needsUpdate = true;
    } else devMat.opacity = 0;

    // Rain follows the camera.
    rainMat.opacity = weather.wet * 0.5;
    rain.visible = weather.wet > 0.02;
    if (rain.visible) {
      for (let i = 0; i < RAIN; i++) {
        let y = rainPos[i * 6 + 1] - dt * 24;
        if (y < 0) y += 22;
        rainPos[i * 6 + 1] = y; rainPos[i * 6 + 4] = y - 0.7;
      }
      rainGeo.attributes.position.needsUpdate = true;
      rain.position.set(camera.position.x, camera.position.y - 8, camera.position.z);
    }
  }

  return { update, weather };
}
