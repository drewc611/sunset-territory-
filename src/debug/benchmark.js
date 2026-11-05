import { POIS } from '../world.js';

// Fixed benchmark route for the iPhone test protocol (docs/SCHEDULE.md).
// Open with ?bench (or ?bench=30 for a shorter run). Starts at Drover's Camp and gallops a loop through The Flats,
// Brass Hollow and Widow's Rest for 90 seconds, then shows min, median and p95
// frame times plus peak draw calls and triangles, ready to paste into a PR.
const byName = (n) => POIS.find((p) => p.name === n);
const ROUTE = ["Drover's Camp", 'The Flats', 'Brass Hollow', "Widow's Rest", 'The Flats'].map(byName);

export function createBenchmark() {
  const params = new URLSearchParams(location.search);
  const active = params.has('bench');
  const DURATION = Number(params.get('bench')) || 90; // ?bench=30 for a shorter run
  let t = 0, wp = 1, done = false;
  const frames = [];
  let maxCalls = 0, maxTris = 0;

  const start = { x: ROUTE[0].x, z: ROUTE[0].z + 6, heading: 0 };

  // Returns forced input while running, or null.
  function drive(dt, rider) {
    if (!active || done) return null;
    const target = ROUTE[wp % ROUTE.length];
    if (Math.hypot(target.x - rider.x, target.z - rider.z) < 8) wp++;
    const want = Math.atan2(target.x - rider.x, target.z - rider.z);
    let diff = want - rider.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    return { fwd: 1, turn: Math.max(-1, Math.min(1, diff * 2.5)), gallop: true, camYawDelta: 0, dragging: false };
  }

  function record(dt, frameMs, perf) {
    if (!active || done) return;
    t += frameMs / 1000; // wall clock, not capped game time, so the run is 90 real seconds
    if (t < 2) return; // skip shader compile and first texture uploads
    frames.push(frameMs);
    maxCalls = Math.max(maxCalls, perf.stats.calls);
    maxTris = Math.max(maxTris, perf.stats.tris);
    if (t >= DURATION + 2) finish(perf);
  }

  function finish(perf) {
    done = true;
    const f = frames.slice().sort((a, b) => a - b);
    const q = (p) => f[Math.min(f.length - 1, Math.floor(f.length * p))];
    const text =
      `Benchmark ${DURATION}s, ${navigator.userAgent}\n` +
      `frame ms  min ${f[0].toFixed(1)}  median ${q(0.5).toFixed(1)}  p95 ${q(0.95).toFixed(1)}  max ${f[f.length - 1].toFixed(1)}\n` +
      `frames over 16.7 ms: ${(100 * f.filter((x) => x > 16.7).length / f.length).toFixed(1)}%\n` +
      `peak draw calls ${maxCalls}, peak triangles ${(maxTris / 1000).toFixed(0)}k, textures ${perf.textureMB().toFixed(0)} MB`;
    const box = document.createElement('div');
    box.id = 'bench';
    box.innerHTML = '<b>Benchmark done</b><pre></pre><button type="button">Copy numbers</button>';
    box.querySelector('pre').textContent = text;
    box.querySelector('button').onclick = () => navigator.clipboard && navigator.clipboard.writeText(text);
    document.body.appendChild(box);
    console.log(text);
    window.__bench = text;
  }

  return { active, start, drive, record };
}
