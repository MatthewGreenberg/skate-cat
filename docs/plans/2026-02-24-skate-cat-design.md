# Skate Cat — Endless Runner Visual Diorama

## Overview
Akira-inspired endless runner featuring a cat on a skateboard, but with a happy cartoony aesthetic. Phase 1 focuses on visuals only — no gameplay mechanics yet.

## Visual Style
- Bright, cheerful, cartoony (inspired by MatatoGames cat-on-skateboard aesthetic)
- Daytime scene: blue sky gradient, warm tan road, green ground sides
- Cel/toon shading on models
- Glowing mesh trail behind skateboard (bright warm colors — the main Akira-inspired effect)
- Bloom post-processing for trail glow

## Camera
Low cinematic angle — close to ground, slightly behind and to the side of the cat. Emphasizes speed and shows off the cat.

## Architecture

### File Structure
```
src/
  App.jsx          — Canvas + scene composition + postprocessing
  components/
    Ground.jsx     — Object-pooled road segments (~8 segments)
    SkateCat.jsx   — Cat + skateboard GLB models, bobbing animation
    MeshTrail.jsx  — Ribbon trail geometry behind skateboard wheels
    Sky.jsx        — Gradient sky background
    CameraRig.jsx  — Low cinematic follow camera
```

### Dependencies
- @react-three/fiber
- @react-three/drei
- @react-three/postprocessing
- three

### Key Techniques

**Object Pooling (Ground):** ~8 ground segments tracked by Z position in a ref array. Each frame, segments that pass behind camera teleport to the front. Single `speed` ref drives all scrolling.

**Mesh Trail:** Store last ~80 world positions of a point behind the skateboard. Each frame shift array, write new position at index 0. Flat ribbon via BufferGeometry with positions updated per frame. Bright color + additive blending + bloom = glow.

**Models:** Cat (`public/cat/scene.gltf`) parented on top of skateboard (`public/skateboard.glb`). Gentle sine-wave bobbing on Y axis for life.

**Environment:** Flat ground plane (tan center path, green sides), gradient sky. Minimal — no props in phase 1.

## Future (Phase 2+)
- Left/right lane switching, obstacles, collectibles
- Rolling hills, bushes, trees
- Sound effects
- Score system
