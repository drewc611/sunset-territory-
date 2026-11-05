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
- Second job chain: four landmark jobs (Danner Mine, Sandstone Arch, Lookout Tower at night, Old Mission bell), unlocked by finishing jobs in the first chain. They pay on top of the deed money; there's nothing yet to spend the extra on.

## The territory
- 20 km x 20 km. Terrain streams in 256 m chunks near the player and 1 km chunks out to the fog, built in a web worker (src/terrain-worker.js). Height and biome rules live in src/world.js and src/surface.js and are shared by the worker, collision and the minimap.
- No floating origin yet: 32 bit positions at 10 km are good to about 1 mm, which is fine for terrain and riding. Revisit if shadows or the camera shimmer at the edges.
- The horse rework (jointed horse with walk, trot and gallop) is parked on claude/horse-gaits; it needs a side by side review before it replaces Horse.glb.

- Generated work: 90 residents across the 54 settlements. Anyone whose written jobs are done, valley folk included, offers deliveries to someone 0.8 to 6 km away in another settlement, paid by distance (fragile loads pay more and fail at a gallop). The work never runs out; money past the $60 deed has nothing to buy yet.

## Known gaps
- Horse.glb has only a gallop clip. Standing holds the best frame (all hooves down); walking plays the gallop slowed. A walk and idle need a new horse model or clips.
- No iPhone measurements yet. The graphics budget in SCHEDULE.md is still empty.
- Textures are JPEG, not KTX2.
