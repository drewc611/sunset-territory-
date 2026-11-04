import * as THREE from 'three';
import { WORLD, SEG, height, fbm, vnoise, LAKE, LAKE_Y, POIS } from './world.js';

// Textured terrain. Grass, dirt, rock and snow are blended per pixel in a patched
// MeshStandardMaterial: rock by slope and height (triplanar so cliffs don't stretch),
// dirt and snow from a per-vertex splat attribute. Biome tint comes from the
// prototype's palette so the valley keeps its colors. There are no normal map assets
// yet, so surface relief is a bump derived from texture luminance with screen-space
// derivatives, faded out with distance.

const GRASS_AVG = new THREE.Vector3(0.108, 0.213, 0.019); // measured linear averages of grass.jpg
const GRASS_LUM = 0.16;
const ROCK_LUM = 0.2;

function loadTex(loader, url, anisotropy) {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

export function createTerrain(scene, renderer, base) {
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const biome = new Float32Array(pos.count * 3);
  const splat = new Float32Array(pos.count * 3); // x dirt, y snow, z mud

  const cGrass = new THREE.Color(0x5f7a35), cGrass2 = new THREE.Color(0x8a8f3f), cDry = new THREE.Color(0xa89258);
  const c = new THREE.Color();
  const towns = POIS.filter((p) => p.type === 'town' || p.type === 'camp');
  const flats = POIS.find((p) => p.type === 'flat');

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = height(x, z);
    pos.setY(i, h);
    const m = fbm(x * 0.03 + 50, z * 0.03), m2 = vnoise(x * 0.08, z * 0.08);
    c.lerpColors(cDry, m2 > 0.5 ? cGrass : cGrass2, Math.min(1, Math.max(0, (h + 3) / 9)));
    c.offsetHSL(0, 0, (m - 0.5) * 0.16);
    biome.set([c.r, c.g, c.b], i * 3);

    let dirt = Math.min(1, Math.max(0, 1 - (h + 6) / 10)); // low ground dries out to sand
    dirt = Math.max(dirt, (vnoise(x * 0.05 + 11, z * 0.05) - 0.62) * 2.2); // dry patches
    const df = Math.hypot(x - flats.x, z - flats.z);
    dirt = Math.max(dirt, 1 - Math.max(0, (df - flats.r * 0.7) / (flats.r * 0.5)));
    for (const p of towns) {
      const d = Math.hypot(x - p.x, z - p.z);
      dirt = Math.max(dirt, 0.9 * (1 - Math.max(0, (d - p.r * 0.75) / (p.r * 0.35))));
    }
    const lakeD = Math.hypot(x - LAKE.x, z - LAKE.z);
    const mud = h < LAKE_Y + 1.5 && lakeD < LAKE.r + 2 ? 1 : 0;
    const snow = Math.min(1, Math.max(0, (h - 26) / 10));
    splat.set([Math.min(1, Math.max(0, dirt)), snow, mud], i * 3);
  }
  geo.setAttribute('biome', new THREE.BufferAttribute(biome, 3));
  geo.setAttribute('splat', new THREE.BufferAttribute(splat, 3));
  geo.computeVertexNormals();

  const loader = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tGrass = loadTex(loader, `${base}assets/grass.jpg`, aniso);
  const tRock = loadTex(loader, `${base}assets/rock.jpg`, aniso);

  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  mat.userData.textures = [tGrass, tRock]; // shader uniforms, listed so the perf HUD counts them
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      tGrass: { value: tGrass }, tRock: { value: tRock },
      grassAvg: { value: GRASS_AVG }, bumpAmt: { value: 0.9 },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 biome; attribute vec3 splat;
        varying vec3 vBiome; varying vec3 vSplat; varying vec3 vWPos; varying vec3 vWNrm;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vBiome = biome; vSplat = splat;
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNrm = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tGrass; uniform sampler2D tRock; uniform vec3 grassAvg; uniform float bumpAmt;
        varying vec3 vBiome; varying vec3 vSplat; varying vec3 vWPos; varying vec3 vWNrm;
        float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
        float tHeight;`)
      .replace('#include <map_fragment>', `
        vec3 wn = normalize(vWNrm);
        float slope = 1.0 - wn.y;
        // Grass: two scales plus a rotated copy so the 1024px tile never lines up.
        vec2 p = vWPos.xz;
        vec3 g1 = texture2D(tGrass, p * 0.21).rgb;
        vec3 g2 = texture2D(tGrass, mat2(0.8, -0.6, 0.6, 0.8) * p * 0.047 + 0.31).rgb;
        vec3 gt = mix(g1, g2, 0.4);
        float gl = lum(gt) / ${GRASS_LUM.toFixed(3)};
        vec3 grassCol = vBiome * mix(vec3(gl), gt / grassAvg, 0.22);
        // Rock: triplanar.
        vec3 bw = pow(abs(wn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        vec3 rt = texture2D(tRock, vWPos.zy * 0.11).rgb * bw.x
                + texture2D(tRock, vWPos.xz * 0.11).rgb * bw.y
                + texture2D(tRock, vWPos.xy * 0.11).rgb * bw.z;
        float rl = lum(rt) / ${ROCK_LUM.toFixed(3)};
        vec3 rockCol = vec3(0.30, 0.25, 0.21) * rl;
        // Dirt: rock texture at a finer scale, dusty tint; mud by the lake.
        float dl = lum(texture2D(tRock, p * 0.37 + 0.5).rgb) / ${ROCK_LUM.toFixed(3)};
        vec3 dirtCol = mix(vec3(0.34, 0.24, 0.14), vec3(0.12, 0.09, 0.06), vSplat.z) * mix(1.0, dl, 0.6);
        // Macro variation, very low frequency, breaks up repetition at 30m+.
        float macro = texture2D(tGrass, p * 0.0043).g / grassAvg.g;
        float dirtW = clamp(vSplat.x + (macro - 1.0) * 0.25, 0.0, 1.0);
        dirtW = max(dirtW, vSplat.z);
        float rockW = smoothstep(0.24, 0.42, slope + (rl - 1.0) * 0.12);
        rockW = max(rockW, smoothstep(20.0, 30.0, vWPos.y) * 0.75);
        vec3 alb = mix(grassCol, dirtCol, smoothstep(0.25, 0.75, dirtW));
        alb = mix(alb, rockCol, rockW);
        alb = mix(alb, vec3(0.75, 0.72, 0.68), vSplat.y * (1.0 - rockW * 0.5));
        alb *= mix(0.86, 1.14, clamp(macro * 0.5, 0.0, 1.0));
        diffuseColor.rgb *= alb;
        tHeight = mix(mix(gl, dl, dirtW), rl, rockW);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 vp = -vViewPosition;
          vec3 dpdx = dFdx(vp), dpdy = dFdy(vp);
          float dhx = dFdx(tHeight), dhy = dFdy(tHeight);
          vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
          float det = dot(dpdx, r1);
          float fade = 1.0 - smoothstep(18.0, 55.0, length(vViewPosition));
          vec3 grad = sign(det) * (dhx * r1 + dhy * r2) * bumpAmt * 0.04 * fade;
          normal = normalize(abs(det) * normal - grad);
        }`);
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
