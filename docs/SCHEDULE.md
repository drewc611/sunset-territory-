# Sunset Territory, phased development schedule

## Compressed plan to Nov 30 2026
Andrew moved the finish to the end of November. The phases below still define the gates; this is the order they run in.

- Nov 4, done: Pages deploy, perf HUD, benchmark route, home screen manifest, the port, textured terrain, props, collision, on foot, townsfolk, odd jobs, sound, saves, quality tiers.
- Nov 5 to 11: first iPhone numbers from `?bench`, fill in the graphics budget below, fix whatever the phone shows. Horse walk and idle. Tree impostors past 120 m. KTX2 textures.
- Nov 12 to 18: weather (overcast, rain), ambient life (birds, dust devils, campfire smoke), a second job chain, more landmarks. Done Nov 4.
- Nov 19 to 25: the Phase 4 checklist: 20 minute thermal run, accessibility pass, name trademark search, LICENSES.md audit.
- Nov 26 to 30: soft launch of the public link.

The territory (Andrew, Nov 4): 20 km x 20 km, 400 km², with the hand built valley at the center.
  a. Streamed terrain, biomes in the ground shader, player-centered minimap. Done Nov 4.
  b. Per chunk trees, rocks and grass by biome, and rivers. Done Nov 4.
  c. Zoomable full map with discovered regions. Done Nov 4.
  d. Procedural towns, ranches and camps on dirt roads, with townsfolk and generated jobs. Done Nov 4.
  e. Draw distance and chunk counts per quality tier (started in a), checked with ?bench.

Dropped for November: closed beta with telemetry, commissioned music (the game ships with its synthesized score), the App Store shell.

Studio style phases, solo dev plus Claude Code. Each phase has a goal, deliverables, an exit gate, and a kill switch. No phase starts until the previous gate passes on Andrew's iPhone, not in a desktop browser. Dates are elapsed weeks from the day src/ port starts.

Hard targets for the whole project:
- Runs in Safari on Andrew's iPhone at a steady 60fps (16.6ms frame budget) with the phone warm, not just for the first minute.
- Looks like a painted frontier at arm's length on a phone screen. Stylized and dense, not photoreal. Detail spent where the camera looks: horse, rider, ground within 30m, sky.
- Loads to riding in under 8 seconds on cellular.
- Zero third party IP. Original name, world, characters, music. Assets CC0, MIT, or made here, logged in public/assets/LICENSES.md.

## Phase 0, Pipeline (week 1)
Goal: make the iPhone the primary test device from day one.
Deliverables:
- Vite dev server reachable on the phone over Wi-Fi (npm run dev -- --host, HTTPS via vite-plugin-mkcert so sensors and PWA features work).
- Safari Web Inspector attached from the Mac for GPU and timeline profiling.
- Every PR auto deploys a preview URL (Cloudflare Pages or Vercel) so a build can be opened on the phone by scanning a QR code in the PR.
- Add to Home Screen manifest so it runs full screen without browser chrome.
- A perf HUD toggle in game: fps, frame ms, draw calls, triangles, texture memory, JS heap.
- Asset pipeline: gltf-transform for mesh compression (Draco or Meshopt), KTX2 Basis texture compression, 2048 max texture size, mipmaps on.
Exit gate: a PR preview opens on the phone full screen and the perf HUD reads live numbers.
Kill switch: none, this phase is mandatory.

## Phase 1, Port and vertical slice (weeks 2 to 4)
Goal: one slice of the final game that proves the look and the feel on the phone.
Deliverables:
- Prototype riding, camera, terrain height, day/night, HUD ported to src/ modules.
- Horse.glb with speed driven run cycle, idle, and a turn lean. Rider rig parented to the horse.
- Textured terrain shader: grass, dirt, rock blended by slope and height, normal maps, triplanar rock, macro variation so tiling is invisible at 30m.
- One town rebuilt with GLTF buildings, one camp, the lake with animated normals and fresnel.
- Two tree types and three rock types instanced with LOD (full, low, impostor billboard).
- Touch controls finalized: virtual stick, gallop, camera drag on the right half of the screen.
Exit gate: 60fps on the iPhone riding through the town at gallop with the perf HUD under budget (set budgets at the end of Phase 0 and write them here). A screenshot that Andrew would post without explanation.
Kill switch: if the slice can't hold 45fps after a week of optimization, drop the real time shadows and move to baked lighting before going further.

## Phase 2, Production alpha (weeks 5 to 10)
Goal: the whole valley at slice quality, all systems in, content incomplete.
Milestones every two weeks, each one a tagged build on the preview host:
- A1 (week 6): full map populated via a placement tool (density maps per biome), collision with buildings, trees, rocks, and water edge. Dismount and walk.
- A2 (week 8): NPCs in towns with idle animations and a look at reaction, ambient life (birds, dust devils, campfire smoke), weather states (clear, overcast, rain), sound bed (wind, hooves, fire, town ambience).
- A3 (week 10): second loop chosen by Andrew (bounty gunfights, story missions, or hunting and camp) implemented to playable, saves to localStorage, settings screen with a quality tier (Low, Medium, High) auto picked from device GPU.
Exit gate: 30 minutes of play on the phone without a crash, memory flat (no leak), 60fps on High for the iPhone, 60fps on Medium for a phone two generations older.
Kill switch: if a system blows the frame budget for two milestones running, it ships on Low tier only or gets cut; the schedule does not slip for it.

## Phase 3, Beta, content complete (weeks 11 to 14)
Goal: everything that will be in 1.0 is in, nothing new added after this.
Deliverables:
- All towns, camps, and landmarks named and dressed. Discovery journal.
- Original music loop per region and a title theme (commissioned or generated under a license that allows commercial use, logged).
- Onboarding: first two minutes teach ride, gallop, camera, and discovery with no text walls.
- Closed beta link to 10 to 20 testers on iPhone and Android, feedback form, crash and perf telemetry (fps histogram per device model).
Exit gate: beta feedback shows no blocker bugs, median fps on iPhone 58 or better, 80 percent of testers reach the second town unprompted.
Kill switch: if testers can't find the second town, fix onboarding before polish, do not add content.

## Phase 4, Polish and certification (weeks 15 to 16)
Goal: ship quality. The studio term is cert; here it is a checklist Claude Code runs on every build.
- Performance lock: no PR merges that raise frame time more than 0.5ms on the reference device.
- Thermal test: 20 minutes continuous, frame time graph flat.
- Visual polish pass: color grade per time of day, cloud shadows, horse dust and water splashes, wind on grass and cloth, cheap bloom on High only.
- Accessibility: invert stick, larger controls, reduced motion respects the OS setting, color safe minimap.
- Legal: name trademark search, LICENSES.md audit, privacy note for telemetry.
Exit gate: checklist green on three consecutive builds.

## Phase 5, Soft launch (weeks 17 to 18)
Goal: real users, small number, no marketing.
- Public PWA link, Reddit and Discord western and web game communities, 500 player target.
- Daily telemetry review, hot fix cadence of one build per day max.
Exit gate: day 1 retention and session length agreed as good enough by Andrew, crash free rate 99 percent.
Kill switch: if retention is bad and the cause is the core loop, go back to Phase 2 A3 and change the loop, not the art.

## Phase 6, Launch and live (week 19 onward)
- Launch post, trailer cut from in game capture, store listing if wrapped as a native shell (Capacitor) for the App Store, which needs a separate cert pass against Apple's review guidelines.
- Monthly content drops: one new region or loop per month, each run through Phases 3 to 4 in miniature.

## iPhone test protocol, every PR
1. Open the preview URL on the phone from the home screen icon.
2. Ride the fixed benchmark route (saved in src/debug/benchmark.js): camp to town at gallop, 90 seconds.
3. Record perf HUD min, median, and p95 frame ms, plus texture memory.
4. Paste the numbers and one screenshot into the PR. A PR without numbers does not merge.

## Graphics budget for the iPhone (fill in at end of Phase 0 from measured numbers)
- Frame time ceiling:
- Draw calls per frame:
- Triangles per frame:
- Texture memory:
- Shadow map size and cascade count:
- Post effects allowed on High:

## Decisions Andrew owes before Phase 1
1. Which second loop ships in A3 (bounty gunfights, story missions, hunting and camp).
2. PWA only, or App Store shell at launch.
3. Art pack: Kenney Nature Kit as the base, or commission a custom low poly set for a signature look.
