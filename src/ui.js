import { POIS } from './world.js';
import { JOBS, DEED_PRICE } from './jobs.js';
import { FISH } from './fishing.js';
import { landmarks } from './landmarks.js';

// Dialogue strip, money and job lines, notices, and the journal. Per docs/DESIGN.md:
// serif on dark leather at the screen edges; the journal is a full page, not a card.
export function createUi({ onSetting, onNewGame, onPhoto }) {
  const $ = (id) => document.getElementById(id);
  const dialog = $('dialog'), dName = $('dName'), dText = $('dText'), dChoices = $('dChoices');
  const money = $('money'), jobEl = $('job'), notice = $('notice');
  const journal = $('journal'), jBody = $('jBody');
  let open = null, noticeTimer = 0, lastMoney = -1, lastJob = null;

  // Dialogue.
  function showDialog(d) {
    open = d;
    if (d.onOpen) d.onOpen();
    dName.textContent = d.name;
    dText.textContent = d.text;
    dChoices.replaceChildren();
    d.choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = c.label;
      if (c.disabled) { b.disabled = true; b.title = 'Not enough money'; }
      b.addEventListener('click', () => { closeDialog(); c.run(); });
      dChoices.appendChild(b);
      if (i === 0) setTimeout(() => b.focus({ preventScroll: true }), 0);
    });
    dialog.hidden = false;
  }
  function closeDialog() { dialog.hidden = true; open = null; }
  addEventListener('keydown', (e) => {
    if (!open) return;
    const n = Number(e.key);
    if (n >= 1 && n <= open.choices.length) { const c = open.choices[n - 1]; if (c.disabled) return; closeDialog(); c.run(); }
    if (e.key === 'Escape') closeDialog();
  });

  function toast(text, seconds = 4) {
    notice.textContent = text;
    notice.hidden = false;
    noticeTimer = seconds;
  }

  // Journal: places, work done, the deed, and settings.
  function renderJournal(ctx) {
    const { jobs, discovered, settings, fishing } = ctx;
    const st = jobs.state;
    const placeRows = POIS.map((p) => discovered[p.name]
      ? `<li><b>${p.name}</b> <i>${p.sub}</i></li>`
      : '<li class="unknown">Unmarked country</li>').join('');
    const active = st.active ? JOBS.find((j) => j.id === st.active.id) : null;
    const t = jobs.target();
    const doneRows = st.done.map((id) => {
      const j = JOBS.find((x) => x.id === id);
      return `<li>${labelFor(j)} <span>$${j.pay}</span></li>`;
    }).join('') || '<li class="unknown">Nothing yet. Folks in town have work.</li>';
    const deed = st.deed
      ? '<p class="deed">The homestead by Widow\'s Rest is yours.</p>'
      : `<p>Savings <b>$${st.money}</b> of the <b>$${DEED_PRICE}</b> Ida Pell wants for the homestead deed.</p>`;
    jBody.innerHTML = `
      <section><h2>Work</h2>${deed}
        <p>${active ? `Current job: <b>${t ? t.label : labelFor(active)}</b>` : 'No job right now.'}</p>
        <ul>${doneRows}</ul></section>
      ${fishRows(fishing)}
      <section><h2>Places</h2><ul>${placeRows}</ul>${farRows(discovered)}</section>
      <section><h2>Settings</h2>
        <label><input type="checkbox" id="setSound" ${settings.sound !== false ? 'checked' : ''}> Sound</label>
        <label>Quality <select id="setQuality">
          ${['auto', 'low', 'medium', 'high', 'ultra'].map((q) => `<option value="${q}" ${settings.quality === q ? 'selected' : ''}>${q[0].toUpperCase() + q.slice(1)}</option>`).join('')}
        </select></label>
        <label><input type="checkbox" id="setInvert" ${settings.invertCam ? 'checked' : ''}> Invert camera drag</label>
        <label><input type="checkbox" id="setBig" ${settings.bigControls ? 'checked' : ''}> Larger touch controls</label>
        <button type="button" id="photoMode">Photo mode (P)</button>
        <button type="button" id="newGame">Start over</button>
      </section>
      <section><h2>About</h2>
        <p>Sunset Territory, made by Andrew Clark, 2026. All rights reserved.</p>
        <p>Every model, texture and sound was made for this game, or comes from the MIT licensed three.js examples. Built with three.js (MIT License). Type set in Rye and Vollkorn (SIL Open Font License 1.1).</p>
        <p><a href="THIRD-PARTY-NOTICES.txt" target="_blank" rel="noopener">Third-party notices</a> &middot; <a href="assets/LICENSES.md" target="_blank" rel="noopener">Asset licenses</a></p>
      </section>`;
    $('setSound').onchange = (e) => onSetting('sound', e.target.checked);
    $('setQuality').onchange = (e) => onSetting('quality', e.target.value);
    $('setInvert').onchange = (e) => onSetting('invertCam', e.target.checked);
    $('setBig').onchange = (e) => onSetting('bigControls', e.target.checked);
    $('photoMode').onclick = () => { journal.hidden = true; if (onPhoto) onPhoto(); };
    $('newGame').onclick = () => { if (confirm('Start over? Your money, jobs and map will be cleared.')) onNewGame(); };
  }
  // Landmarks found out in the territory.
  function farRows(discovered) {
    const all = landmarks(), found = all.filter((l) => discovered[l.name]);
    const rows = found.map((l) => `<li><b>${l.name}</b> <i>${l.sub}</i></li>`).join('');
    return `<p>Out in the territory: ${found.length} of ${all.length} landmarks found.</p>${rows ? `<ul>${rows}</ul>` : ''}`;
  }
  function fishRows(fishing) {
    if (!fishing || !Object.keys(fishing.best).length) return '';
    const rows = Object.entries(fishing.best).map(([sp, lb]) => `<li>${FISH[sp].name[0].toUpperCase() + FISH[sp].name.slice(1)} <span>${lb} lb</span></li>`).join('');
    const n = fishing.creel.length;
    return `<section><h2>Fishing</h2><p>${n ? `${n} fish in the creel. A merchant will buy them.` : 'The creel is empty.'}</p><p>Biggest of each kind:</p><ul>${rows}</ul></section>`;
  }
  const labelFor = (j) => ({ nails: 'Nails to Caldwell Crossing', letter: 'Letter to Jory Banks', strays: 'Rounded up strays',
    ridge: 'Scouted Kettle Ridge', water: 'Lake water for Doc Wilder', pelts: "Widow Sarrow's pelts",
    powder: 'Blasting powder, unjostled', mail: 'Mail for the Sheriff',
    lamp: "Cole's lamp from the mine", arch: 'Sketched the Sandstone Arch', watch: 'Night watch at the Lookout Tower', bell: 'Rang the mission bell' }[j.id]);

  function toggleJournal(ctx) {
    if (journal.hidden) { renderJournal(ctx); journal.hidden = false; $('jClose').focus({ preventScroll: true }); }
    else journal.hidden = true;
  }
  $('jClose').addEventListener('click', () => { journal.hidden = true; });

  function update(dt, jobs) {
    const st = jobs.state;
    if (st.money !== lastMoney) { lastMoney = st.money; money.textContent = `$${st.money}`; }
    const t = jobs.target();
    const label = t ? t.label : '';
    if (label !== lastJob) { lastJob = label; jobEl.textContent = label; jobEl.hidden = !label; }
    if (noticeTimer > 0) { noticeTimer -= dt; if (noticeTimer <= 0) notice.hidden = true; }
  }

  return {
    showDialog, closeDialog, toast, toggleJournal, update,
    get busy() { return !!open || !journal.hidden; },
  };
}
