import * as THREE from 'three';
import { Builder, skinRig } from './models.js';

// Jointed low poly person, built in code. The same body plan is used for the
// player (riding, walking, running, idle) and, merged into a static mesh with a
// separate head, for town NPCs. Facing +z, feet at y=0, about 1.75 m tall.

export const PALETTES = {
  rider: { coat: 0x5a4632, shirt: 0x8a3a30, pants: 0x3a3640, hat: 0x3b2a1e, skin: 0xc69a74, boots: 0x2a1c14, scarf: 0xb04040 },
  sheriff: { coat: 0x2e2c30, shirt: 0xd8c7a1, pants: 0x4a4038, hat: 0x2a2420, skin: 0xb88660, boots: 0x22180f, scarf: 0xc9a24d },
  miner: { coat: 0x6a5a48, shirt: 0x7a6a50, pants: 0x4a5060, hat: 0x5a4a38, skin: 0xd0a07a, boots: 0x3a2a1c, scarf: 0x6a3a2a },
  merchant: { coat: 0x3a4a5a, shirt: 0xe0d4bc, pants: 0x2e2e34, hat: 0x2a2a2a, skin: 0xc89a76, boots: 0x1e1610, scarf: 0x8a6a3a },
  rancher: { coat: 0x8a6a44, shirt: 0x5a6a7a, pants: 0x3a3228, hat: 0x9a8058, skin: 0xa87850, boots: 0x3a2618, scarf: 0x3a5a6a },
  townswoman: { coat: 0x6a3a40, shirt: 0xd8c0b0, pants: 0x5a3038, hat: 0xb8a080, skin: 0xd8aa86, boots: 0x2a1c14, scarf: 0xd8c7a1, skirt: true },
};

const seg = (b, geo, color, t, o) => b.add(geo, color, t, o);

// Geometry for each body part, origin at its joint.
function partGeos(p) {
  const mk = (fn) => { const b = new Builder(); fn(b); return b.build(); };
  return {
    pelvis: mk((b) => {
      seg(b, new THREE.BoxGeometry(0.34, 0.2, 0.22), p.pants, { y: 0 });
      seg(b, new THREE.BoxGeometry(0.36, 0.06, 0.24), 0x3a2618, { y: 0.1 }); // belt
      seg(b, new THREE.BoxGeometry(0.08, 0.06, 0.03), 0xc9a24d, { y: 0.1, z: 0.12 });
      if (p.skirt) seg(b, new THREE.CylinderGeometry(0.2, 0.34, 0.75, 8), p.coat, { y: -0.3 }, { shade: 0.3 });
    }),
    torso: mk((b) => {
      seg(b, new THREE.BoxGeometry(0.4, 0.52, 0.24), p.coat, { y: 0.28 }, { shade: 0.2 });
      seg(b, new THREE.BoxGeometry(0.16, 0.4, 0.02), p.shirt, { y: 0.32, z: 0.125 });
      seg(b, new THREE.BoxGeometry(0.3, 0.08, 0.26), p.scarf, { y: 0.55 });
    }),
    coatTail: mk((b) => {
      if (!p.skirt) seg(b, new THREE.BoxGeometry(0.42, 0.5, 0.05), p.coat, { y: -0.25, z: -0.11 }, { shade: 0.3 });
    }),
    head: mk((b) => {
      seg(b, new THREE.BoxGeometry(0.09, 0.08, 0.09), p.skin, { y: 0.04 }); // neck
      seg(b, new THREE.IcosahedronGeometry(0.115, 1), p.skin, { y: 0.17, sy: 1.12 });
      seg(b, new THREE.BoxGeometry(0.05, 0.03, 0.05), p.skin, { y: 0.15, z: 0.11 }); // nose
      seg(b, new THREE.CylinderGeometry(0.24, 0.25, 0.025, 14), p.hat, { y: 0.27 });
      seg(b, new THREE.CylinderGeometry(0.11, 0.13, 0.15, 10), p.hat, { y: 0.35 });
      seg(b, new THREE.CylinderGeometry(0.132, 0.132, 0.03, 10), 0x2a1c14, { y: 0.3 });
    }),
    upperArm: mk((b) => seg(b, new THREE.CylinderGeometry(0.05, 0.045, 0.3, 6), p.coat, { y: -0.15 })),
    foreArm: mk((b) => {
      seg(b, new THREE.CylinderGeometry(0.045, 0.04, 0.27, 6), p.coat, { y: -0.135 });
      seg(b, new THREE.BoxGeometry(0.07, 0.09, 0.05), p.skin, { y: -0.31 });
    }),
    thigh: mk((b) => seg(b, new THREE.CylinderGeometry(0.075, 0.06, 0.44, 6), p.pants, { y: -0.22 })),
    shin: mk((b) => {
      seg(b, new THREE.CylinderGeometry(0.058, 0.05, 0.3, 6), p.pants, { y: -0.15 });
      seg(b, new THREE.CylinderGeometry(0.06, 0.06, 0.16, 6), p.boots, { y: -0.36 });
      seg(b, new THREE.BoxGeometry(0.1, 0.07, 0.22), p.boots, { y: -0.43, z: 0.05 });
    }),
  };
}

const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });

// Animated rig for the player.
export function createRig(palette = PALETTES.rider) {
  const g = partGeos(palette);
  const parts = [];
  const joint = (parent, x, y, z, geo) => { const j = new THREE.Bone(); j.position.set(x, y, z); parent.add(j); if (geo) parts.push([j, geo]); return j; };

  const root = new THREE.Group();
  const hips = joint(root, 0, 0.95, 0, g.pelvis);
  const tail = joint(hips, 0, 0.12, 0, g.coatTail);
  const torso = joint(hips, 0, 0.1, 0, g.torso);
  const head = joint(torso, 0, 0.58, 0, g.head);
  const arm = (sx) => { const sh = joint(torso, sx * 0.24, 0.5, 0, g.upperArm); const el = joint(sh, 0, -0.3, 0, g.foreArm); return { sh, el }; };
  const leg = (sx) => { const hp = joint(hips, sx * 0.1, -0.06, 0, g.thigh); const kn = joint(hp, 0, -0.44, 0, g.shin); return { hp, kn }; };
  const L = { arm: arm(1), leg: leg(1) }, R = { arm: arm(-1), leg: leg(-1) };
  skinRig(root, parts, mat); // one draw call for the whole figure

  let phase = 0, breath = 0;
  const lerpTo = (obj, axis, v, k) => { obj.rotation[axis] += (v - obj.rotation[axis]) * k; };

  // mode: 'ride' | 'walk' | 'idle' | 'fish'. speed in m/s for walking. gait 0..1 for riding bounce.
  function update(dt, mode, speed = 0) {
    breath += dt;
    const k = Math.min(1, dt * 12);
    if (mode === 'ride') {
      hips.position.y = 0;
      for (const [side, sx] of [[L, 1], [R, -1]]) {
        lerpTo(side.leg.hp, 'x', -1.25, k); lerpTo(side.leg.hp, 'z', sx * 0.42, k);
        lerpTo(side.leg.kn, 'x', 1.45, k);
        lerpTo(side.arm.sh, 'x', -0.55, k); lerpTo(side.arm.sh, 'z', sx * 0.12, k);
        lerpTo(side.arm.el, 'x', -0.95, k);
      }
      lerpTo(torso, 'x', 0.08 + Math.min(0.25, speed * 0.01), k);
      lerpTo(tail, 'x', 1.1, k);
      head.rotation.y *= 1 - k;
      return;
    }
    if (mode === 'fish') {
      // Standing square to the water, rod hand out in front, the other hand at the reel.
      hips.position.y = 0.95 + Math.sin(breath * 1.6) * 0.004;
      for (const [side, sx] of [[L, 1], [R, -1]]) {
        lerpTo(side.leg.hp, 'x', 0, k); lerpTo(side.leg.hp, 'z', sx * 0.05, k); lerpTo(side.leg.kn, 'x', 0.05, k);
      }
      lerpTo(R.arm.sh, 'x', -0.95, k); lerpTo(R.arm.sh, 'z', -0.08, k); lerpTo(R.arm.el, 'x', -0.45, k);
      lerpTo(L.arm.sh, 'x', -0.55, k); lerpTo(L.arm.sh, 'z', -0.25, k); lerpTo(L.arm.el, 'x', -0.9, k);
      lerpTo(torso, 'x', 0.04, k); torso.rotation.y = 0; lerpTo(tail, 'x', 0.02, k);
      return;
    }
    hips.position.y = 0.95;
    const moving = mode === 'walk' && speed > 0.1;
    const run = THREE.MathUtils.clamp((speed - 2) / 2.5, 0, 1);
    if (moving) phase += dt * (3.2 + speed * 1.55);
    const amp = moving ? 0.45 + run * 0.35 : 0;
    const sw = Math.sin(phase);
    for (const [side, sx, off] of [[L, 1, 0], [R, -1, Math.PI]]) {
      const s = Math.sin(phase + off);
      lerpTo(side.leg.hp, 'x', -s * amp, k); lerpTo(side.leg.hp, 'z', sx * 0.02, k);
      lerpTo(side.leg.kn, 'x', moving ? Math.max(0, Math.sin(phase + off - 1.2)) * (0.8 + run * 0.7) : 0.04, k);
      lerpTo(side.arm.sh, 'x', s * amp * 0.8, k); lerpTo(side.arm.sh, 'z', sx * 0.08, k);
      lerpTo(side.arm.el, 'x', moving ? -0.3 - run * 0.9 : -0.12, k);
    }
    hips.position.y = 0.95 + (moving ? Math.abs(Math.cos(phase)) * (0.03 + run * 0.05) - 0.02 : Math.sin(breath * 1.6) * 0.004);
    lerpTo(torso, 'x', moving ? 0.05 + run * 0.2 : 0.0, k);
    torso.rotation.y = moving ? sw * 0.08 : 0;
    lerpTo(tail, 'x', moving ? 0.15 + run * 0.4 : 0.02, k);
  }

  return { root, update, head, hand: R.arm.el }; // hand: the right forearm's joint; the grip is 0.28 m down it
}

// Static NPC body (merged, standing) plus a separate head so it can turn.
export function npcGeometry(palette) {
  const g = partGeos(palette);
  const b = [];
  const at = (geo, x, y, z, rx = 0, rz = 0) => {
    const c = geo.clone();
    c.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz)).setPosition(x, y, z));
    b.push(c);
  };
  at(g.pelvis, 0, 0.95, 0);
  at(g.coatTail, 0, 1.07, 0);
  at(g.torso, 0, 1.05, 0);
  for (const sx of [1, -1]) {
    at(g.thigh, sx * 0.1, 0.89, 0, 0, sx * 0.03);
    at(g.shin, sx * 0.11, 0.45, 0);
    // Arms hang with a slight bend; hands near the belt.
    at(g.upperArm, sx * 0.24, 1.55, 0, 0.05, sx * 0.1);
    at(g.foreArm, sx * 0.27, 1.25, 0.01, -0.2, sx * 0.05);
  }
  const body = mergeParts(b);
  return { body, head: g.head, headY: 1.63 };
}

function mergeParts(list) {
  const b = new Builder();
  b.parts = list;
  return b.build();
}

export const personMaterial = mat;
