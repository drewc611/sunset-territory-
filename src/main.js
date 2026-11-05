import * as THREE from 'three';
import './style.css';
import { groundY, height } from './world.js';
import { createSky } from './sky.js';
import { createTerrain } from './terrain.js';
import { createProps } from './props.js';
import { createHorse } from './horse.js';
import { createInput } from './input.js';
import { createCamera } from './camera.js';
import { createHud } from './hud.js';
import { createPerfHud } from './debug/perf.js';
import { createBenchmark } from './debug/benchmark.js';
import { createCollision } from './collision.js';
import { createNpcs } from './npcs.js';
import { createJobs } from './jobs.js';
import { createUi } from './ui.js';
import { createAudio } from './audio.js';
import { createQuality } from './quality.js';
import { createAmbient } from './ambient.js';
import { createPost } from './post.js';
import { createWilds } from './wilds.js';
import { createWorldMap } from './worldmap.js';
import { createSettlements } from './settlements.js';
import { loadGame, saveGame, clearGame, loadSettings, saveSettings } from './save.js';
import { house, hitchRail } from './models.js';
import { POIS, HOME } from './world.js';

const BASE = import.meta.env.BASE_URL;
const params = new URLSearchParams(location.search);
const DAY_SECONDS = 600; // a ten minute day: long enough for a job to fit in daylight
const touch = matchMedia('(hover: none)').matches;

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.info.autoReset = false; // reset once per frame so the perf HUD counts every pass

const scene = new THREE.Scene();
const cam = createCamera();
const { camera, snap: snapCamera } = cam;
const sky = createSky(scene, renderer, { shadowSize: 1024 });
const terrain = createTerrain(scene, renderer, BASE);
const props = createProps(scene, BASE, terrain.sampleHeight);
const horse = createHorse(scene, BASE);
const input = createInput(canvas);
const hud = createHud(terrain);
const npcs = createNpcs(scene, props.towns);
const jobs = createJobs(scene, npcs, props.material);
const audio = createAudio();
const ambient = createAmbient(scene, { forcedWeather: params.get('weather') }); // ?weather=rain for testing
const settings = { sound: true, quality: 'auto', invertCam: false, bigControls: false, ...loadSettings() };
document.body.classList.toggle('big', !!settings.bigControls);
const post = createPost(renderer, scene, camera, sky);
const quality = createQuality({ renderer, scene, sun: sky.sun, props, touch, post, terrain, sky, onResize: () => resize() });
quality.set(params.get('q') || settings.quality); // ?q=low|medium|high overrides, for testing
audio.setMuted(!settings.sound);
input.setInvert(settings.invertCam);
const perf = createPerfHud(renderer, scene);
const bench = createBenchmark();


// Horse and player state. While mounted the player rides along; on foot they're separate.
const rider = { x: -20, z: 10, y: 0, heading: Math.PI, speed: 0 }; // the horse
if (bench.active) Object.assign(rider, bench.start);
if (params.has('at')) { // ?at=x,z,heading starts the rider somewhere specific, for screenshots
  const [x, z, h] = params.get('at').split(',').map(Number);
  Object.assign(rider, { x, z, heading: h || 0 });
}
rider.y = groundY(rider.x, rider.z);
const foot = { x: 0, z: 0, y: 0, heading: 0, speed: 0 };
const player = { mounted: true, called: false };
let clockH = params.has('t') ? Number(params.get('t')) % 24 : 6.5; // ?t=17.5 starts at 5:30 pm
let running = false;

const collision = createCollision({ trees: props.trees.concat(npcs.circles), rocks: props.rocks, buildings: props.buildings });
const updateCamera = (dt, f, c, onFoot) => cam.update(dt, f, c, onFoot, collision);
const settlements = createSettlements(scene, props.material, { collision });
const wilds = createWilds(scene, props.material, { sampleHeight: terrain.sampleHeight, collision });
quality.onTier((t) => wilds.setTier(t));
const HORSE_R = 0.85, FOOT_R = 0.32;

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  post.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// Move a circle mover by its speed and heading, then push it out of the world.
function move(m, dt, r, maxDepth) {
  const nx = m.x + Math.sin(m.heading) * m.speed * dt, nz = m.z + Math.cos(m.heading) * m.speed * dt;
  if (collision.tooDeep(nx, nz, maxDepth)) { m.speed *= 0.5; return true; }
  const res = collision.resolve(nx, nz, r);
  const moved = Math.hypot(res.x - m.x, res.z - m.z), wanted = Math.abs(m.speed * dt);
  m.x = res.x; m.z = res.z;
  // Hitting something head on bleeds speed so the horse doesn't grind along a wall at a gallop.
  if (res.hit && wanted > 1e-4) m.speed *= 0.6 + 0.4 * Math.min(1, moved / wanted);
  return res.hit;
}

function stepHorse(dt, ctl, ridden) {
  let fwd = ctl.fwd, turn = ctl.turn, gallop = ctl.gallop;
  if (!ridden) {
    // Riderless: stand, or come to the player when called.
    fwd = 0; turn = 0; gallop = false;
    if (player.called) {
      const dx = foot.x - rider.x, dz = foot.z - rider.z, d = Math.hypot(dx, dz);
      if (d < 2.6) player.called = false;
      else {
        let diff = Math.atan2(dx, dz) - rider.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        turn = Math.max(-1, Math.min(1, diff * 2));
        fwd = d > 12 ? 1 : 0.6;
      }
    }
  }
  const target = fwd > 0 ? (gallop ? 25 : fwd * 10) : fwd < 0 ? -4 : 0;
  rider.speed += (target - rider.speed) * Math.min(1, dt * (fwd ? 1.6 : 3));
  rider.heading += turn * dt * (1.7 - Math.min(1, Math.abs(rider.speed) / 25) * 0.7);
  move(rider, dt, HORSE_R, 1.4);
  const gy = groundY(rider.x, rider.z);
  rider.y += (gy - rider.y) * Math.min(1, dt * 10);

  const root = horse.root;
  root.position.set(rider.x, rider.y, rider.z);
  root.rotation.y = rider.heading;
  const ahead = height(rider.x + Math.sin(rider.heading) * 1.5, rider.z + Math.cos(rider.heading) * 1.5);
  root.rotation.x += (Math.atan2(gy - ahead, 1.5) - root.rotation.x) * Math.min(1, dt * 5);
  horse.update(dt, rider.speed, turn, ridden);
}

function stepFoot(dt, ctl) {
  const target = ctl.fwd > 0 ? (ctl.gallop ? 4.8 : ctl.fwd * 1.8) : ctl.fwd < 0 ? -1.0 : 0;
  foot.speed += (target - foot.speed) * Math.min(1, dt * 8);
  foot.heading += ctl.turn * dt * 2.6;
  move(foot, dt, FOOT_R, 0.6);
  foot.y = height(foot.x, foot.z);
  const rig = horse.rig.root;
  rig.position.set(foot.x, foot.y, foot.z);
  rig.rotation.set(0, foot.heading, 0);
  horse.rig.update(dt, 'walk', Math.abs(foot.speed));
}

function dismount() {
  if (!player.mounted || Math.abs(rider.speed) > 3) return;
  // Step off on the left side, facing the same way.
  const side = rider.heading + Math.PI / 2;
  const res = collision.resolve(rider.x + Math.sin(side) * 1.3, rider.z + Math.cos(side) * 1.3, FOOT_R);
  Object.assign(foot, { x: res.x, z: res.z, y: height(res.x, res.z), heading: rider.heading, speed: 0 });
  scene.add(horse.rig.root);
  player.mounted = false;
  player.called = false;
}

function mount() {
  if (player.mounted) return;
  horse.seat.add(horse.rig.root);
  horse.rig.root.position.set(0, 0, 0);
  horse.rig.root.rotation.set(0, 0, 0);
  player.mounted = true;
  player.called = false;
  rider.speed = 0;
}

const nearHorse = () => Math.hypot(foot.x - rider.x, foot.z - rider.z) < 3.5;
const focusOf = () => (player.mounted ? rider : foot);

// Someone close enough to talk to. From the saddle you have to be slow and a bit closer.
function talkable() {
  const f = focusOf();
  if (player.mounted && Math.abs(rider.speed) > 3) return null;
  return npcs.nearest(f.x, f.z, player.mounted ? 4.2 : 3.2);
}

function act() {
  if (ui.busy) return;
  const who = talkable();
  if (who) { ui.showDialog(jobs.talk(who.id)); return; }
  if (player.mounted) dismount();
  else if (nearHorse()) mount();
  else whistle();
}
function whistle() {
  if (player.mounted) return;
  player.called = true;
  audio.whistle();
}
input.onAction(act);
input.onWhistle(whistle);
input.onJournal(() => openJournal());
document.getElementById('place').addEventListener('click', () => openJournal());
if (import.meta.env.DEV || params.has('debug')) window.__game = { player, rider, foot, act, nearHorse, jobs, npcs };

function actionLabel() {
  if (talkable()) return 'TALK';
  if (player.mounted) return Math.abs(rider.speed) > 3 ? null : 'DISMOUNT';
  return nearHorse() ? 'MOUNT' : 'WHISTLE';
}

// UI, journal and settings.
const ui = createUi({
  onSetting(k, v) {
    settings[k] = v;
    saveSettings(settings);
    if (k === 'sound') audio.setMuted(!v);
    if (k === 'quality') quality.set(v);
    if (k === 'invertCam') input.setInvert(v);
    if (k === 'bigControls') document.body.classList.toggle('big', v);
  },
  onNewGame() { clearGame(); location.reload(); },
});
const worldMap = createWorldMap({ terrain, discovered: hud.discovered, getPlayer: () => focusOf(), getTarget: () => jobs.target() });
input.onMap(() => worldMap.toggle());
if (params.has('reveal')) for (let z = -9750; z < 10000; z += 1500) for (let x = -9750; x < 10000; x += 1500) worldMap.reveal(x, z); // ?reveal, for testing
document.getElementById('map').addEventListener('click', () => worldMap.open());
function openJournal() { ui.toggleJournal({ jobs, discovered: hud.discovered, settings }); }

// The homestead appears once the deed is bought.
let homeBuilt = false;
function buildHomestead() {
  if (homeBuilt) return;
  homeBuilt = true;
  const m = house(777);
  const camp = POIS.find((p) => p.name === "Widow's Rest");
  const rot = Math.atan2(camp.x - HOME.x, camp.z - HOME.z);
  const mesh = new THREE.Mesh(m.geo, props.material);
  mesh.position.set(HOME.x, height(HOME.x, HOME.z), HOME.z);
  mesh.rotation.y = rot;
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  collision.addBox({ x: HOME.x + Math.sin(rot) * m.zc, z: HOME.z + Math.cos(rot) * m.zc, w: m.w, d: m.d, rot });
  // A rail out front to tie the horse to.
  const rx = HOME.x + Math.sin(rot) * 5, rz = HOME.z + Math.cos(rot) * 5;
  const rail = new THREE.Mesh(hitchRail(), props.material);
  rail.position.set(rx, height(rx, rz), rz);
  rail.rotation.y = rot + Math.PI / 2;
  rail.castShadow = true;
  scene.add(rail);
  collision.addBox({ x: rx, z: rz, w: 3.2, d: 0.5, rot: rot + Math.PI / 2 });
}

jobs.on((ev) => {
  if (ev.type === 'accepted') ui.toast('Job taken. It\'s marked on your map.');
  if (ev.type === 'paid') { audio.chime(); ui.toast(`Paid $${ev.job.pay}. You have $${jobs.state.money}.`); persist(); }
  if (ev.type === 'stage') { ui.toast(ev.text, 5); if (ev.bell) audio.bell(); }
  if (ev.type === 'failed') ui.toast(ev.text, 7);
  if (ev.type === 'deed') {
    buildHomestead();
    audio.chime();
    hud.stampText('A Place of Your Own', "The homestead by Widow's Rest is yours");
    persist();
  }
});

// Saving: every few seconds, when the page hides, and after every payment.
function persist() {
  if (bench.active) return;
  saveGame({
    horse: { x: rider.x, z: rider.z, heading: rider.heading },
    foot: { x: foot.x, z: foot.z, heading: foot.heading },
    mounted: player.mounted, clockH, dayIndex,
    discovered: Object.keys(hud.discovered),
    revealed: worldMap.revealedList(),
    jobs: { money: jobs.state.money, done: jobs.state.done, active: jobs.state.active, deed: jobs.state.deed },
    intro: introSeen,
  });
}
document.addEventListener('visibilitychange', () => { if (document.hidden && running) persist(); });
let saveTimer = 0, introSeen = false, dayIndex = 0;

const saved = !bench.active && !params.has('at') ? loadGame() : null;
if (saved) {
  Object.assign(rider, saved.horse || {});
  rider.y = groundY(rider.x, rider.z);
  if (typeof saved.clockH === 'number' && !params.has('t')) clockH = saved.clockH;
  dayIndex = saved.dayIndex | 0;
  (saved.discovered || []).forEach((n) => { hud.discovered[n] = true; });
  worldMap.loadRevealed(saved.revealed);
  jobs.load(saved.jobs);
  if (jobs.state.deed) buildHomestead();
  introSeen = !!saved.intro;
  if (saved.mounted === false && saved.foot) {
    Object.assign(foot, saved.foot, { speed: 0 });
    foot.y = height(foot.x, foot.z);
    scene.add(horse.rig.root);
    player.mounted = false;
  }
  const note = document.getElementById('saveNote');
  note.textContent = `Picking up where you left off, with $${jobs.state.money} saved.`;
  note.hidden = false;
}

// First ride: a few short hints, no text walls.
const HINTS = [
  [1.5, touch ? 'Push the stick to ride. Hold GALLOP to run.' : 'W to ride, A and D to turn. Hold Shift to gallop.'],
  [9, 'Towns lie east and west. Folks there have work that pays.'],
  [18, touch ? 'Ride up slow to someone and tap TALK.' : 'Ride up slow to someone and press F to talk.'],
];
let hintT = 0, hintI = 0;
function hints(dt) {
  if (introSeen || hintI >= HINTS.length) return;
  hintT += dt;
  if (hintT >= HINTS[hintI][0]) { ui.toast(HINTS[hintI][1], 6); hintI++; if (hintI >= HINTS.length) introSeen = true; }
}

const TOWNS = POIS.filter((p) => p.type === 'town');
function audioState(focus, sk) {
  const inTown = TOWNS.some((t) => Math.hypot(focus.x - t.x, focus.z - t.z) < t.r);
  const fd = props.nearFire(focus.x, focus.z);
  const dusk = Math.max(0, 1 - Math.abs(clockH - 18.3) / 1.6) + Math.max(0, 1 - Math.abs(clockH - 6.2) / 1.2) * 0.6;
  return { speed: player.mounted ? rider.speed : foot.speed, mounted: player.mounted, x: focus.x, z: focus.z, y: focus.y,
    inTown, nearFire: Math.max(0, 1 - fd / 22), night: sk.night, dusk: Math.min(1, dusk), wet: ambient.weather.wet };
}

const debugView = params.has('view') ? params.get('view').split(',').map(Number) : null;
const IDLE = { fwd: 0, turn: 0, gallop: false, camYawDelta: 0, dragging: false };
const focusVec = new THREE.Vector3();
let last = performance.now();
renderer.setAnimationLoop((now) => {
  const frameMs = now - last;
  last = now;
  if (!running) return;
  const t0 = performance.now();
  const dt = Math.min(0.05, frameMs / 1000);

  const forced = bench.drive(dt, rider);
  if (forced && !player.mounted) mount();
  let ctl = forced || input.read(dt);
  if ((ui.busy || worldMap.isOpen) && !forced) ctl = IDLE;
  stepHorse(dt, ctl, player.mounted);
  if (!player.mounted) stepFoot(dt, ctl);
  const focus = player.mounted ? rider : foot;
  updateCamera(dt, focus, ctl, !player.mounted);
  if (debugView) { // ?view=x,z,dist: slow orbit around a point, for checking models
    const [vx, vz, vd] = debugView, a = now * 0.0001, vy = height(vx, vz);
    const cxv = vx + Math.cos(a) * vd, czv = vz + Math.sin(a) * vd;
    camera.position.set(cxv, Math.max(vy + vd * 0.55, height(cxv, czv) + 6), czv);
    camera.lookAt(vx, vy + 3, vz);
  }
  clockH += dt * (24 / DAY_SECONDS);
  if (clockH >= 24) { clockH -= 24; dayIndex++; }
  const s = sky.update(clockH, focusVec.set(focus.x, focus.y, focus.z), camera, ambient.weather.overcast); // shadows follow the player
  s.overcast = ambient.weather.overcast;
  ambient.update(dt, { clockH, dayIndex, night: s.night, camera });
  terrain.update(focus.x, focus.z);
  worldMap.reveal(focus.x, focus.z);
  wilds.update(focus.x, focus.z);
  settlements.update(focus.x, focus.z);
  props.update(dt, s, focus);
  npcs.update(dt, focus);
  jobs.update(dt, focus, player.mounted, rider.speed, s.night);
  hud.update(focus, clockH, { onFoot: !player.mounted, action: ui.busy ? null : actionLabel(), target: jobs.target() });
  ui.update(dt, jobs);
  audio.update(dt, audioState(focus, s));
  hints(dt);
  renderer.info.reset();
  if (!worldMap.isOpen) post.render(); // the map covers the screen: don't draw the world under it

  const cpuMs = performance.now() - t0;
  perf.record(frameMs, cpuMs);
  bench.record(dt, frameMs, perf);
  quality.record(dt, frameMs);
  saveTimer += dt;
  if (saveTimer > 5) { saveTimer = 0; persist(); }
});

function start() {
  document.getElementById('intro').remove();
  audio.start(); // inside the tap, which phones require before sound can play
  horse.root.position.set(rider.x, rider.y, rider.z);
  horse.root.rotation.y = rider.heading;
  snapCamera(focusOf());
  running = true;
  last = performance.now();
}

const startBtn = document.getElementById('start');
Promise.all([horse.ready, terrain.settle(rider.x, rider.z)]).then(() => {
  wilds.settle(rider.x, rider.z);
  settlements.settle(rider.x, rider.z);
  // Compile shaders before the first frame so riding doesn't hitch on start.
  horse.root.position.set(rider.x, rider.y, rider.z);
  snapCamera(rider);
  sky.update(clockH, horse.root.position, camera);
  renderer.compile(scene, camera);
  startBtn.disabled = false;
  startBtn.textContent = saved ? 'Ride on' : 'Ride out';
  if (bench.active) start();
}).catch((err) => {
  startBtn.textContent = 'Could not load the horse';
  console.error(err);
});
startBtn.addEventListener('click', start);
