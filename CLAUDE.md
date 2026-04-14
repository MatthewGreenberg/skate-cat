# Skate Cat

3D skateboarding cat rhythm game built with React Three Fiber.

## Stack
- React 19, Vite, Three.js
- @react-three/fiber + @react-three/drei for 3D
- Leva for dev tuning controls
- Custom toon shading pipeline (see `src/shaders/`)
- Supabase-backed global leaderboard. The browser never talks to Supabase directly — it hits Vercel serverless functions in `/api/` which use the `SUPABASE_SERVICE_ROLE_KEY` server-side. Table schema in `supabase/leaderboard.sql`. Env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) must also be set in the Vercel project dashboard for deployments.

## Commands
- `npm run dev` — Vite only (no `/api` routes). Use for frontend-only iteration.
- `vercel dev` — Vite + `/api/*.js` serverless functions together. Use this when touching leaderboard code.
- `npx eslint src/` — lint (don't run the server to validate changes)

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
api/           — Vercel serverless functions (leaderboard.js, submit-score.js)
supabase/      — SQL migrations for the leaderboard table
src/
  shaders/     — GLSL shader strings (toon, outline, log toon)
  hooks/       — Custom React hooks (planned)
  lib/         — Pure logic modules (obstacle patterns, lane logic, track analysis, materials)
  components/  — React/R3F components
    intro/     — Intro scene (WIP refactoring)
public/
  models/      — GLB/GLTF models
    cat/         — Player cat model + textures (dingus_* files)
    obstacles/   — In-game obstacle models (large_tree_log)
    intro/       — Intro scene props (crt_tv, office_chair, etc.)
    skateboard.glb — Gameplay skateboard (intro has its own in intro/)
  textures/    — Standalone textures (wood/, poster.webp)
  audio/
    music/       — Songs + analysis JSON sidecars
    sfx/         — Jump/die sound effects
  basis/       — KTX2 transcoder WASM (path hardcoded in ktx2Loader.js)
```

### Toon Shading Pipeline
All game-world meshes use custom `ShaderMaterial` with stepped NdotL lighting, rim highlights, and eye-blink UV masking. Shaders live in `src/shaders/`, material factories in `src/lib/toonMaterials.js`.

### Leva Controls
Dev tuning panels are everywhere — shader params, camera, post-processing, timing. `useControls` calls stay with the component that uses them. Don't centralize.
