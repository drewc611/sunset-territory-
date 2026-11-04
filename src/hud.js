import { WORLD, POIS, LAKE, height } from './world.js';

// Place name, clock, pace, discovery stamp and minimap. Markup lives in index.html.
// heading 0 moves +z, which is down (south) on the minimap. The prototype's list was reversed
// against its own map; this order matches the map.
const compass = ['south', 'south east', 'east', 'north east', 'north', 'north west', 'west', 'south west'];

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const placeName = $('placeName'), placeSub = $('placeSub'), timeEl = $('time'), paceEl = $('pace'), stamp = $('stamp');
  const map = $('map'), mctx = map.getContext('2d');
  const MS = map.width;

  const mapBase = document.createElement('canvas');
  mapBase.width = mapBase.height = MS;
  {
    const c = mapBase.getContext('2d'), img = c.createImageData(MS, MS);
    for (let j = 0; j < MS; j++) for (let i = 0; i < MS; i++) {
      const x = (i / MS - 0.5) * WORLD, z = (j / MS - 0.5) * WORLD, h = height(x, z);
      let r, g, b;
      if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r - 1) { r = 45; g = 85; b = 105; }
      else if (h < -6) { r = 160; g = 135; b = 90; }
      else if (h < 9) { r = 95; g = 110; b = 60; }
      else if (h < 24) { r = 110; g = 100; b = 85; }
      else { r = 170; g = 160; b = 150; }
      const k = (j * MS + i) * 4;
      img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  }

  const discovered = {};
  let lastPOI = null, lastText = '';

  const actEl = $('act'), spurEl = $('spur'), helpEl = $('help');
  let lastAct = '', lastFoot = null;

  // opts: { onFoot, action } where action is the label for the action button or null.
  function update(rider, clockH, opts = {}) {
    let here = null;
    for (const p of POIS) if (Math.hypot(rider.x - p.x, rider.z - p.z) < p.r) here = p;
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
        ? 'W A S D to walk, Shift to run, F to mount when close, H to whistle for your horse'
        : 'W A S D to ride, hold Shift to gallop, F to get down when slow, drag or Q and E to swing the camera';
    }
    if (s + pace !== lastText) { lastText = s + pace; timeEl.textContent = s; paceEl.textContent = pace; }

    mctx.drawImage(mapBase, 0, 0);
    for (const p of POIS) {
      if (!discovered[p.name]) continue;
      const mx = (p.x / WORLD + 0.5) * MS, mz = (p.z / WORLD + 0.5) * MS;
      mctx.fillStyle = p.type === 'camp' ? '#ff8c3a' : p.type === 'town' ? '#c9a24d' : '#d8c7a1';
      mctx.fillRect(mx - 2, mz - 2, 4, 4);
    }
    const px = (rider.x / WORLD + 0.5) * MS, pz = (rider.z / WORLD + 0.5) * MS;
    mctx.save();
    mctx.translate(px, pz);
    mctx.rotate(-rider.heading);
    mctx.fillStyle = '#fff';
    mctx.beginPath(); mctx.moveTo(0, 5); mctx.lineTo(3.5, -4); mctx.lineTo(-3.5, -4); mctx.closePath(); mctx.fill();
    mctx.restore();
  }

  return { update, discovered };
}
