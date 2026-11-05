import { POIS } from './world.js';
import { sites, nearSite } from './sites.js';

// Place name, clock, pace, discovery stamp and minimap. Markup lives in index.html.
// heading 0 moves +z, which is down (south) on the minimap. The prototype's list was reversed
// against its own map; this order matches the map.
const compass = ['south', 'south east', 'east', 'north east', 'north', 'north west', 'west', 'south west'];

export function createHud(terrain) {
  const $ = (id) => document.getElementById(id);
  const placeName = $('placeName'), placeSub = $('placeSub'), timeEl = $('time'), paceEl = $('pace'), stamp = $('stamp');
  const map = $('map'), mctx = map.getContext('2d');
  const MS = map.width;

  // Minimap: a SPAN meter window centered on the player. The terrain worker draws a
  // larger image (IMG) around a center, and it's re-requested once you ride far enough
  // from that center; in between the image just scrolls.
  const SPAN = 900, IMG = 1800, IMG_PX = 200;
  const mapBase = document.createElement('canvas');
  mapBase.width = mapBase.height = IMG_PX;
  let mapCenter = null, mapLoading = false;
  function refreshMap(x, z) {
    if (mapLoading || !terrain) return;
    mapLoading = true;
    const cx = Math.round(x / 100) * 100, cz = Math.round(z / 100) * 100;
    terrain.map(cx, cz, IMG, IMG_PX).then((m) => {
      mapBase.getContext('2d').putImageData(new ImageData(m.px, m.size, m.size), 0, 0);
      mapCenter = { x: m.cx, z: m.cz };
      mapLoading = false;
    });
  }
  // World point to minimap pixel, with the player at the center.
  const toMap = (x, z, rider) => [MS / 2 + (x - rider.x) / SPAN * MS, MS / 2 + (z - rider.z) / SPAN * MS];

  const discovered = {};
  let lastPOI = null, lastText = '';

  const actEl = $('act'), spurEl = $('spur'), helpEl = $('help');
  let lastAct = '', lastFoot = null;

  // opts: { onFoot, action } where action is the label for the action button or null.
  function stampText(title, sub) {
    stamp.innerHTML = '';
    stamp.append(title);
    const sm = document.createElement('small'); sm.textContent = sub; stamp.append(sm);
    stamp.classList.remove('show'); void stamp.offsetWidth; stamp.classList.add('show');
  }

  function update(rider, clockH, opts = {}) {
    let here = null;
    for (const p of POIS) if (Math.hypot(rider.x - p.x, rider.z - p.z) < p.r) here = p;
    if (!here) here = nearSite(rider.x, rider.z, 6);
    if (here && here !== lastPOI) {
      lastPOI = here;
      if (!discovered[here.name]) {
        discovered[here.name] = true;
        stamp.innerHTML = `${here.name}<small>${here.sub}</small>`;
        stamp.classList.remove('show');
        void stamp.offsetWidth;
        stamp.classList.add('show');
      }
      placeName.textContent = here.name;
      placeSub.textContent = here.sub;
    }
    if (!here) {
      lastPOI = null;
      const a = ((rider.heading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const sub = 'Heading ' + compass[Math.round(a / (Math.PI / 4)) % 8];
      if (placeName.textContent !== 'Open range') placeName.textContent = 'Open range';
      if (placeSub.textContent !== sub) placeSub.textContent = sub;
    }
    const hh = Math.floor(clockH), mm = Math.floor((clockH - hh) * 60);
    const s = (((hh + 11) % 12) + 1) + ':' + String(mm).padStart(2, '0') + (hh < 12 ? ' am' : ' pm');
    const sp = Math.abs(rider.speed);
    const pace = opts.onFoot
      ? (sp < 0.2 ? 'On foot' : sp < 2.5 ? 'Walking' : 'Running')
      : (sp < 0.5 ? 'Standing' : rider.speed < 9 ? 'Walking' : rider.speed < 16 ? 'Trotting' : 'Galloping');
    const act = opts.action || '';
    if (act !== lastAct) {
      lastAct = act;
      actEl.textContent = act;
      actEl.hidden = !act;
    }
    if (opts.onFoot !== lastFoot) {
      lastFoot = opts.onFoot;
      spurEl.textContent = opts.onFoot ? 'RUN' : 'GALLOP';
      helpEl.textContent = opts.onFoot
        ? 'W A S D to walk, Shift to run, F to mount when close, H to whistle, M for the map'
        : 'W A S D to ride, Shift to gallop, F to get down when slow, M for the map, drag to look around';
    }
    if (s + pace !== lastText) { lastText = s + pace; timeEl.textContent = s; paceEl.textContent = pace; }

    if (!mapCenter || Math.hypot(rider.x - mapCenter.x, rider.z - mapCenter.z) > (IMG - SPAN) / 2 - 150) refreshMap(rider.x, rider.z);
    mctx.fillStyle = '#2b2316';
    mctx.fillRect(0, 0, MS, MS);
    if (mapCenter) {
      // Draw the part of the big image under the window.
      const k = IMG_PX / IMG;
      const sx = (rider.x - SPAN / 2 - (mapCenter.x - IMG / 2)) * k, sz = (rider.z - SPAN / 2 - (mapCenter.z - IMG / 2)) * k;
      mctx.drawImage(mapBase, sx, sz, SPAN * k, SPAN * k, 0, 0, MS, MS);
    }
    for (const p of POIS.concat(sites())) {
      if (!discovered[p.name]) continue;
      const [mx, mz] = toMap(p.x, p.z, rider);
      if (mx < -4 || mz < -4 || mx > MS + 4 || mz > MS + 4) continue;
      // Shape as well as color, so markers read without color vision.
      mctx.fillStyle = p.type === 'camp' ? '#ff8c3a' : p.type === 'town' ? '#c9a24d' : '#d8c7a1';
      mctx.strokeStyle = '#1b140d'; mctx.lineWidth = 1;
      mctx.beginPath();
      if (p.type === 'town') mctx.rect(mx - 3, mz - 3, 6, 6);
      else if (p.type === 'camp') { mctx.moveTo(mx, mz - 4); mctx.lineTo(mx + 3.5, mz + 3); mctx.lineTo(mx - 3.5, mz + 3); mctx.closePath(); }
      else { mctx.moveTo(mx, mz - 3.5); mctx.lineTo(mx + 3, mz); mctx.lineTo(mx, mz + 3.5); mctx.lineTo(mx - 3, mz); mctx.closePath(); }
      mctx.fill(); mctx.stroke();
    }
    if (opts.target) {
      // Job marker: a brass ring that pulses.
      // Off the window: pin the ring to the edge, toward the target.
      let [tx, tz] = toMap(opts.target.x, opts.target.z, rider);
      const ex = tx - MS / 2, ez = tz - MS / 2, lim = MS / 2 - 6, far = Math.max(Math.abs(ex), Math.abs(ez));
      if (far > lim) { tx = MS / 2 + ex / far * lim; tz = MS / 2 + ez / far * lim; }
      mctx.strokeStyle = '#c9a24d'; mctx.lineWidth = 2;
      mctx.beginPath(); mctx.arc(tx, tz, 4 + (Math.sin(performance.now() * 0.006) + 1) * 1.5, 0, Math.PI * 2); mctx.stroke();
    }
    const px = MS / 2, pz = MS / 2;
    mctx.save();
    mctx.translate(px, pz);
    mctx.rotate(-rider.heading);
    mctx.fillStyle = '#fff';
    mctx.beginPath(); mctx.moveTo(0, 5); mctx.lineTo(3.5, -4); mctx.lineTo(-3.5, -4); mctx.closePath(); mctx.fill();
    mctx.restore();
  }

  return { update, discovered, stampText };
}
