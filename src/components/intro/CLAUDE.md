# Intro Scene

The TV-room intro scene shown before gameplay starts.

## Files
- **IntroScene.jsx** — Room layout: TV model, sofa chair, lighting, sparkles, floating "PRESS START" text. Uses Leva controls for positioning everything.
- **TvScreen.jsx** — Canvas-based TV screen rendering: sunset gradient, scanlines, title text, interactive start button. Draws to a CanvasTexture each frame. Also handles keyboard (Enter/Space) to start.
- **index.js** — Barrel export.

## How it works
1. `IntroScene` loads GLTF models (TV, chair) and positions them in the scene
2. `TvScreen` renders the animated "SKATE CAT" title screen to a canvas texture
3. Clicking the screen or pressing Enter/Space calls `onStart` to trigger the intro→game transition
4. During transition, `PostEffects` renders a second copy of the intro scene into a portal for the circular reveal effect
