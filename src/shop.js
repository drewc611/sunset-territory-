import { POIS } from './world.js';
import { sites } from './sites.js';

// Things to spend money on. Merchants sell goods that change how you play; marshals
// and sheriffs sell stage tickets to towns you've already found.

export const GOODS = [
  { id: 'saddle', name: 'Fine saddle', price: 40, about: 'Lighter and better fitted. Your horse gallops a good deal faster.' },
  { id: 'lantern', name: 'Brass lantern', price: 15, about: 'Hangs from the saddle and lights the ground around you after dark.' },
  { id: 'spyglass', name: 'Spyglass', price: 25, about: 'Your map fills in much farther around you as you ride.' },
  { id: 'rod', name: 'Fishing rod', price: 5, about: "Cast from the bank of the lake or a river. I'll buy whatever you catch." },
  { id: 'bedroll', name: 'Bedroll', price: 12, about: 'Sleep where you stand, on foot, from dusk until dawn. Press B.' },
];

const STAGE_PER_KM = 1.5, STAGE_BASE = 2;

export function createShop({ jobs, discovered, onBuy, onStage }) {
  const owned = new Set();
  const has = (id) => owned.has(id);

  function goodsDialog(person) {
    const st = jobs.state;
    const left = GOODS.filter((g) => !owned.has(g.id));
    if (!left.length) return { name: person.name, text: "You've bought everything I carry. Come back when the freight's in.", choices: [{ label: 'Ride on', run: () => {} }] };
    return {
      name: person.name,
      text: `Here's what's on the shelf. You have $${st.money}.  ` + left.map((g) => `${g.name}: ${g.about}`).join('  '),
      choices: left.map((g) => ({
        label: `${g.name} ($${g.price})`,
        disabled: st.money < g.price,
        run: () => { if (st.money < g.price) return; st.money -= g.price; owned.add(g.id); onBuy(g); },
      })).concat([{ label: 'Not today', run: () => {} }]),
    };
  }

  // Towns you've found, other than the one you're in, nearest six.
  function stageDialog(person, from) {
    const st = jobs.state;
    const towns = POIS.filter((p) => p.type === 'town').concat(sites().filter((s) => s.kind === 'town'))
      .filter((t) => discovered[t.name] && Math.hypot(t.x - from.x, t.z - from.z) > 150)
      .map((t) => ({ t, km: Math.hypot(t.x - from.x, t.z - from.z) / 1000 }))
      .sort((a, b) => a.km - b.km).slice(0, 6);
    if (!towns.length) return { name: person.name, text: "The stage only runs to towns you've been to. Ride out and find a few.", choices: [{ label: 'Ride on', run: () => {} }] };
    return {
      name: person.name,
      text: `Stage leaves when you're aboard. Your horse rides behind. You have $${st.money}.`,
      choices: towns.map(({ t, km }) => {
        const price = Math.round(STAGE_BASE + km * STAGE_PER_KM);
        return { label: `${t.name}, ${km.toFixed(1)} km ($${price})`, disabled: st.money < price, run: () => { if (st.money < price) return; st.money -= price; onStage(t, km); } };
      }).concat([{ label: 'Not today', run: () => {} }]),
    };
  }

  // Extra choices for someone's dialogue, by who they are.
  function extras(person, here, open) {
    const out = [];
    if (person.role === 'merchant') out.push({ label: 'See the goods', run: () => open(goodsDialog(person)) });
    if (person.role === 'sheriff') out.push({ label: 'Buy a stage ticket', run: () => open(stageDialog(person, here)) });
    return out;
  }

  return { extras, has, owned, load: (list) => (list || []).forEach((id) => GOODS.some((g) => g.id === id) && owned.add(id)), list: () => [...owned] };
}
