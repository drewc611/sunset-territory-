import { BIG, POIS } from './world.js';
import { sites } from './sites.js';

// The full map of the territory. Open with M or by tapping the minimap. Drag to pan,
// scroll or pinch to zoom, or use the + and − buttons. Land you haven't ridden near
// stays blank parchment; it fills in as you explore, in 500 m squares.
//
// Map tiles are drawn by the terrain worker (terrain.map) and cached per zoom level.

const REVEAL = 500;                 // discovery square size, meters
const LEVELS = [2500, 1250, 625];   // tile size per zoom level, meters
const TILE_PX = 128;
const MIN_SPAN = 1200, MAX_SPAN = BIG;

export function createWorldMap({ terrain, discovered, getPlayer, getTarget }) {
  const root = document.getElementById('worldmap');
  const canvas = document.getElementById('wmCanvas');
  const ctx = canvas.getContext('2d');
  const revealed = new Set();
  const tiles = new Map();          // "level:i:j" -> canvas | 'loading'
  let span = 6000, cx = 0, cz = 0, dpr = 1;

  // --- discovery -------------------------------------------------------------
  const rkey = (i, j) => `${i},${j}`;
  function reveal(x, z, r = 1) {
    const i = Math.floor(x / REVEAL), j = Math.floor(z / REVEAL);
    let added = false;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const k = rkey(i + di, j + dj);
      if (!revealed.has(k)) { revealed.add(k); added = true; }
    }
    return added;
  }
  const isRevealed = (x, z) => revealed.has(rkey(Math.floor(x / REVEAL), Math.floor(z / REVEAL)));

  // --- view ------------------------------------------------------------------
  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
  }
  const W = () => canvas.width, H = () => canvas.height;
  const mpp = () => span / Math.min(W(), H());           // meters per canvas pixel
  const toScreen = (x, z) => [W() / 2 + (x - cx) / mpp(), H() / 2 + (z - cz) / mpp()];
  const clampView = () => {
    span = Math.min(MAX_SPAN, Math.max(MIN_SPAN, span));
    const lim = BIG / 2;
    cx = Math.max(-lim, Math.min(lim, cx)); cz = Math.max(-lim, Math.min(lim, cz));
  };

  function tile(level, i, j) {
    const k = `${level}:${i}:${j}`;
    const t = tiles.get(k);
    if (t) return t === 'loading' ? null : t;
    tiles.set(k, 'loading');
    const size = LEVELS[level];
    terrain.map((i + 0.5) * size, (j + 0.5) * size, size, TILE_PX).then((m) => {
      const c = document.createElement('canvas');
      c.width = c.height = TILE_PX;
      c.getContext('2d').putImageData(new ImageData(m.px, m.size, m.size), 0, 0);
      tiles.set(k, c);
      if (!root.hidden) draw();
    });
    return null;
  }

  function draw() {
    const w = W(), h = H(), m = mpp();
    ctx.fillStyle = '#d8c7a1';
    ctx.fillRect(0, 0, w, h);
    // Pick the level whose tiles land nearest TILE_PX on screen.
    let level = 0;
    for (let l = 0; l < LEVELS.length; l++) if (LEVELS[l] / m >= TILE_PX * 0.7) level = l;
    const size = LEVELS[level];
    const x0 = cx - (w / 2) * m, z0 = cz - (h / 2) * m, x1 = cx + (w / 2) * m, z1 = cz + (h / 2) * m;
    const lim = BIG / 2;
    for (let j = Math.floor(Math.max(-lim, z0) / size); j * size < Math.min(lim, z1); j++) {
      for (let i = Math.floor(Math.max(-lim, x0) / size); i * size < Math.min(lim, x1); i++) {
        // Skip tiles with nothing revealed in them.
        let any = false;
        for (let rz = j * size; rz < (j + 1) * size && !any; rz += REVEAL) for (let rx = i * size; rx < (i + 1) * size && !any; rx += REVEAL) any = isRevealed(rx + 1, rz + 1);
        if (!any) continue;
        const t = tile(level, i, j) || fallback(level, i, j);
        if (!t) continue;
        const [sx, sz] = toScreen(i * size, j * size);
        ctx.drawImage(t.c || t, t.sx || 0, t.sy || 0, t.s || TILE_PX, t.s || TILE_PX, sx, sz, size / m + 0.5, size / m + 0.5);
      }
    }
    // Parchment over unexplored squares.
    ctx.fillStyle = '#d8c7a1';
    const rs = REVEAL / m;
    for (let rz = Math.floor(z0 / REVEAL); rz * REVEAL < z1; rz++) for (let rx = Math.floor(x0 / REVEAL); rx * REVEAL < x1; rx++) {
      if (revealed.has(rkey(rx, rz))) continue;
      const [sx, sz] = toScreen(rx * REVEAL, rz * REVEAL);
      ctx.fillRect(sx - 0.5, sz - 0.5, rs + 1, rs + 1);
    }
    // Territory edge.
    ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 2 * dpr;
    const [ex, ez] = toScreen(-lim, -lim);
    ctx.strokeRect(ex, ez, BIG / m, BIG / m);

    // Places you've found.
    ctx.font = `${13 * dpr}px Vollkorn, Georgia, serif`;
    ctx.textAlign = 'center';
    for (const p of POIS.concat(sites())) {
      if (!discovered[p.name]) continue;
      const [sx, sz] = toScreen(p.x, p.z);
      ctx.fillStyle = p.type === 'camp' ? '#ff8c3a' : p.type === 'town' ? '#c9a24d' : p.type === 'ranch' ? '#8a3a2a' : '#f0e4c4';
      ctx.strokeStyle = '#1b140d'; ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath(); ctx.arc(sx, sz, 4 * dpr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (span < 4000 || p.type === 'town') {
        ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(216,199,161,.85)'; ctx.strokeText(p.name, sx, sz - 8 * dpr);
        ctx.fillStyle = '#1b140d'; ctx.fillText(p.name, sx, sz - 8 * dpr);
      }
    }
    // Job target.
    const t = getTarget();
    if (t) {
      const [tx, tz] = toScreen(t.x, t.z);
      ctx.strokeStyle = '#8a2b2b'; ctx.lineWidth = 2.5 * dpr;
      ctx.beginPath(); ctx.arc(tx, tz, 9 * dpr, 0, Math.PI * 2); ctx.stroke();
    }
    // You.
    const p = getPlayer();
    const [px, pz] = toScreen(p.x, p.z);
    ctx.save(); ctx.translate(px, pz); ctx.rotate(-p.heading);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1b140d'; ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath(); ctx.moveTo(0, 8 * dpr); ctx.lineTo(6 * dpr, -6 * dpr); ctx.lineTo(-6 * dpr, -6 * dpr); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // Scale bar.
    const bar = span > 8000 ? 2000 : span > 3000 ? 1000 : 500;
    ctx.fillStyle = '#1b140d';
    ctx.fillRect(16 * dpr, h - 22 * dpr, bar / m, 3 * dpr);
    ctx.textAlign = 'left';
    ctx.fillText(bar >= 1000 ? `${bar / 1000} km` : `${bar} m`, 16 * dpr, h - 28 * dpr);
  }

  // While a finer tile loads, show the matching piece of a coarser one.
  function fallback(level, i, j) {
    for (let l = level - 1; l >= 0; l--) {
      const k = 2 ** (level - l), pi = Math.floor(i / k), pj = Math.floor(j / k);
      const t = tiles.get(`${l}:${pi}:${pj}`);
      if (t && t !== 'loading') { const s = TILE_PX / k; return { c: t, sx: (i - pi * k) * s, sy: (j - pj * k) * s, s }; }
    }
    return null;
  }

  // --- input -----------------------------------------------------------------
  const pointers = new Map();
  let pinch = 0;
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]); });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    if (pointers.size === 1) {
      cx -= (e.clientX - prev[0]) * dpr * mpp(); cz -= (e.clientY - prev[1]) * dpr * mpp();
    } else if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const d0 = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]);
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      const p2 = [...pointers.values()];
      const d1 = Math.hypot(p2[0][0] - p2[1][0], p2[0][1] - p2[1][1]);
      if (d0 > 0 && d1 > 0) span *= d0 / d1;
      pinch++;
    }
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    clampView(); draw();
  });
  const up = (e) => pointers.delete(e.pointerId);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); span *= Math.exp(e.deltaY * 0.0015); clampView(); draw(); }, { passive: false });
  document.getElementById('wmIn').addEventListener('click', () => { span /= 1.6; clampView(); draw(); });
  document.getElementById('wmOut').addEventListener('click', () => { span *= 1.6; clampView(); draw(); });
  document.getElementById('wmHere').addEventListener('click', () => { const p = getPlayer(); cx = p.x; cz = p.z; draw(); });
  document.getElementById('wmClose').addEventListener('click', () => close());
  addEventListener('keydown', (e) => {
    if (root.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === '+' || e.key === '=') { span /= 1.6; clampView(); draw(); }
    if (e.key === '-') { span *= 1.6; clampView(); draw(); }
  });
  addEventListener('resize', () => { if (!root.hidden) { resize(); draw(); } });

  function open() {
    const p = getPlayer();
    cx = p.x; cz = p.z;
    root.hidden = false;
    resize(); clampView(); draw();
    document.getElementById('wmClose').focus({ preventScroll: true });
  }
  function close() { root.hidden = true; }
  function toggle() { if (root.hidden) open(); else close(); }

  return {
    toggle, open, close, reveal,
    get isOpen() { return !root.hidden; },
    revealedList: () => [...revealed],
    loadRevealed: (list) => { (list || []).forEach((k) => revealed.add(k)); },
  };
}
