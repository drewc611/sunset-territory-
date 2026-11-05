# Sunset Territory

Original third person open world western, browser first. Not a Rockstar game and never branded as one. No Rockstar names, characters, logos, music, or art. Every asset is CC0, MIT, or made here (see public/assets/LICENSES.md).

## Stack
- Vite + three.js (ES modules, pinned in package.json). No framework.
- Assets in public/assets. Load with GLTFLoader and TextureLoader, never embed as base64.
- Target 60fps on a 2022 phone and a laptop iGPU. Measure before adding anything.

## Current state
prototype/index.html is a working single file beta (beta 0.2): procedural terrain, horse riding, day/night, towns, camps, lake, minimap, discovery stamps, touch and keyboard controls. It uses primitives for everything, which is why it looks like a toy. It is the reference for behavior, not for code structure.

## Current state of src/ (Nov 4 2026)
A playable game: riding and walking, eight townsfolk with an eight job chain ending in a homestead deed, synthesized sound, saves, journal, quality tiers. See README.md for the file layout and docs/HANDOVER.md for decisions and known gaps. URL params: ?perf, ?bench, ?t=17.5, ?at=x,z,heading, ?debug.

The phased plan with exit gates is docs/SCHEDULE.md, compressed to finish by Nov 30 2026. Jobs 1 to 6 below are done (props are made in code, not a pack; post processing is bloom plus a color grade on High only, no SSAO).

## The job
Port the prototype into src/ as modules and replace the primitive look with real assets and materials, in this order:
1. Horse (done; since replaced by the jointed horse in src/horse-rig.js, see docs/HANDOVER.md): load Horse.glb (one clip named horse_A_). Scale about 0.0095, head faces +Z. Drive animation timeScale from speed. Rider is a separate rig parented to the horse at saddle height.
2. Terrain: textured, not vertex colored. Grass, rock, dirt blended by slope and height in a custom shader (onBeforeCompile on MeshStandardMaterial). Triplanar for rock on steep slopes. Normal maps.
3. Trees and props: replace cones and boxes with GLTF models from a CC0 pack (Kenney Nature Kit, Quaternius). Instance them.
4. Water: animated normal map (water.jpg) with fresnel; planar reflection if it stays at 60fps.
5. Post: bloom, SSAO, color grade via EffectComposer. Keep the vignette.
6. Then features: collision with buildings and trees, dismount and walk, NPCs standing in towns.

## Rules
- One feature per branch, one PR per feature, screenshot in the PR.
- Keep prototype/index.html untouched as the behavior reference.
- Read docs/DESIGN.md before any UI change.
- No backend, accounts, or saves until the world looks right.
