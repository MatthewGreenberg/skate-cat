# Intro scene modules

CRT TV room intro: layout, lighting, procedural room, and the interactive title screen on the TV mesh.

| File | Role |
|------|------|
| `IntroScene.jsx` | Main scene: GLTF loading, Leva controls, shadow/light math, `useFrame` animation, composes the pieces below. |
| `IntroLighting.jsx` | Scene background, fog, and all lights (TV glow, hero/sweep spots, lamp, fills). |
| `IntroRoom.jsx` | Floor, rug, contact-shadow quads, walls, ceiling, floor lamp, framed art. |
| `TvScreen.jsx` | Curved screen mesh + canvas texture + CRT shader; pointer/keyboard start. Hovered pill state is piped via `hoveredAction` — `'tutorial'` lights up the HOW TO PLAY button. |
| `tvScreenCanvas.js` | 2D canvas drawing for the attract-mode UI (title, HUD, EQ, button). Title + summary screens render two corner pill buttons side-by-side at bottom — HIGH SCORES (left, cyan) and HOW TO PLAY (right, orange, fires the `'tutorial'` action to launch the demo overlay). |
| `crtShaders.js` | GLSL for barrel distortion, RGB split, scanlines, grille, roll, vignette, noise. |
| `curvedScreenGeometry.js` | Bowed `PlaneGeometry` so the UI reads as a curved panel. |
| `prepareAsset.js` | Clones GLTF scenes, enables shadows, finds TV screen plane for UI placement. |
| `textures.js` | Procedural floor/wall canvas textures (seeded RNG). |
| `constants.js` | Room colors and default Leva values for TV, cat, UI, and CRT. |

The app imports the scene via `src/components/IntroScene.jsx`, which re-exports `introScene/IntroScene.jsx`.
