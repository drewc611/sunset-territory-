import { residents, resident, nearSite, residentsOf } from './sites.js';

// One way to find anybody: the valley's townsfolk (npcs.js) and the territory's
// generated residents (sites.js) share ids, names and positions.
export function createPeople(npcs) {
  function get(id) { return npcs.byId[id] || resident(id); }
  function nearest(x, z, reach) {
    let best = npcs.nearest(x, z, reach), bd = best ? Math.hypot(best.x - x, best.z - z) : reach;
    const s = nearSite(x, z, 10);
    if (s) for (const r of residentsOf(s.name)) { const d = Math.hypot(r.x - x, r.z - z); if (d < bd) { bd = d; best = r; } }
    return best;
  }
  function all() { return npcs.people.concat(residents()); }
  return { get, nearest, all };
}
