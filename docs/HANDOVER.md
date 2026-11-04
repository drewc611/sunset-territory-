# Handover, Nov 4 2026

## Done
- Beta 0.1 and 0.2 built as a single HTML artifact in chat. 0.2 added a shader sky with sun and stars, clouds, ACES tone mapping, 200 segment faceted terrain, a lake, 4,000 swaying grass blades, dust, lit windows at night, and a jointed horse rig.
- Verdict from Andrew: still looks like a toy. Agreed cause: primitive geometry and no textures. Lighting is no longer the bottleneck.
- Assets pulled and license checked: three.js Horse.glb (animated, MIT), grass and water textures (MIT), procedural rock texture.
- Horse.glb inspected: 796 verts, vertex colors, one clip "horse_A_", bounds y 0.8 to 183 units, head at +Z.

## Not done
- Nothing is ported into src/ yet. The Vite scaffold boots a scene and loads the animated horse on a textured plane, nothing more.
- No collision, dismount, NPCs, sound, or saves.

## Definition of finished for beta 0.3
- Horse is the GLTF with its run animation, speed driven.
- Ground has textured grass/rock/dirt blending with normal maps.
- At least two GLTF tree types instanced across the valley.
- 60fps on Andrew's phone.
- A side by side screenshot against prototype/index.html shows the difference without explanation.

## Open decisions for Andrew
- Which CC0 tree and building pack (Kenney Nature Kit is the safe default).
- Keep the 240 second day or slow it to 10 minutes.
- Collision in 0.3 or 0.4.
