// Quality tiers and automatic step down. On "auto" the game starts at Medium on
// phones and Ultra elsewhere, then watches frame times: if the median frame over
// three seconds is slower than 18.5 ms it steps resolution down, then a tier.
// Ultra adds ambient occlusion, a 4096 shadow map over a wider area and a longer
// view; a laptop that can't hold it drops to High within a few seconds.
export const TIERS = {
  low: { dpr: 1, shadows: false, shadowSize: 512, shadowSpan: 60, grass: 0.45, grassR: 28, post: false, ao: false, fog: 650 },
  medium: { dpr: 1.5, shadows: true, shadowSize: 1024, shadowSpan: 50, grass: 0.75, grassR: 34, post: false, ao: false, fog: 1000 },
  high: { dpr: 2, shadows: true, shadowSize: 2048, shadowSpan: 60, grass: 1, grassR: 40, post: true, ao: false, fog: 1500 },
  ultra: { dpr: 2, shadows: true, shadowSize: 4096, shadowSpan: 90, grass: 1, grassR: 56, post: true, ao: true, fog: 2200 },
};
const ORDER = ['low', 'medium', 'high', 'ultra'];

export function createQuality({ renderer, scene, sun, props, touch, post, terrain, sky, onResize }) {
  const tierListeners = [];
  let mode = 'auto', tier = touch ? 'medium' : 'ultra', scale = 1;
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
    const cam = sun.shadow.camera;
    if (cam.right !== t.shadowSpan) { Object.assign(cam, { left: -t.shadowSpan, right: t.shadowSpan, top: t.shadowSpan, bottom: -t.shadowSpan }); cam.updateProjectionMatrix(); }
    props.setGrassDensity(t.grass, t.grassR);
    if (post) { post.setEnabled(t.post); post.setAO(t.ao); }
    if (terrain) terrain.setTier(tier); // how many terrain chunks stream around you
    tierListeners.forEach((f) => f(tier));
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

  return { set, record, apply, onTier: (f) => { tierListeners.push(f); f(tier); }, get tier() { return tier; }, get scale() { return scale; } };
}
