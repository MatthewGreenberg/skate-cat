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

## Environment
- **Ground.jsx** — Scrolling road with shader-based gradient.
- **Background.jsx** — Parallax layered background with day/night colors, shader cloud streaks, and night stars.
- **Grass.jsx** — Instanced grass blades with wind animation.
- **Wildflowers.jsx** — Random flower instances on ground segments.
- **Pebbles.jsx** — Ground detail pebbles.

## UI Overlays
- **GameHud.jsx** — Score, beat dots, timing feedback.
- **GameOverScreen.jsx** — End game modal with animated score counter. Restart via keyboard or tap/click.
- **RotationPrompt.jsx** — Full-screen overlay (z-index 1500) shown on touch devices in portrait. Pairs with `useOrientation` hook; when visible, `gameState.paused` is set and gameplay freezes.
- **TutorialOverlay.jsx** — First-time-player interactive tutorial (z-index 1300). Three steps (jump / grind / spin) that detect real keyboard or touch inputs matching the real game controls. Gated by `src/lib/tutorialStorage.js` localStorage flag; rendered only when `phase === PHASE_TUTORIAL`. Always-visible Skip button. On complete or skip, `App.jsx` marks localStorage and returns to `PHASE_INTRO`.
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
