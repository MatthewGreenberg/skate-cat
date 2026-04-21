# Components

## Core Game Components
- **SkateCat.jsx** — Cat character: GLTF model loading, toon material setup, animation state machine (jump/grind/spin/death/powerslide), keyboard input, rhythm scoring integration. The main `useFrame` has all pose/movement logic.
- **Obstacles.jsx** — Beat-aligned obstacle spawning, procedural grind rail geometry, log collision detection, scoring, difficulty scaling. Pure logic extracted to `src/lib/`.
- **CameraRig.jsx** — Camera positioning for intro/game/transition with FOV changes and screen shake. `getResponsiveMix` returns `{ mix, mobileLandscapeMix }`; the mobile factor fires for narrow-tall landscape viewports (short side ≤ 500px) and adds extra back-off + FOV bump for intro/results/failed/leaderboard framing and the gameplay camera (Leva: Game → Mobile Landscape).

## Scene Composition
- **GameWorld.jsx** — Assembles the game scene: Ground, Background, SkateCat, Obstacles, particles, effects.
- **DayNightController.jsx** — Animates lighting, fog, and hemisphere colors through a day/night cycle.
- **PostEffects.jsx** — Post-processing: bloom, brightness/contrast, hue/saturation, transition portal rendering. Also runs a selective Depth-of-Field in the intro scene: `DepthOfFieldEffect` blurs the whole frame, then a custom `SharpOverlayPass` (defined in `introScene/sharpSelection.js`) re-renders any meshes registered via `registerSharpGroup` on top, keeping them crisp. Intro also gets god rays: `GodRaysEffect` uses the CRT screen mesh as the light source (published by `TvScreen.jsx` via `setGodRaysSource`); the effect lives after bloom and is gated on tier ≥ 2, non-Safari, and intro-visible. See `introScene/sharpSelection.js` for both the sharp-layer selection and the god-rays source ref.

## Visual Effects
- **KickflipSparks.jsx** — Instanced particle system for jump/land/grind effects.
- **DustTrail.jsx** — Continuous dust particles behind skateboard.
- **SpeedLines.jsx** — Shader-based speed line overlay.
- **AmbientParticles.jsx** — Floating firefly-like particles.
- **TransitionEffect.jsx** — Custom post-processing pass for circular reveal transition.
- **VhsGlitchEffect.jsx** — Custom post-processing `Effect` that plays a VHS-eject glitch during `PHASE_END_GLITCH` (failure death moment). Four beats over 700ms (`VHS_GLITCH_DURATION_SECONDS` in `PostEffects.jsx`): impact pop → tracking loss → rewind rips → CRT power-off pinch. Progress is computed inside `PostEffects` by watching `chromaticSpike` transition 0→1 (driven by `App.jsx` when phase enters `PHASE_END_GLITCH`); mounted after bloom/chromatic but before `TransitionEffect` so it acts on the live scene, not the captured frame. Replaces the previous lens-zoom + vignette-darken freeze treatment. Every shader magic number is a uniform with defaults in `DEFAULTS` and a leva control under the "VHS Glitch" tab (Timing / Judder / Wobble / Tear / RGB Split / Color-Scan / Static / Flash / Eject folders, all collapsed).

## Environment
- **Ground.jsx** — Scrolling road with shader-based gradient.
- **Background.jsx** — Parallax layered background with day/night colors, shader cloud streaks, and night stars.
- **Grass.jsx** — Instanced grass blades with wind animation.
- **Wildflowers.jsx** — Random flower instances on ground segments.
- **Pebbles.jsx** — Ground detail pebbles.

## UI Overlays
- **GameHud.jsx** — Score, beat dots, timing feedback.
- **DayCycleIndicator.jsx** — HUD disc showing day/night cycle progress. A big-faced sun fills the disc during day, crossfades to a crescent-moon face during night; the outer ring fills as `gameState.timeOfDay` advances. Between `NEW_CAT_WARNING_TIME_OF_DAY` and `DAY_RETURN_TIME_OF_DAY` the celestial face is replaced by a full cat face (ear twitches, tail sway, orange glow pulse) that fills the whole disc — the cat is hidden entirely once `extraCatCount >= MAX_EXTRA_CAT_COUNT`. A `NEW CAT!` chip pops below while the cat is active. Polls `gameState` via `requestAnimationFrame` since `timeOfDay` is mutated inside R3F's `useFrame`.
- **GameOverScreen.jsx** — End game modal with animated score counter. Restart via keyboard or tap/click.
- **RotationPrompt.jsx** — Full-screen overlay (z-index 1500) shown on touch devices in portrait. Pairs with `useOrientation` hook; when visible, `gameState.paused` is set and gameplay freezes.
- **TutorialOverlay.jsx** — First-time-player interactive tutorial (z-index 1300). Three steps (jump / grind / spin) that detect real keyboard or touch inputs matching the real game controls. Gated by `src/lib/tutorialStorage.js` localStorage flag; rendered only when `phase === PHASE_TUTORIAL`. Always-visible Skip button. On complete or skip, `App.jsx` marks localStorage and returns to `PHASE_INTRO`.
- High-score initials entry on touch is handled entirely by the TV canvas — there is no DOM overlay or keyboard. Players tap the up/down arrows above/below each of the three slots (rendered by `tvScreenCanvas.js` → `drawInitialsScreen`). See `TvScreen.jsx` (`handlePointerDown` / `handlePointerUp` / `handlePointerMove`) for the tight-feedback layer: first press dispatches immediately, hold past 320ms starts a 90ms auto-repeat, pointer-capture keeps the interaction alive during drag, `navigator.vibrate(8)` fires on each step, and the tapped arrow flashes (brighter fill, subtle scale-pop, cyan glow) via `initialsPressedAction` + `initialsPressProgress` threaded into the canvas draw. Hit targets are expanded by 36px above/below each slot in `getTvScreenActionAtPoint` so the arrow triangles themselves are tappable, not just the slot rectangle.
- **TimingDebugHud.jsx** — Dev: live timing offset visualization.
- **ObstacleSpacingDebugHud.jsx** — Dev: obstacle spacing conflict debug.

## Intro
- **IntroScene.jsx** — CRT TV room with start button (monolithic, old version).
- **intro/IntroScene.jsx** — Refactored intro scene (WIP, imports TvScreen).
- **intro/TvScreen.jsx** — TV screen rendering (not yet created).

## State Flow
Most components read/write `gameState` (from `src/store.js`) directly via refs:
- **SkateCat** writes: `jumping`, `catHeight`, `activeGrind`, `grindSpark`, `screenShake`, `speed`
- **Obstacles** writes: `score`, `obstacleTargets`, `obstacleDebug`, `speedBoostActive`, `speedLinesOn`
- **GameWorld/DayNightController** writes: `timeOfDay`, `nightContrast`
- **CameraRig** reads: `screenShake`
- **GameHud** reads: `score`, `streak`, `lastScoringEvent`
