import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

// Post processing for High and Ultra: half resolution bloom on the sun, lit
// windows and campfires, then a warm painterly grade. Ultra adds ground contact
// shading (GTAO) before the bloom. The scene renders into a 4x multisampled target,
// since the canvas's own antialiasing doesn't apply once rendering goes through
// the composer. Low and Medium render
// straight to the screen, since a phone can't spare the extra full screen passes.
// The vignette stays a CSS overlay (#vignette), which costs nothing.

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, warmth: { value: 0.03 }, sat: { value: 1.1 }, lift: { value: 0.01 } },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float warmth, sat, lift; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, sat);                                   // a little more color
      c += vec3(warmth, warmth * 0.45, -warmth * 0.6) * (1.0 - l); // warm the shadows and mids
      c = lift + c * (1.0 - lift);                               // lift blacks, like paint on paper
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export function createPost(renderer, scene, camera, sky) {
  const size = renderer.getSize(new THREE.Vector2());
  const pr = renderer.getPixelRatio();
  const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  // Contact shading where things meet the ground and each other: under eaves,
  // between boulders, at the foot of every tree and post.
  const ao = new GTAOPass(scene, camera, size.x * pr, size.y * pr);
  ao.updateGtaoMaterial({ radius: 4, distanceExponent: 1.2, thickness: 3, scale: 1.6, samples: 16 });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  ao.blendIntensity = 1;
  ao.enabled = false;
  composer.addPass(ao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.45, 0.5, 2.4); // threshold is pre tone map: the sun, lit windows and flames, not the sky
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass(GradeShader));

  let enabled = false;
  const forceOff = new URLSearchParams(location.search).get('post') === '0'; // ?post=0, for A/B checks
  function setEnabled(v) { enabled = v && !forceOff; if (sky) sky.setPostToned(enabled); }
  function setSize(w, h) {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
  }
  function render() {
    if (enabled) composer.render();
    else renderer.render(scene, camera);
  }
  const aoOff = new URLSearchParams(location.search).get('ao') === '0'; // ?ao=0, for A/B checks
  function setAO(v) { ao.enabled = v && !aoOff; }
  return { render, setEnabled, setAO, setSize, get enabled() { return enabled; }, get ao() { return ao.enabled; } };
}
