import * as THREE from 'three';
import { Builder, skinRig } from './models.js';
import { createRig } from './character.js';

// A jointed low poly horse built in code, with real gaits: a four beat walk, a
// diagonal trot, a gallop, and an idle where it shifts its weight, swishes its tail
// and drops its head to graze. Facing +z, hooves at y = 0, about 1.5 m at the withers.
// Same interface as horse.js: { root, rig, seat, update, ready }.

const COAT = 0x96603a, DARK = 0x33201a, HOOF = 0x1c1410, BLAZE = 0xe8dcc8, BLANKET = 0x8a2b2b, LEATHER = 0x4a2e1b;

function part(fn) { const b = new Builder(); fn(b); return b.build(); }

// Leg pieces, origin at the joint.
const upperFront = () => part((b) => b.add(new THREE.CylinderGeometry(0.11, 0.075, 0.5, 6), COAT, { y: -0.25 }, { shade: 0.15 }));
const upperHind = () => part((b) => b.add(new THREE.CylinderGeometry(0.15, 0.08, 0.55, 6), COAT, { y: -0.25, z: -0.04, rx: 0.15 }, { shade: 0.15 }));
const lower = () => part((b) => {
  b.add(new THREE.CylinderGeometry(0.06, 0.05, 0.48, 6), DARK, { y: -0.24 });
  b.add(new THREE.CylinderGeometry(0.075, 0.09, 0.1, 7), HOOF, { y: -0.52 });
});

export function createHorse(scene) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  const parts = [];
  const joint = (parent, x, y, z, geo) => { const j = new THREE.Bone(); j.position.set(x, y, z); parent.add(j); if (geo) parts.push([j, geo]); return j; };

  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  scene.add(root);

  // Body: barrel, chest and rump, with blanket and saddle on top.
  const body = joint(root, 0, 1.18, 0, part((b) => {
    b.add(new THREE.CylinderGeometry(0.33, 0.34, 1.15, 9), COAT, { rx: Math.PI / 2 }, { shade: 0.25 });
    b.add(new THREE.IcosahedronGeometry(0.37, 1), COAT, { z: 0.58, y: 0.03, sy: 1.05 }, { shade: 0.2 });
    b.add(new THREE.IcosahedronGeometry(0.38, 1), COAT, { z: -0.6, y: 0.04, sx: 1.05 }, { shade: 0.2 });
    b.add(new THREE.BoxGeometry(0.78, 0.04, 0.8), BLANKET, { y: 0.34, z: -0.05 });
    b.add(new THREE.BoxGeometry(0.5, 0.14, 0.55), LEATHER, { y: 0.4, z: -0.08 });
    b.add(new THREE.BoxGeometry(0.14, 0.18, 0.12), LEATHER, { y: 0.52, z: 0.14 });   // pommel
    b.add(new THREE.BoxGeometry(0.42, 0.14, 0.08), LEATHER, { y: 0.48, z: -0.33 });  // cantle
    for (const sx of [-1, 1]) b.add(new THREE.BoxGeometry(0.03, 0.42, 0.06), LEATHER, { x: sx * 0.33, y: 0.15, z: -0.05 }); // stirrup leathers
  }));

  // Neck and head.
  const neck = joint(body, 0, 0.2, 0.72, part((b) => {
    b.add(new THREE.CylinderGeometry(0.15, 0.27, 0.78, 8), COAT, { y: 0.34 }, { shade: 0.15 });
    b.add(new THREE.BoxGeometry(0.07, 0.72, 0.16), DARK, { y: 0.36, z: -0.15 }, { jitter: 0.03, seed: 3 }); // mane
  }));
  neck.rotation.x = 0.62;
  const head = joint(neck, 0, 0.72, 0.02, part((b) => {
    b.add(new THREE.BoxGeometry(0.22, 0.26, 0.34), COAT, { y: 0.02, z: 0.08 }, { shade: 0.1 });
    b.add(new THREE.BoxGeometry(0.17, 0.2, 0.32), COAT, { y: -0.06, z: 0.36, rx: 0.12 });
    b.add(new THREE.BoxGeometry(0.06, 0.16, 0.28), BLAZE, { y: 0.0, z: 0.31, rx: 0.1 });
    b.add(new THREE.BoxGeometry(0.18, 0.12, 0.12), DARK, { y: -0.12, z: 0.51 });     // muzzle
    for (const sx of [-1, 1]) {
      b.add(new THREE.ConeGeometry(0.04, 0.14, 4), COAT, { x: sx * 0.07, y: 0.2, z: -0.02 });
      b.add(new THREE.BoxGeometry(0.03, 0.03, 0.3), LEATHER, { x: sx * 0.1, y: -0.05, z: 0.28 }); // bridle
    }
  }));
  head.rotation.x = 1.0;

  // Tail.
  const tail = joint(body, 0, 0.18, -0.95, part((b) => {
    b.add(new THREE.CylinderGeometry(0.05, 0.12, 0.7, 6), DARK, { y: -0.32 }, { jitter: 0.04, seed: 5 });
  }));
  tail.rotation.x = 0.5;

  // Legs. Each: hip (upper) → knee or hock (lower).
  const legs = [];
  for (const [x, z, front] of [[0.17, 0.55, true], [-0.17, 0.55, true], [0.17, -0.58, false], [-0.17, -0.58, false]]) {
    const hip = joint(body, x, -0.12, z, front ? upperFront() : upperHind());
    const knee = joint(hip, 0, front ? -0.5 : -0.52, front ? 0 : -0.07, lower());
    legs.push({ hip, knee, front, left: x > 0 });
  }

  // One draw call for the whole horse.
  skinRig(root, parts, mat);

  // Rider seat on the saddle.
  const seat = new THREE.Group();
  seat.position.set(0, 0.46, -0.1);
  body.add(seat);
  const rig = createRig();
  seat.add(rig.root);

  // Gait tables: phase offset per leg [LF, RF, LH, RH], swing amplitude, stride rate.
  const GAITS = {
    walk: { off: [0.25, 0.75, 0.0, 0.5], amp: 0.32, knee: 0.55, rate: (s) => 0.75 + s * 0.12, bob: 0.02, nod: 0.12 },
    trot: { off: [0.0, 0.5, 0.5, 0.0], amp: 0.48, knee: 0.9, rate: (s) => 1.25 + s * 0.05, bob: 0.055, nod: 0.05 },
    gallop: { off: [0.45, 0.35, 0.1, 0.0], amp: 0.78, knee: 1.2, rate: (s) => 1.7 + s * 0.022, bob: 0.09, nod: 0.16 },
  };
  const ORDER = [0, 1, 2, 3]; // legs array order: LF, RF, LH, RH
  let phase = 0, t = 0, lean = 0, graze = 0, grazeTimer = 6, shift = 0;
  const w = { walk: 0, trot: 0, gallop: 0 };

  function gaitWeights(s) {
    // Crossfade walk → trot → gallop with ground speed.
    const tw = THREE.MathUtils.smoothstep(s, 3.5, 6.5), gw = THREE.MathUtils.smoothstep(s, 13, 17);
    w.walk = 1 - tw; w.trot = tw * (1 - gw); w.gallop = gw;
  }

  function update(dt, speed, turn, mounted = true) {
    t += dt;
    const s = Math.abs(speed), moving = s > 0.3;
    gaitWeights(s);
    const rate = w.walk * GAITS.walk.rate(s) + w.trot * GAITS.trot.rate(s) + w.gallop * GAITS.gallop.rate(s);
    if (moving) phase = (phase + dt * rate * Math.sign(speed || 1)) % 1;
    const move = THREE.MathUtils.smoothstep(s, 0.3, 1.5);

    // Legs: hip swings forward and back; the lower leg folds on the forward swing.
    legs.forEach((leg, i) => {
      let hipA = 0, kneeA = 0;
      for (const g of ['walk', 'trot', 'gallop']) {
        if (!w[g]) continue;
        const G = GAITS[g], ph = (phase + G.off[ORDER[i]]) * Math.PI * 2;
        hipA += w[g] * Math.sin(ph) * G.amp;
        const fold = Math.max(0, Math.sin(ph + (leg.front ? 1.3 : 1.0)));
        kneeA += w[g] * fold * G.knee;
      }
      hipA *= move; kneeA *= move;
      // Standing: a hind leg rests with the hoof tipped, and weight shifts now and then.
      const rest = !moving && !leg.front && leg.left === (shift > 0) ? 0.25 : 0;
      leg.hip.rotation.x = -hipA * (leg.front ? 1 : 0.9);
      leg.knee.rotation.x = leg.front ? kneeA : -kneeA * 0.8 - rest * 0.6;
      if (rest) leg.hip.rotation.x += rest * 0.15;
    });

    // Body: bob and pitch with the stride, rock in the gallop.
    let bob = 0, nod = 0;
    for (const g of ['walk', 'trot', 'gallop']) {
      if (!w[g]) continue;
      const G = GAITS[g], twice = g === 'gallop' ? 1 : 2;
      bob += w[g] * Math.abs(Math.sin(phase * Math.PI * 2 * twice / 2 * 2)) * G.bob;
      nod += w[g] * Math.sin(phase * Math.PI * 2 * twice) * G.nod;
    }
    body.position.y = 1.18 + bob * move - (!moving ? 0.01 : 0);
    body.rotation.x = (w.gallop * Math.sin(phase * Math.PI * 2) * 0.07) * move;

    // Head and neck: nod with the gait; when standing riderless, graze now and then.
    grazeTimer -= dt;
    if (grazeTimer <= 0) { grazeTimer = 5 + Math.random() * 7; shift = Math.random() > 0.5 ? 1 : -1; }
    const wantGraze = !moving && !mounted && grazeTimer > 2.5 && grazeTimer < 5.5 ? 1 : 0;
    graze += (wantGraze - graze) * Math.min(1, dt * 1.5);
    neck.rotation.x = 0.62 + nod * move + graze * 1.05 - w.gallop * 0.12 * move;
    head.rotation.x = 1.0 - graze * 0.5 + Math.sin(t * 0.7) * 0.03 * (1 - move);
    head.rotation.y = !moving ? Math.sin(t * 0.37) * 0.25 * (1 - graze) : 0;

    // Tail: swishes when standing, streams out at a gallop.
    tail.rotation.x = 0.5 + w.gallop * 0.6 * move + Math.sin(t * 2.2) * 0.05;
    tail.rotation.z = !moving ? Math.sin(t * 1.3 + Math.sin(t * 0.4) * 2) * 0.35 : Math.sin(phase * Math.PI * 2) * 0.08;

    // Lean into turns, harder at speed.
    const targetLean = -turn * Math.min(1, s / 25) * 0.2;
    lean += (targetLean - lean) * Math.min(1, dt * 4);
    root.rotation.z = lean;
    seat.rotation.z = -lean * 0.5;
    seat.rotation.x = -body.rotation.x * 0.6;

    if (mounted) rig.update(dt, 'ride', s);
  }

  return { root, rig, seat, update, ready: Promise.resolve() };
}
