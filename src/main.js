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
const { camera, update: updateCamera, snap: snapCamera } = createCamera();
const sky = createSky(scene, renderer, { shadowSize: touch ? 1024 : 2048 });
createTerrain(scene, renderer, BASE);
const props = createProps(scene, BASE);
const horse = createHorse(scene, BASE);
const input = createInput(canvas);
const hud = createHud();
const perf = createPerfHud(renderer, scene);
const bench = createBenchmark();

// Rider state, shared with camera, HUD and props.
const rider = { x: -20, z: 10, y: 0, heading: Math.PI, speed: 0 };
if (bench.active) Object.assign(rider, bench.start);
rider.y = groundY(rider.x, rider.z);
const params = new URLSearchParams(location.search);
let clockH = params.has('t') ? Number(params.get('t')) % 24 : 6.5; // ?t=17.5 starts at 5:30 pm
let running = false;

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

function step(dt, ctl) {
  const target = ctl.fwd > 0 ? (ctl.gallop ? 25 : ctl.fwd * 10) : ctl.fwd < 0 ? -4 : 0;
  rider.speed += (target - rider.speed) * Math.min(1, dt * (ctl.fwd ? 1.6 : 3));
  rider.heading += ctl.turn * dt * (1.7 - Math.min(1, Math.abs(rider.speed) / 25) * 0.7);

  const lim = WORLD / 2 - 10;
  rider.x = THREE.MathUtils.clamp(rider.x + Math.sin(rider.heading) * rider.speed * dt, -lim, lim);
  rider.z = THREE.MathUtils.clamp(rider.z + Math.cos(rider.heading) * rider.speed * dt, -lim, lim);
  const gy = groundY(rider.x, rider.z);
  rider.y += (gy - rider.y) * Math.min(1, dt * 10);

  const root = horse.root;
  root.position.set(rider.x, rider.y, rider.z);
  root.rotation.y = rider.heading;
  const ahead = height(rider.x + Math.sin(rider.heading) * 1.5, rider.z + Math.cos(rider.heading) * 1.5);
  root.rotation.x += (Math.atan2(gy - ahead, 1.5) - root.rotation.x) * Math.min(1, dt * 5);
  horse.update(dt, rider.speed, ctl.turn);
}

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const frameMs = now - last;
  last = now;
  if (!running) return;
  const t0 = performance.now();
  const dt = Math.min(0.05, frameMs / 1000);

  const ctl = bench.drive(dt, rider) || input.read(dt);
  step(dt, ctl);
  updateCamera(dt, rider, ctl);
  clockH = (clockH + dt * (24 / DAY_SECONDS)) % 24;
  const s = sky.update(clockH, horse.root.position, camera);
  props.update(dt, s, rider);
  hud.update(rider, clockH);
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
