# Lib — Pure Logic Modules

Non-React modules with no component/hook dependencies. Safe to test or import anywhere.

## Files
- **obstaclePatterns.js** — Pattern/placement libraries, weighted random selection, difficulty curves, analysis-driven multipliers. All the "what obstacles to spawn" logic.
- **obstacleLaneLogic.js** — Lane positions, jitter, grind rail geometry helpers, beat-to-distance conversion, lane window overlap detection, debug entry building.
- **trackAnalysis.js** — Parses audio analysis JSON into measure-level lookups (accent strengths, band energies, density). Used by obstacle scheduling to align patterns with music.
- **toonMaterials.js** — Factory functions for toon/outline/log ShaderMaterials and contact shadow textures. Imports shaders from `src/shaders/`.
- **postProcessing.js** — Post-processing constants (bloom, contrast, hue/saturation defaults) and interpolation helpers.
