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

- Dependencies (Nov 5): three 0.160.1 to 0.187.0 and Vite 6.4.5 to 8.3.5, done by hand on claude/three-upgrade instead of merging Dependabot #15, which was cut from an older main. The patched shaders compiled unchanged; screenshots at four views matched the old build to a mean of under 2/255 per pixel. The only change needed: three dropped PCFSoftShadowMap, so the renderer uses PCFShadowMap. Close #15 once this merges.

- Draw calls (Nov 5): the jointed horse and the player were 12 and 10 meshes, each drawn again for shadows. They're now one skinned mesh each (skinRig in models.js; joints are bones, so the gait code is unchanged). High went from 168 to 124 calls, Low from 81 to 59, at the start of the valley.
- KTX2 dropped (Nov 5): there are three 512 px textures, about 4 MB of GPU memory with mips. KTX2 would add a transcoder of roughly 500 KB and need 'wasm-unsafe-eval' in the CSP to save a few MB. Not worth it unless the phone runs short of memory.

- Fishing (Nov 5): the first thing to do out in the territory that isn't a job. On foot, facing the lake or a river with real water under the float, the action button casts. A bite comes after 5 to 17 s and you have 1.3 s to pull. Perch and bass in the lake; trout in mountain and wet rivers, catfish in dry lowland ones. The creel holds six, so a trip to a merchant is part of it, and fish sell for $1 to $8, below what deliveries pay per minute, so jobs stay the way to the deed. No combat, no hunting: wildlife stays something to watch.

- Generated work (Nov 5): settlers no longer only want deliveries. By role, about a quarter of offers are something else: ranchers send you after three strays 250 to 500 m out, marshals, miners and townswomen ask you to look in on a settlement 1.5 to 5 km away and report back, and merchants and townswomen want a fish over a set weight (0.5 to 2 lb), which ties fishing into the job loop. Each kind is picked again from the job's id after every job, so the same person varies. Across the 84 settlers the first offers came out 62 deliveries, 15 visits, 11 fish and 4 strays.

- Landmarks out in the territory (Nov 5): 27 generated landmarks, one chance per 2.5 km square, at least 700 m from any settlement, chosen by the land: hoodoo spires in canyon country, cairns and giant pines in the mountains, giant pines and lone graves in wet country, wagon wrecks and fort ruins on the dry flats and the grass. Each has a discovery stamp, a map mark, collision, and a line in the journal, which also counts how many you've found. Meshes stream within 2 km; trees keep clear of them.

- Photo mode (Nov 5): P, or the journal's Photo mode button on touch. The HUD hides and one leather strip runs along the bottom edge (per DESIGN.md: nothing in the center). Drag to orbit, drag up and down to tilt, scroll or + and − to move in. Save picture downloads a PNG of the frame, named by game day and time, taken right after the frame is drawn so the renderer doesn't need preserveDrawingBuffer. The CSS vignette isn't in the saved file. Meant for the soft launch: players can share pictures without a screenshot tool.

## The territory
- 20 km x 20 km. Terrain streams in 256 m chunks near the player and 1 km chunks out to the fog, built in a web worker (src/terrain-worker.js). Height and biome rules live in src/world.js and src/surface.js and are shared by the worker, collision and the minimap.
- No floating origin yet: 32 bit positions at 10 km are good to about 1 mm, which is fine for terrain and riding. Revisit if shadows or the camera shimmer at the edges.
- The horse is now a jointed low poly horse built in code (src/horse-rig.js) with a real walk, trot and gallop and a standing idle (tail swish, weight shift, grazing when you've got down). It matches the rest of the low poly art better than Horse.glb and fixes walking playing a slowed gallop. ?horse=glb brings the old model back for comparison.

- Generated work: 84 residents across the 43 settlements. Anyone whose written jobs are done, valley folk included, offers deliveries to someone 0.8 to 6 km away in another settlement, paid by distance (fragile loads pay more and fail at a gallop). The work never runs out.
- Money sinks: merchants sell a fine saddle ($40, gallop 25 to 30 m/s), a lantern ($15), a spyglass ($25, map reveals 2.5 km around you instead of 1.5) a bedroll ($12, sleep until dawn on foot at night) and a fishing rod ($5). Marshals and sheriffs sell stage tickets to towns you've found, $2 plus $1.50 a km, taking about an hour of game time per 12 km.

- Rivers: about 140 km of channel, 20 to 30 m of water across and 1.6 m deep at most, so every river is a ford; the horse wades and nothing swims. They fade out in high mountains and stop short of the valley. Settlement sites avoid river banks, which cut the count from 54 to 43.

- Far trees: beyond the full detail tree cells (up to 4 cells, about 580 m), a ring of one-cone or one-blob trees on a 16 m grid fills out to 6 cells on Medium and 8 on High (about 830 and 1,090 m), no shadows or collision. Low has none. Decided against billboards: low poly cones match the art and need no texture atlas.

- Wildlife: herds placed per 512 m cell (deer where it's wet, pronghorn where it's dry, about 4 in 10 cells outside mountains and canyons) plus a cattle herd at every ranch. Deer bolt inside 34 m and pronghorn inside 45 m when you're moving, run about 6 s, and settle where they stop; cattle only wander. Two draw calls per species. No hunting: the game's tone stays peaceful.

## Launch checklist (Nov 4)
- Name: a web search for "Sunset Territory" found no game with that title. The closest are Sunset Land (a frontier survival RPG on Steam, planned for Sep 2026) and Sunset Rangers (a western sandbox). This is not a legal trademark search; do one (USPTO and EUIPO) before anything commercial.
- Licenses: every file in public/ and every font is logged in public/assets/LICENSES.md: MIT (three.js horse and textures), SIL OFL 1.1 (Rye, Vollkorn), or made for this project (everything else, including all sound).
- Download: about 480 KB before the first frame (204 KB gzipped script, 5 KB worker, 4 KB HTML and CSS, 131 KB grass, 49 KB water, 10 KB rock, plus the Google Fonts files). On a 5 Mbit/s cellular link that's about 1 second, inside the 8 second target; generating the first terrain ring is the rest of the wait and needs measuring on the phone.

## Known gaps
- Headless tests: since the Nov 4 evening machine restart, Chromium's ANGLE SwiftShader flags stall WebGL after about 20 frames. The test scripts use chromium.launch() with default settings instead, which renders at about 1.6 fps here; that's a test machine limit, not a game measurement.
- No iPhone measurements yet. The graphics budget in SCHEDULE.md is still empty.
