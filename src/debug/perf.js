// Perf HUD: fps, frame ms (median and p95 over the last 2 s), CPU ms, draw calls,
// triangles, estimated texture memory, JS heap. Toggle with the backtick key, by
// tapping the clock three times, or open with ?perf in the URL.
export function createPerfHud(renderer, scene) {
  const el = document.createElement('pre');
  el.id = 'perf';
  el.hidden = !new URLSearchParams(location.search).has('perf');
  document.body.appendChild(el);

  addEventListener('keydown', (e) => { if (e.key === '`') el.hidden = !el.hidden; });
  let taps = [];
  document.getElementById('clock').addEventListener('pointerdown', () => {
    const now = performance.now();
    taps = taps.filter((t) => now - t < 700).concat(now);
    if (taps.length >= 3) { el.hidden = !el.hidden; taps = []; }
  });

  const N = 120;
  const frames = new Float32Array(N), cpu = new Float32Array(N);
  let i = 0, filled = 0, lastDraw = 0, texMB = 0, lastTex = 0;
  const stats = { calls: 0, tris: 0 };

  function textureMB() {
    const seen = new Set();
    let bytes = 0;
    const add = (t) => {
      if (!t || seen.has(t) || !t.image) return;
      seen.add(t);
      const w = t.image.width || 0, h = t.image.height || 0;
      bytes += w * h * 4 * (t.generateMipmaps ? 1.333 : 1);
    };
    scene.traverse((o) => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        for (const k in m) if (m[k] && m[k].isTexture) add(m[k]);
        if (m.userData.textures) m.userData.textures.forEach(add);
      }
      if (o.isLight && o.shadow && o.shadow.map) bytes += o.shadow.mapSize.x * o.shadow.mapSize.y * 4;
    });
    return bytes / 1048576;
  }

  // Call once per frame after render. frameMs = time since the previous frame, cpuMs = work this frame.
  function record(frameMs, cpuMs) {
    frames[i] = frameMs; cpu[i] = cpuMs;
    i = (i + 1) % N; filled = Math.min(N, filled + 1);
    stats.calls = renderer.info.render.calls;
    stats.tris = renderer.info.render.triangles;
    const now = performance.now();
    if (now - lastTex > 2000) { texMB = textureMB(); lastTex = now; }
    if (el.hidden || now - lastDraw < 250) return;
    lastDraw = now;
    const f = Array.from(frames.slice(0, filled)).sort((a, b) => a - b);
    const c = Array.from(cpu.slice(0, filled)).sort((a, b) => a - b);
    const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] || 0;
    const med = q(f, 0.5);
    const heap = performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(0) + ' MB' : 'n/a';
    el.textContent =
      `fps    ${(1000 / (med || 16.7)).toFixed(0)}\n` +
      `frame  ${med.toFixed(1)} ms  p95 ${q(f, 0.95).toFixed(1)}\n` +
      `cpu    ${q(c, 0.5).toFixed(1)} ms  p95 ${q(c, 0.95).toFixed(1)}\n` +
      `calls  ${stats.calls}\n` +
      `tris   ${(stats.tris / 1000).toFixed(0)}k\n` +
      `tex    ${texMB.toFixed(0)} MB\n` +
      `heap   ${heap}\n` +
      `dpr    ${renderer.getPixelRatio().toFixed(2)}`;
  }

  return { record, stats, textureMB: () => texMB };
}
