# AGENTS.md

## Cursor Cloud specific instructions

**Skate Cat** is a client-side-only 3D endless runner game (React + Three.js + Vite). There is no backend, database, or external API.

### Commands

| Task | Command |
|------|---------|
| Dev server | `npm run dev` (serves on port 5173 with HMR) |
| Lint | `npm run lint` |
| Build | `npm run build` |
| Preview prod build | `npm run preview` |

### Notes

- The project uses `npm` (lockfile: `package-lock.json`).
- ESLint has 21 pre-existing errors (mostly `react-hooks/purity` and `react-hooks/immutability` from Three.js mutation patterns). These are expected and do not prevent the app from running.
- No automated test suite exists; testing is manual via the browser.
- The Leva debug panel is visible on the right side of the game UI; it exposes post-processing, camera, grass, road, and cat controls for tweaking.
- Game controls: **Space** to start, **Left/Right arrow keys** to dodge obstacles.
