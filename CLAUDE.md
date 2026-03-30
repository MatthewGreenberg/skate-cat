# Skate Cat

3D skateboarding cat rhythm game built with React Three Fiber.

## Stack
- React 19, Vite, Three.js
- @react-three/fiber + @react-three/drei for 3D
- Leva for dev tuning controls
- Custom toon shading pipeline (see `src/shaders/`)

## Commands
- `npm run dev` — start dev server
- `npx eslint src/` — lint (don't run server to validate changes)

## Architecture

### State Management
`src/store.js` uses mutable refs (`gameState`) instead of React state for 60fps frame loop performance. Components read/write `gameState.speed.current`, `gameState.score`, etc. directly. This is intentional — don't refactor to Zustand/context.

### Scene Flow
1. **Intro**: CRT TV room with cat model (`IntroScene`). Player presses start.
2. **Transition**: Circular reveal effect (`TransitionEffect` + `PostEffects`) blends intro → game.
3. **Game**: Cat skateboards, jumps logs, grinds rails to music beats. Scoring is timing-based.
4. **Game Over**: Score screen with restart option.

### Key Files
- `src/App.jsx` — Top-level orchestrator: state, callbacks, Canvas setup
- `src/components/SkateCat.jsx` — Cat character: model, animations, input, physics
- `src/components/Obstacles.jsx` — Obstacle spawning, collision, grind rails
- `src/store.js` — Mutable game state refs
- `src/rhythm.js` — Beat timing, scoring windows
- `src/audioTransport.js` — Web Audio API music playback

### Directory Layout
```
src/
  shaders/     — GLSL shader strings (toon, outline, log toon)
  hooks/       — Custom React hooks (planned)
  lib/         — Pure logic modules (obstacle patterns, lane logic, track analysis, materials)
  components/  — React/R3F components
    intro/     — Intro scene (WIP refactoring)
```

### Toon Shading Pipeline
All game-world meshes use custom `ShaderMaterial` with stepped NdotL lighting, rim highlights, and eye-blink UV masking. Shaders live in `src/shaders/`, material factories in `src/lib/toonMaterials.js`.

### Leva Controls
Dev tuning panels are everywhere — shader params, camera, post-processing, timing. `useControls` calls stay with the component that uses them. Don't centralize.
