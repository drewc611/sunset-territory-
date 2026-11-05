import * as THREE from 'three';

// Aerial perspective for every material that takes fog. three's linear fog starts
// abruptly and treats a valley floor the same as a ridge top. This replaces its fog
// chunks (before any material compiles) with haze that builds up gently from close
// range and lies thicker in low ground than on the heights, so distance reads in
// layers. It never fogs less than three's linear fog would, so far terrain edges
// still vanish into the haze at fogFar. No new uniforms: the height comes from the
// view space position and the world's up axis, which every material has.

THREE.ShaderChunk.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
	varying float vFogDepth;
	varying float vFogHeight;
#endif`;

THREE.ShaderChunk.fog_vertex = /* glsl */`
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogHeight = dot( mvPosition.xyz, ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ); // meters above the camera
#endif`;

THREE.ShaderChunk.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying float vFogHeight;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`;

THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float lin = smoothstep( fogNear, fogFar, vFogDepth );
		// Haze that starts thin near you and thickens with distance...
		float haze = 1.0 - exp( - 2.4 * max( vFogDepth - fogNear * 0.35, 0.0 ) / fogFar );
		// ...lying heavier below you and thinner on the heights.
		haze *= clamp( exp( - vFogHeight * 0.011 ), 0.6, 1.5 );
		float fogFactor = clamp( max( lin, haze * 0.92 ), 0.0, 1.0 );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;
