import * as THREE from 'three';
import './style.css';
import { WORLD, groundY, height } from './world.js';
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

const BASE = import.meta.env.BASE_URL;
const DAY_SECONDS = 240; // open decision in docs/HANDOVER.md: keep 240 s or slow to 10 min
const touch = matchMedia('(hover: none)').matches;

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
const cam = createCamera();
const { camera, snap: snapCamera } = cam;
const sky = createSky(scene, renderer, { shadowSize: touch ? 1024 : 2048 });
createTerrain(scene, renderer, BASE);
const props = createProps(scene, BASE);
const horse = createHorse(scene, BASE);
const input = createInput(canvas);
const hud = createHud();
const perf = createPerfHud(renderer, scene);
const bench = createBenchmark();

const params = new URLSearchParams(location.search);

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

const collision = createCollision(props);
const updateCamera = (dt, f, c, onFoot) => cam.update(dt, f, c, onFoot, collision);
const HORSE_R = 0.85, FOOT_R = 0.32;

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
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

function act() {
  if (player.mounted) dismount();
  else if (nearHorse()) mount();
  else player.called = true;
}
input.onAction(act);
if (import.meta.env.DEV || params.has('debug')) window.__game = { player, rider, foot, act, nearHorse };
input.onWhistle(() => { if (!player.mounted) player.called = true; });

function actionLabel() {
  if (player.mounted) return Math.abs(rider.speed) > 3 ? null : 'DISMOUNT';
  return nearHorse() ? 'MOUNT' : 'WHISTLE';
}

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
  const ctl = forced || input.read(dt);
  stepHorse(dt, ctl, player.mounted);
  if (!player.mounted) stepFoot(dt, ctl);
  const focus = player.mounted ? rider : foot;
  updateCamera(dt, focus, ctl, !player.mounted);
  clockH = (clockH + dt * (24 / DAY_SECONDS)) % 24;
  const s = sky.update(clockH, focusVec.set(focus.x, focus.y, focus.z), camera); // shadows follow the player
  props.update(dt, s, focus);
  hud.update(focus, clockH, { onFoot: !player.mounted, action: actionLabel() });
  renderer.render(scene, camera);

  const cpuMs = performance.now() - t0;
  perf.record(frameMs, cpuMs);
  bench.record(dt, frameMs, perf);
});

function start() {
  document.getElementById('intro').remove();
  horse.root.position.set(rider.x, rider.y, rider.z);
  horse.root.rotation.y = rider.heading;
  snapCamera(rider);
  running = true;
  last = performance.now();
}

const startBtn = document.getElementById('start');
horse.ready.then(() => {
  // Compile shaders before the first frame so riding doesn't hitch on start.
  horse.root.position.set(rider.x, rider.y, rider.z);
  snapCamera(rider);
  sky.update(clockH, horse.root.position, camera);
  renderer.compile(scene, camera);
  startBtn.disabled = false;
  startBtn.textContent = 'Ride out';
  if (bench.active) start();
}).catch((err) => {
  startBtn.textContent = 'Could not load the horse';
  console.error(err);
});
startBtn.addEventListener('click', start);
