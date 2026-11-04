import * as THREE from 'three';
import { smooth } from './world.js';

// three r155+ uses physical light units; the prototype (r128) used legacy units, which are PI times dimmer here.
const L = Math.PI;

const C = (h) => new THREE.Color(h);
const PAL = {
  night: { z: C(0x070b18), h: C(0x1a2238), sun: C(0x8090c0) },
  dawn: { z: C(0x5a6fa8), h: C(0xf0a070), sun: C(0xffb070) },
  day: { z: C(0x5b9bd8), h: C(0xd9e4ec), sun: C(0xfff2d0) },
  dusk: { z: C(0x3a3560), h: C(0xf07040), sun: C(0xff8040) },
};
const DUST_FOG = C(0xd9b98c);
const WHITE = C(0xffffff);

export function createSky(scene, renderer, { shadowSize = 2048 } = {}) {
  scene.fog = new THREE.Fog(0xd9b98c, 70, 330);

  const hemi = new THREE.HemisphereLight(0xffe9c4, 0x5a4630, 0.6 * L);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffd9a0, 1.4 * L);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(sun.shadow.camera, { near: 1, far: 300, left: -60, right: 60, top: 60, bottom: -60 });
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  const uniforms = {
    zenith: { value: C(0x7fb3e0) }, horizon: { value: C(0xe9c9a0) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: C(0xfff0c0) }, night: { value: 0 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.ShaderMaterial({
      uniforms, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
      vertexShader: /* glsl */`varying vec3 vDir;
        void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`uniform vec3 zenith, horizon, sunDir, sunColor; uniform float night; varying vec3 vDir;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        void main(){
          vec3 d = normalize(vDir); float h = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(horizon, zenith, pow(h, 0.55));
          float s = max(dot(d, sunDir), 0.0);
          col += sunColor * pow(s, 6.0) * 0.35;
          col += sunColor * smoothstep(0.9985, 0.9995, s) * 2.5;
          vec3 g = floor(d * 180.0);
          col += vec3(step(0.9985, hash(g)) * night * smoothstep(0.0, 0.2, d.y)) * 0.9;
          col = mix(col, col * 0.35, night * (1.0 - h * 0.3));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  dome.renderOrder = -1;
  scene.add(dome);

  const state = { night: 0, elev: 1, sunColor: uniforms.sunColor.value, sunDir: uniforms.sunDir.value };
  const tmp = new THREE.Color();

  const GREY = new THREE.Color();
  // overcast 0..1 greys the sky, dims the sun and pulls the fog in.
  function update(clockH, focus, camera, overcast = 0) {
    const ang = (clockH / 24 - 0.25) * Math.PI * 2;
    const elev = Math.sin(ang);
    uniforms.sunDir.value.set(Math.cos(ang), Math.sin(ang), 0.35).normalize();
    sun.position.copy(uniforms.sunDir.value).multiplyScalar(150).add(focus);
    sun.target.position.copy(focus);

    let a, b, k;
    if (elev < -0.2) { a = b = PAL.night; k = 0; }
    else if (elev < 0.15) { a = PAL.night; b = clockH < 12 ? PAL.dawn : PAL.dusk; k = (elev + 0.2) / 0.35; }
    else { a = clockH < 12 ? PAL.dawn : PAL.dusk; b = PAL.day; k = Math.min(1, (elev - 0.15) / 0.55); }
    k = smooth(k);
    uniforms.zenith.value.lerpColors(a.z, b.z, k);
    uniforms.horizon.value.lerpColors(a.h, b.h, k);
    uniforms.sunColor.value.lerpColors(a.sun, b.sun, k);

    if (overcast > 0.01) {
      for (const c of [uniforms.zenith.value, uniforms.horizon.value]) {
        const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
        c.lerp(GREY.setRGB(l * 0.85, l * 0.87, l * 0.92), overcast * 0.75);
      }
      uniforms.sunColor.value.lerp(GREY.setRGB(0.6, 0.6, 0.62), overcast * 0.6);
    }
    const night = Math.max(0, Math.min(1, (-elev + 0.05) / 0.25));
    uniforms.night.value = night;
    scene.fog.color.copy(uniforms.horizon.value).lerp(DUST_FOG, 0.25 * (1 - night));
    scene.fog.near = (70 - night * 30) * (1 - overcast * 0.5);
    scene.fog.far = (330 - night * 120) * (1 - overcast * 0.4);

    // Softer falloff than the prototype's linear curve so golden hour keeps its light.
    sun.intensity = Math.pow(Math.max(0.02, elev), 0.55) * 1.5 * L * (1 - overcast * 0.7);
    sun.color.copy(uniforms.sunColor.value);
    hemi.intensity = (0.22 + Math.max(0, elev) * 0.45) * L;
    // Fill takes half its color from the horizon so dusk shadows stay warm instead of going purple-black.
    hemi.color.copy(uniforms.zenith.value).lerp(uniforms.horizon.value, 0.5).lerp(tmp.copy(WHITE), 0.35);
    // Lower than the prototype at midday, which blew the ground out to white once it had texture detail.
    renderer.toneMappingExposure = 0.72 - Math.max(0, elev) * 0.22 + (elev > -0.2 && elev < 0.2 ? 0.15 : 0);

    dome.position.copy(camera.position);
    state.night = night;
    state.elev = elev;
    return state;
  }

  return { update, state, sun, hemi };
}
