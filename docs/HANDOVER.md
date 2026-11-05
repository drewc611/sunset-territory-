# Handover, Nov 4 2026

## Done
- Beta 0.1 and 0.2 built as a single HTML artifact in chat. 0.2 added a shader sky with sun and stars, clouds, ACES tone mapping, 200 segment faceted terrain, a lake, 4,000 swaying grass blades, dust, lit windows at night, and a jointed horse rig.
- Verdict from Andrew: still looks like a toy. Agreed cause: primitive geometry and no textures. Lighting is no longer the bottleneck.
- Assets pulled and license checked: three.js Horse.glb (animated, MIT), grass and water textures (MIT), procedural rock texture.
- Horse.glb inspected: 796 verts, vertex colors, one clip "horse_A_", bounds y 0.8 to 183 units, head at +Z.

## Done since (Nov 4, in the repo)
- Port into src/ modules, textured terrain, low poly props, collision, getting down and walking, eight townsfolk, the odd jobs loop, synthesized sound, saves, journal, quality tiers with automatic step down, perf HUD and benchmark route, GitHub Pages deploy.

## Definition of finished for beta 0.3
- Horse is the GLTF with its run animation, speed driven.
- Ground has textured grass/rock/dirt blending with normal maps.
- At least two GLTF tree types instanced across the valley.
- 60fps on Andrew's phone.
- A side by side screenshot against prototype/index.html shows the difference without explanation.

## Decisions made (Nov 4 2026)
Andrew asked for no open decisions and a finished game by the end of November, so these were settled in the build:
- Art: no external pack. Trees, rocks, buildings, tents and people are low poly models built in code (src/models.js, src/character.js). Nothing to license or download, and it loads instantly.
- Day length: 10 minutes, so a job fits in daylight.
- Collision: in 0.3.
- Second loop: odd jobs for the townsfolk, ending in a $60 homestead deed. It fits the no-pressure tone and needed no combat systems.
- Platform: PWA only at launch. An App Store shell can come later.
- Code license: all rights reserved, public repo.
- Post processing: bloom and a warm grade on High only; no SSAO, which a phone can't afford. The sky and fog are pre-inverted through the tone curve on that path so High looks like Medium plus glow, not a different grade.
- The first in-game day is always clear weather.

## Known gaps
- Horse.glb has only a gallop clip. Standing holds the best frame (all hooves down); walking plays the gallop slowed. A walk and idle need a new horse model or clips.
- No iPhone measurements yet. The graphics budget in SCHEDULE.md is still empty.
- Textures are JPEG, not KTX2.
