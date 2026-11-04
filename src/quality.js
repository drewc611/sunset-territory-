// Quality tiers and automatic step down. On "auto" the game starts at Medium on
// phones and High elsewhere, then watches frame times: if the median frame over
// three seconds is slower than 18.5 ms it steps resolution down, then shadows.
export const TIERS = {
  low: { dpr: 1, shadows: false, shadowSize: 512, grass: 0.45, post: false, fog: 650 },
  medium: { dpr: 1.5, shadows: true, shadowSize: 1024, grass: 0.75, post: false, fog: 1000 },
  high: { dpr: 2, shadows: true, shadowSize: 2048, grass: 1, post: true, fog: 1500 },
};
const ORDER = ['low', 'medium', 'high'];

export function createQuality({ renderer, scene, sun, props, touch, post, terrain, sky, onResize }) {
  let mode = 'auto', tier = touch ? 'medium' : 'high', scale = 1;
  const samples = [];
  let timer = 0, cooldown = 4;

  function apply() {
    const t = TIERS[tier];
    renderer.setPixelRatio(Math.min(devicePixelRatio, t.dpr) * scale);
    if (renderer.shadowMap.enabled !== t.shadows) {
      renderer.shadowMap.enabled = t.shadows;
      // Programs are compiled with or without shadow code, so they have to rebuild.
      scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    }
    sun.castShadow = t.shadows;
    if (sun.shadow.mapSize.x !== t.shadowSize) {
      sun.shadow.mapSize.set(t.shadowSize, t.shadowSize);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    props.setGrassDensity(t.grass);
    if (post) post.setEnabled(t.post);
    if (terrain) terrain.setTier(tier); // how many terrain chunks stream around you
    if (sky) sky.setFogFar(t.fog);     // and how far you see before the haze
    if (onResize) onResize(); // pixel ratio changed, so render targets resize
  }

  function set(m) {
    mode = m;
    if (m !== 'auto') { tier = m; scale = 1; }
    apply();
  }

  function record(dt, frameMs) {
    if (mode !== 'auto') return;
    samples.push(frameMs);
    timer += dt;
    if (cooldown > 0) { cooldown -= dt; samples.length = 0; timer = 0; return; }
    if (timer < 3) return;
    const s = samples.sort((a, b) => a - b), med = s[Math.floor(s.length / 2)];
    samples.length = 0; timer = 0;
    if (med > 18.5) {
      if (scale > 0.75) scale -= 0.125;          // first: render fewer pixels
      else if (tier !== 'low') { tier = ORDER[ORDER.indexOf(tier) - 1]; scale = 1; } // then: drop a tier
      else return;
      apply();
      cooldown = 2;
    }
  }

  return { set, record, apply, get tier() { return tier; }, get scale() { return scale; } };
}
