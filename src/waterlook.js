import * as THREE from 'three';

// How water meets the light, shared by the lake and every river chunk. The surface
// mirrors the sky it faces (horizon color low, zenith overhead) by a fresnel
// that's nearly clear looking straight down and nearly a mirror at a glance, and
// the sun leaves a sharp, rippling glint path across it. The normal map that makes
// the ripples is each material's own.
export const waterUniforms = {
  uSkyH: { value: new THREE.Color(0xd9b98c) },
  uSkyZ: { value: new THREE.Color(0x5b9bd8) },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunCol: { value: new THREE.Color(0, 0, 0) },
};

export const WATER_PARS = /* glsl */`uniform vec3 uSkyH, uSkyZ, uSunDir, uSunCol;`;

// Expects view space 'normal' and 'vViewPosition', and sets outgoingLight and alpha.
export const WATER_LIGHT = /* glsl */`
  {
    mat3 toWorld = transpose(mat3(viewMatrix));
    vec3 toEye = normalize(vViewPosition);
    float cosT = clamp(dot(toEye, normal), 0.0, 1.0);
    float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);            // Schlick, water's F0 of 0.02
    vec3 R = toWorld * reflect(-toEye, normal);
    vec3 sky = mix(uSkyH, uSkyZ, pow(clamp(R.y, 0.0, 1.0), 0.6));
    outgoingLight = mix(outgoingLight, sky, clamp(0.06 + 0.9 * fres, 0.0, 0.92));
    float glint = pow(max(dot(normalize(R), uSunDir), 0.0), 420.0);
    outgoingLight += uSunCol * glint * 5.0;
    diffuseColor.a = mix(0.7, 0.97, fres);
  }`;

const _z = new THREE.Color();
// Once a frame, from the sky's state.
export function updateWater(sky) {
  waterUniforms.uSkyH.value.copy(sky.horizonTint);
  waterUniforms.uSkyZ.value.copy(_z.copy(sky.zenith).lerp(sky.horizonTint, 0.25));
  waterUniforms.uSunDir.value.copy(sky.sunDir);
  waterUniforms.uSunCol.value.copy(sky.sunColor).multiplyScalar(Math.max(0, Math.min(1, sky.elev * 6)) * (1 - (sky.overcast || 0) * 0.85));
}
