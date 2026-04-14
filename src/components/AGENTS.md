# Components

## Core Game Components
- **SkateCat.jsx** — Cat character: GLTF model loading, toon material setup, animation state machine (jump/grind/spin/death/powerslide), keyboard input, rhythm scoring integration. The main `useFrame` has all pose/movement logic.
- **Obstacles.jsx** — Beat-aligned obstacle spawning, procedural grind rail geometry, log collision detection, scoring, difficulty scaling. Pure logic extracted to `src/lib/`.
- **CameraRig.jsx** — Camera positioning for intro/game/transition with FOV changes and screen shake.

## Scene Composition
- **GameWorld.jsx** — Assembles the game scene: Ground, Background, Sky, SkateCat, Obstacles, particles, effects.
- **DayNightController.jsx** — Animates lighting, fog, and hemisphere colors through a day/night cycle.
- **PostEffects.jsx** — Post-processing: bloom, brightness/contrast, hue/saturation, transition portal rendering.

## Visual Effects
- **KickflipSparks.jsx** — Instanced particle system for jump/land/grind effects.
- **DustTrail.jsx** — Continuous dust particles behind skateboard.
- **SpeedLines.jsx** — Shader-based speed line overlay.
- **AmbientParticles.jsx** — Floating firefly-like particles.
- **TransitionEffect.jsx** — Custom post-processing pass for circular reveal transition.

## Environment
- **Ground.jsx** — Scrolling road with shader-based gradient.
- **Background.jsx** — Parallax layered background with day/night colors.
- **Sky.jsx** — Instanced cloud rendering with night opacity.
- **Grass.jsx** — Instanced grass blades with wind animation.
- **Wildflowers.jsx** — Random flower instances on ground segments.
- **Pebbles.jsx** — Ground detail pebbles.

## UI Overlays
- **GameHud.jsx** — Score, beat dots, timing feedback.
- **GameOverScreen.jsx** — End game modal with animated score counter.
- **TimingDebugHud.jsx** — Dev: live timing offset visualization.
- **ObstacleSpacingDebugHud.jsx** — Dev: obstacle spacing conflict debug.

## Intro
- **IntroScene.jsx** — CRT TV room with start button (monolithic, old version).
- **intro/IntroScene.jsx** — Refactored intro scene (imports TvScreen).
- **intro/TvScreen.jsx** — TV screen canvas rendering + interaction.

## State Flow
Most components read/write `gameState` (from `src/store.js`) directly via refs:
- **SkateCat** writes: `jumping`, `catHeight`, `activeGrind`, `grindSpark`, `screenShake`, `speed`
- **Obstacles** writes: `score`, `obstacleTargets`, `obstacleDebug`, `speedBoostActive`, `speedLinesOn`
- **GameWorld/DayNightController** writes: `timeOfDay`, `nightContrast`
- **CameraRig** reads: `screenShake`
- **GameHud** reads: `score`, `streak`, `lastScoringEvent`
