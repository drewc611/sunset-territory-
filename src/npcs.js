import * as THREE from 'three';
import { POIS, height } from './world.js';
import { npcGeometry, personMaterial, PALETTES } from './character.js';

// Townsfolk. Each stands in a fixed spot, breathes, and turns their head to watch
// the player when close. Names and lines are original to this game.
export const PEOPLE = [
  { id: 'reyes', name: 'Sheriff Amos Reyes', role: 'sheriff', at: { town: 'Brass Hollow', t: -4, side: -1 } },
  { id: 'ida', name: 'Ida Pell', role: 'merchant', at: { town: 'Brass Hollow', t: 9, side: 1 } },
  { id: 'cole', name: 'Cole Danner', role: 'miner', at: { town: 'Brass Hollow', t: 19, side: -1 } },
  { id: 'mae', name: 'Mae Caldwell', role: 'townswoman', at: { town: 'Caldwell Crossing', t: -9, side: 1 } },
  { id: 'hollis', name: 'Hollis Grant', role: 'rancher', at: { town: 'Caldwell Crossing', t: 6, side: -1 } },
  { id: 'wilder', name: 'Doc Wilder', role: 'merchant', at: { town: 'Caldwell Crossing', t: 13, side: 1 } },
  { id: 'jory', name: 'Jory Banks', role: 'rancher', at: { camp: "Drover's Camp", a: 1.6, r: 3.4 } },
  { id: 'sarrow', name: 'Widow Sarrow', role: 'townswoman', at: { camp: "Widow's Rest", a: 3.9, r: 3.2 } },
];

export function createNpcs(scene, towns) {
  const geoCache = {};
  const people = [];
  const circles = [];

  for (const def of PEOPLE) {
    let x, z, face;
    if (def.at.town) {
      const f = towns[def.at.town];
      // On the boardwalk edge in front of a building, facing the street.
      const off = 5.4 * def.at.side;
      x = f.x + f.ux * def.at.t + f.nx * off;
      z = f.z + f.uz * def.at.t + f.nz * off;
      face = Math.atan2(-def.at.side * f.nx, -def.at.side * f.nz);
    } else {
      const c = POIS.find((p) => p.name === def.at.camp);
      x = c.x + Math.cos(def.at.a) * def.at.r;
      z = c.z + Math.sin(def.at.a) * def.at.r;
      face = Math.atan2(c.x - x, c.z - z); // toward the fire
    }
    const pal = PALETTES[def.role];
    const g = geoCache[def.role] || (geoCache[def.role] = npcGeometry(pal));
    const root = new THREE.Group();
    const body = new THREE.Mesh(g.body, personMaterial);
    const head = new THREE.Mesh(g.head, personMaterial);
    head.position.y = g.headY;
    body.castShadow = head.castShadow = true;
    root.add(body, head);
    root.position.set(x, height(x, z), z);
    root.rotation.y = face;
    scene.add(root);
    people.push({ ...def, x, z, face, root, head, body, phase: Math.random() * 6 });
    circles.push({ x, z, r: 0.35 });
  }

  const tmp = new THREE.Vector3();
  function update(dt, player) {
    for (const p of people) {
      p.phase += dt;
      p.body.scale.y = 1 + Math.sin(p.phase * 1.7) * 0.006;
      const dx = player.x - p.x, dz = player.z - p.z, d = Math.hypot(dx, dz);
      let want = 0;
      if (d < 10) {
        want = Math.atan2(dx, dz) - p.face;
        want = Math.atan2(Math.sin(want), Math.cos(want));
        want = Math.max(-1.1, Math.min(1.1, want)); // heads turn, bodies don't
      } else {
        want = Math.sin(p.phase * 0.31) * 0.35; // idly look up and down the street
      }
      p.head.rotation.y += (want - p.head.rotation.y) * Math.min(1, dt * 3);
    }
  }

  // Nearest person within reach of the player, for the TALK prompt.
  function nearest(x, z, reach = 3.2) {
    let best = null, bd = reach;
    for (const p of people) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  return { update, nearest, people, byId, circles };
}
