import * as THREE from 'three';
import { LAKE, LAKE_Y, masks, riverInfo, waterY, height } from './world.js';

// Fishing from the bank. Buy a rod from a merchant, stand on foot facing the lake
// or a river, and cast. The float sits on the water until a fish takes it: it ducks
// under with a splash, and you have a moment to pull. Fish go in a creel that holds
// six; merchants buy them. What you can catch depends on the water: perch and bass
// in the lake, trout in cold mountain rivers, catfish in warm lowland ones.

const CREEL = 6;
export const FISH = {
  perch: { name: 'yellow perch', lb: [0.3, 1.1], base: 1, perLb: 0.5 },
  bass: { name: 'largemouth bass', lb: [1, 5.5], base: 1, perLb: 0.8 },
  trout: { name: 'cutthroat trout', lb: [0.5, 3.5], base: 2, perLb: 0.8 },
  rainbow: { name: 'rainbow trout', lb: [0.5, 4], base: 2, perLb: 0.6 },
  catfish: { name: 'channel catfish', lb: [1, 9], base: 1, perLb: 0.4 },
};
const price = (f) => Math.max(1, Math.round(FISH[f.sp].base + f.lb * FISH[f.sp].perLb));

// Water a few meters in front of (x, z) along heading h: { x, z, y, kind } or null.
export function waterAhead(x, z, h) {
  for (const d of [3, 4.5, 6, 7.5]) {
    const wx = x + Math.sin(h) * d, wz = z + Math.cos(h) * d;
    if (Math.hypot(wx - LAKE.x, wz - LAKE.z) < LAKE.r - 1 && height(wx, wz) < LAKE_Y - 0.3) return { x: wx, z: wz, y: LAKE_Y, kind: 'lake' };
    const r = riverInfo(wx, wz);
    if (r.depth > 0.5) return { x: wx, z: wz, y: waterY(wx, wz, height(wx, wz), r), kind: 'river' };
  }
  return null;
}

function pickFish(spot) {
  const r = Math.random();
  let sp;
  if (spot.kind === 'lake') sp = r < 0.6 ? 'perch' : 'bass';
  else {
    const m = masks(spot.x, spot.z);
    if (m.mountain > 0.4 || m.moisture > 1.1) sp = r < 0.7 ? 'trout' : 'rainbow';
    else if (m.moisture < 0.9) sp = r < 0.7 ? 'catfish' : 'rainbow';
    else sp = r < 0.55 ? 'rainbow' : r < 0.8 ? 'catfish' : 'trout';
  }
  const [a, b] = FISH[sp].lb;
  const lb = Math.round((a + (b - a) * Math.pow(Math.random(), 1.8)) * 10) / 10; // big ones are rare
  return { sp, lb };
}

export function createFishing({ scene, audio, ui, shop }) {
  const creel = [];
  const best = {};               // species -> heaviest lb
  let state = 'idle', timer = 0, spot = null, from = null, caught = 0;

  // Float and line, only in the scene while fishing.
  const float = new THREE.Group();
  const fmat = new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.6 });
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshStandardMaterial({ color: 0xb02a20, roughness: 0.6 }));
  top.position.y = 0.05;
  float.add(top, new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), fmat));
  const lineGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x2a241c, transparent: true, opacity: 0.8 }));
  line.frustumCulled = false;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, 2.2, 5).translate(0, 1.1, 0), new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.8 }));
  const tip = new THREE.Vector3();

  const canFish = (foot, mounted) => !mounted && shop.has('rod') && waterAhead(foot.x, foot.z, foot.heading);

  function show(on) {
    for (const o of [float, line, rod]) { if (on) scene.add(o); else scene.remove(o); }
  }
  function stop(text) { state = 'idle'; show(false); if (text) ui.toast(text, 3); }

  function cast(foot) {
    spot = waterAhead(foot.x, foot.z, foot.heading);
    if (!spot) return;
    from = { x: foot.x, z: foot.z };
    state = 'waiting'; timer = 5 + Math.random() * 12;
    show(true);
    audio.splash(0.25);
  }

  function pull() {
    if (state === 'bite') {
      if (creel.length >= CREEL) { stop(`Your creel is full. A merchant will buy what's in it.`); return; }
      const f = pickFish(spot);
      creel.push(f); caught++;
      const rec = !best[f.sp] || f.lb > best[f.sp];
      if (rec) best[f.sp] = f.lb;
      audio.chime();
      stop(`A ${f.lb} lb ${FISH[f.sp].name}.${rec && caught > 1 ? ' Your biggest yet.' : ''} (${creel.length} of ${CREEL} in the creel)`);
    } else stop('You reel in.');
  }

  // The action button while fishing, or when you could start.
  function act(foot, mounted) {
    if (state !== 'idle') { pull(); return true; }
    if (canFish(foot, mounted)) { cast(foot); return true; }
    return false;
  }
  function label(foot, mounted) {
    if (state === 'bite') return 'PULL';
    if (state === 'waiting') return 'REEL IN';
    return canFish(foot, mounted) ? 'FISH' : null;
  }

  function update(dt, foot, mounted, t, grip = null) {
    if (state === 'idle') return;
    if (mounted || Math.hypot(foot.x - from.x, foot.z - from.z) > 1.5) { stop(); return; }
    timer -= dt;
    let dip = 0;
    if (state === 'waiting') {
      dip = Math.sin(t * 2.1) * 0.015 + (Math.sin(t * 7.3) > 0.97 ? -0.03 : 0); // nibbles
      if (timer <= 0) { state = 'bite'; timer = 1.3; audio.splash(0.6); }
    } else if (state === 'bite') {
      dip = -0.12;
      if (timer <= 0) { state = 'waiting'; timer = 6 + Math.random() * 10; ui.toast('It got away.', 2); }
    }
    float.position.set(spot.x, spot.y + dip, spot.z);
    // Rod held out over the water from the right hand (the rig's grip when there is one).
    const h = foot.heading;
    if (grip) rod.position.copy(grip);
    else rod.position.set(foot.x + Math.sin(h) * 0.35 - Math.cos(h) * 0.25, foot.y + 1.0, foot.z + Math.cos(h) * 0.35 + Math.sin(h) * 0.25);
    rod.rotation.set(0.95, h, 0, 'YXZ');
    tip.set(0, 2.2, 0).applyEuler(rod.rotation).add(rod.position);
    const p = lineGeo.attributes.position;
    p.setXYZ(0, tip.x, tip.y, tip.z); p.setXYZ(1, spot.x, spot.y + dip + 0.03, spot.z); p.needsUpdate = true;
  }

  // Merchants buy the creel.
  function extras(person, onSell) {
    if (person.role !== 'merchant' || !creel.length) return [];
    const total = creel.reduce((s, f) => s + price(f), 0);
    return [{ label: `Sell your catch ($${total})`, run: () => { const n = creel.length; creel.length = 0; onSell(total, n); } }];
  }

  return {
    act, label, update, extras,
    get active() { return state !== 'idle'; },
    get creel() { return creel; },
    best,
    save: () => ({ creel: creel.slice(), best: { ...best }, caught }),
    load(s) {
      if (!s) return;
      (s.creel || []).forEach((f) => FISH[f.sp] && creel.push(f));
      Object.assign(best, s.best || {});
      caught = s.caught | 0;
    },
    // For the debug hook: make the float go under now.
    _bite() { if (state === 'waiting') timer = 0; },
  };
}
