# Shaders

GLSL shader strings exported as JS template literals (no bundler plugin needed).

## Files
- **toonShader.js** — Cat/character toon shading: stepped NdotL lighting, specular highlights, rim glow, eye-blink UV masking. Key uniforms: `uLightDirection`, `uSteps`, `uBlinkAmount`, `uLeftEyeCenter`/`uRightEyeCenter`.
- **outlineShader.js** — Black outline effect: pushes vertices along normals on BackSide. Uniform: `uThickness`.
- **logToonShader.js** — Simplified toon shader for log obstacles (no texture map, no blink). Same lighting model as toonShader but single-color.

Material factories that use these shaders are in `src/lib/toonMaterials.js`.
