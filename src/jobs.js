import * as THREE from 'three';
import { POIS, LAKE, height } from './world.js';
import { Builder } from './models.js';

// Odd jobs: the game's loop. Townsfolk offer work, the work sends you across the
// valley, and the pay adds up to a homestead deed. One job is active at a time.
//
// kinds:
//   deliver  carry something from the giver to another person
//   careful  deliver without galloping, or the load is lost
//   scout    reach a place, then report back to the giver
//   water    ride into Caldwell Lake, then report back
//   strays   ride close to three stray steers to drive them home, then report back

const place = (name) => POIS.find((p) => p.name === name);
export const DEED_PRICE = 60;

export const JOBS = [
  { id: 'nails', giver: 'ida', kind: 'deliver', to: 'hollis', pay: 8,
    offer: "Hollis Grant over at Caldwell Crossing is waiting on a keg of nails. Ride it west for me?",
    thanks: "Nails, finally. Ida's a saint. Here's your pay, and I could use a hand myself if you're riding on." },
  { id: 'letter', giver: 'hollis', kind: 'deliver', to: 'jory', pay: 6, after: ['nails'],
    offer: "Jory Banks runs the drover outfit south of the Flats. This letter's from his sister. Don't read it.",
    thanks: "From Ruth? Hah. Thank you kindly. While you're here, I've got steers gone wandering." },
  { id: 'strays', giver: 'jory', kind: 'strays', pay: 15, after: ['letter'], area: { x: 30, z: 10 },
    offer: "Three of my steers broke off toward the Flats. Ride up close behind each one and they'll head for home.",
    thanks: "All three. You've got a cattleman's seat. That's fifteen, and well earned." },
  { id: 'ridge', giver: 'reyes', kind: 'scout', place: 'Kettle Ridge', pay: 10,
    offer: "Somebody's been lighting fires up on Kettle Ridge. Ride up top, have a look, and come tell me what you saw.",
    report: "Up on the ridge, then? Cold camp and boot prints. Good to know. Here, for your trouble." },
  { id: 'water', giver: 'wilder', kind: 'water', pay: 5,
    offer: "My well's gone brackish. Fill this canteen in Caldwell Lake, out in the deep part, and bring it back.",
    report: "Clean and cold. That's the stuff. Five dollars, and my thanks." },
  { id: 'pelts', giver: 'sarrow', kind: 'deliver', to: 'ida', pay: 12,
    offer: "Winter's pelts, all bundled. Ida Pell in Brass Hollow pays fair. Take them east for an old woman?",
    thanks: "Sarrow's pelts! Best in the valley. Twelve for you, and she'll get hers." },
  { id: 'powder', giver: 'cole', kind: 'careful', to: 'jory', pay: 20, after: ['ridge'],
    offer: "Blasting powder for Jory's stock pond. It does not like to be jostled. Walk or trot, no galloping.",
    thanks: "Not a scratch on the crate. Twenty, as promised. You've got nerve.",
    fail: "You hear the crate shift and split at a gallop. The powder's spilled and useless. Go back to Cole." },
  { id: 'mail', giver: 'mae', kind: 'deliver', to: 'reyes', pay: 7,
    offer: "Mail sack for the Sheriff in Brass Hollow. Wanted notices, mostly. Mind the river crossing.",
    thanks: "Mae's mail. Obliged. Seven, and keep your eyes open out there." },
];

const LINES = {
  reyes: "Quiet day. I like them quiet.",
  ida: "General store. If I don't stock it, you didn't need it.",
  cole: "Mine's been dry since spring. Still go down every morning.",
  mae: "Post office, assay office, and whatever else needs a desk.",
  hollis: "River's low this year. Cattle don't mind.",
  wilder: "Doctor, dentist, and on Sundays, barber.",
  jory: "Herd's resting. So am I.",
  sarrow: "The cedars keep the wind off. That's all a body needs.",
};

function cowGeo() {
  const b = new Builder();
  b.add(new THREE.BoxGeometry(0.8, 0.75, 1.7), 0x6a4030, { y: 1.05 }, { shade: 0.35 });
  b.add(new THREE.BoxGeometry(0.45, 0.45, 0.55), 0x5a3426, { y: 1.25, z: 1.05 });
  b.add(new THREE.BoxGeometry(0.3, 0.2, 0.2), 0xd8c7a1, { y: 1.15, z: 1.35 });
  b.add(new THREE.CylinderGeometry(0.03, 0.05, 0.5, 4), 0xe0d4bc, { y: 1.5, z: 1.0, rz: Math.PI / 2 });
  for (const [x, z] of [[-0.28, 0.6], [0.28, 0.6], [-0.28, -0.6], [0.28, -0.6]]) {
    b.add(new THREE.BoxGeometry(0.16, 0.7, 0.16), 0x4a2c20, { x, y: 0.35, z });
  }
  b.add(new THREE.BoxGeometry(0.62, 0.3, 0.8), 0xd8cfbd, { y: 1.1, z: -0.2, sx: 1.32, sy: 0.6 });
  return b.build();
}

export function createJobs(scene, npcs, propMat) {
  const state = { money: 0, done: [], active: null, deed: false };
  const cowMesh = cowGeo();
  const cows = [];
  let listeners = [];
  const emit = (ev) => listeners.forEach((f) => f(ev));

  const job = (id) => JOBS.find((j) => j.id === id);
  const isDone = (id) => state.done.includes(id);

  function offerFor(personId) {
    return JOBS.find((j) => j.giver === personId && !isDone(j.id) && (!j.after || j.after.every(isDone)));
  }

  function spawnStrays(j) {
    clearCows();
    const spots = [[j.area.x - 18, j.area.z + 14], [j.area.x + 22, j.area.z - 6], [j.area.x + 4, j.area.z + 30]];
    for (const [x, z] of spots) {
      const m = new THREE.Mesh(cowMesh, propMat);
      m.castShadow = true;
      m.position.set(x, height(x, z), z);
      m.rotation.y = Math.random() * 6.28;
      scene.add(m);
      cows.push({ m, x, z, herded: false, t: 0, gone: false });
    }
  }
  function clearCows() { cows.forEach((c) => scene.remove(c.m)); cows.length = 0; }

  // Where the active job wants you to go next, for the minimap and HUD.
  function target() {
    const a = state.active;
    if (!a) return null;
    const j = job(a.id);
    const back = npcs.byId[j.giver];
    if (j.kind === 'deliver' || j.kind === 'careful') { const p = npcs.byId[j.to]; return { x: p.x, z: p.z, label: `${cargo(j)} for ${p.name}` }; }
    if (a.stage === 'report') return { x: back.x, z: back.z, label: `Report to ${back.name}` };
    if (j.kind === 'scout') { const p = place(j.place); return { x: p.x, z: p.z, label: `Scout ${j.place}` }; }
    if (j.kind === 'water') return { x: LAKE.x, z: LAKE.z, label: 'Fill the canteen in Caldwell Lake' };
    if (j.kind === 'strays') {
      const left = cows.filter((c) => !c.herded);
      const c = left[0];
      return c ? { x: c.x, z: c.z, label: `Drive the strays home (${3 - left.length} of 3)` } : null;
    }
    return null;
  }
  const cargo = (j) => ({ nails: 'Nails', letter: 'Letter', pelts: 'Pelts', powder: 'Powder', mail: 'Mail' }[j.id] || 'Parcel');

  function accept(j) {
    state.active = { id: j.id, stage: 'go' };
    if (j.kind === 'strays') spawnStrays(j);
    emit({ type: 'accepted', job: j });
  }

  function pay(j) {
    state.money += j.pay;
    state.done.push(j.id);
    state.active = null;
    clearCows();
    emit({ type: 'paid', job: j });
  }

  // Talking to someone. Returns a dialogue: { name, text, choices: [{label, run}] }.
  function talk(personId) {
    const p = npcs.byId[personId];
    const a = state.active, aj = a && job(a.id);
    // Finishing a delivery here.
    if (aj && (aj.kind === 'deliver' || aj.kind === 'careful') && aj.to === personId) {
      return { name: p.name, text: aj.thanks + `  (+$${aj.pay})`, choices: [{ label: 'Ride on', run: () => {} }], onOpen: () => pay(aj) };
    }
    // Reporting back.
    if (aj && aj.giver === personId && a.stage === 'report') {
      return { name: p.name, text: (aj.report || aj.thanks) + `  (+$${aj.pay})`, choices: [{ label: 'Ride on', run: () => {} }], onOpen: () => pay(aj) };
    }
    if (aj && aj.giver === personId) {
      return { name: p.name, text: "Still waiting on that job. " + (target()?.label || ''), choices: [{ label: 'On my way', run: () => {} }] };
    }
    // The deed.
    if (personId === 'ida' && !state.deed && state.money >= DEED_PRICE) {
      return {
        name: p.name,
        text: `That homestead deed for the cabin by Widow's Rest is still for sale. $${DEED_PRICE}, and it's yours.`,
        choices: [
          { label: `Buy the deed ($${DEED_PRICE})`, run: () => { state.money -= DEED_PRICE; state.deed = true; emit({ type: 'deed' }); } },
          { label: 'Not yet', run: () => {} },
        ],
      };
    }
    const offer = !a && offerFor(personId);
    if (offer) {
      return {
        name: p.name, text: offer.offer + `  ($${offer.pay})`,
        choices: [{ label: 'Take the job', run: () => accept(offer) }, { label: 'Not now', run: () => {} }],
      };
    }
    let line = LINES[personId];
    if (a) line += '  Finish your other job first.';
    else if (personId === 'ida' && !state.deed) line += `  I've a homestead deed for sale, $${DEED_PRICE}, when you've the money.`;
    return { name: p.name, text: line, choices: [{ label: 'Ride on', run: () => {} }] };
  }

  function update(dt, player, mounted, horseSpeed) {
    const a = state.active;
    if (!a) return;
    const j = job(a.id);
    if (j.kind === 'careful' && mounted && horseSpeed > 16) {
      emit({ type: 'failed', job: j, text: j.fail });
      state.active = null;
      return;
    }
    if (a.stage === 'go' && j.kind === 'scout') {
      const p = place(j.place);
      if (Math.hypot(player.x - p.x, player.z - p.z) < p.r * 0.5) { a.stage = 'report'; emit({ type: 'stage', text: 'You can see the whole valley from here. Time to report back.' }); }
    }
    if (a.stage === 'go' && j.kind === 'water') {
      if (Math.hypot(player.x - LAKE.x, player.z - LAKE.z) < LAKE.r * 0.45) { a.stage = 'report'; emit({ type: 'stage', text: 'Canteen filled. Back to Doc Wilder.' }); }
    }
    if (j.kind === 'strays') {
      const home = place("Drover's Camp");
      for (const c of cows) {
        if (c.gone) continue;
        if (!c.herded && Math.hypot(player.x - c.x, player.z - c.z) < 7) { c.herded = true; emit({ type: 'stage', text: 'The steer turns for home.' }); }
        if (c.herded) {
          // Trot home and drop out of sight once over the rise.
          const dx = home.x - c.x, dz = home.z - c.z, d = Math.hypot(dx, dz);
          c.x += (dx / d) * 4 * dt; c.z += (dz / d) * 4 * dt; c.t += dt;
          c.m.rotation.y = Math.atan2(dx, dz);
          if (c.t > 12 || d < 6) { c.gone = true; c.m.visible = false; }
        } else {
          c.m.rotation.y += Math.sin(performance.now() * 0.0003 + c.x) * dt * 0.3;
        }
        c.m.position.set(c.x, height(c.x, c.z), c.z);
      }
      if (a.stage === 'go' && cows.length && cows.every((c) => c.herded)) { a.stage = 'report'; emit({ type: 'stage', text: 'All three are headed home. Back to Jory.' }); }
    }
  }

  function load(saved) {
    if (!saved) return;
    state.money = saved.money | 0;
    state.done = Array.isArray(saved.done) ? saved.done.filter((id) => job(id)) : [];
    state.deed = !!saved.deed;
    const a = saved.active;
    if (a && job(a.id) && !isDone(a.id)) {
      state.active = { id: a.id, stage: a.stage === 'report' ? 'report' : 'go' };
      if (job(a.id).kind === 'strays' && state.active.stage === 'go') spawnStrays(job(a.id));
    }
  }

  return { state, talk, update, target, load, on: (f) => listeners.push(f) };
}
