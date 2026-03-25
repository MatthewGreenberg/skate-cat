# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is currently not compatible with SWC. See [this issue](https://github.com/vitejs/vite-plugin-react/issues/428) for tracking the progress.

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Track Analysis

An offline `librosa` analyzer for the main song lives at [scripts/analyze_track.py](scripts/analyze_track.py).

- Install Python deps: `python3 -m pip install -r scripts/requirements-librosa.txt`
- Generate sidecar JSON: `python3 scripts/analyze_track.py public/skate-cat-2.mp3 public/skate-cat-2.analysis.json --audio-public-path /skate-cat-2.mp3 --bpm 170 --phase-offset-seconds -0.068`
- Schema and integration notes: [docs/audio-analysis-schema.md](docs/audio-analysis-schema.md)
