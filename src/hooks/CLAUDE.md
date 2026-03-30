# Hooks

Custom React hooks extracted from SkateCat.jsx.

## Files

### useCatAnimation.js (~500 lines)
The core animation state machine for the cat character. Owns all animation state refs and drives the main `useFrame` loop.

**State machine:**
```
idle -> jumping -> landing -> idle
idle -> grinding (via grindEntry) -> grindExit -> landing -> idle
idle -> spinning -> idle
any  -> death (hop off -> walk away)
```

**Overlays** (applied on top of base state):
- Powerslide: lean amount 0-1, active during grind
- Squash-and-stretch: bouncy spring on landing
- Board landing recoil: pitch/roll bounce on landing
- Cat spin: full 360 rotation in 0.29s

Also handles keyboard input (ArrowUp = jump, ArrowLeft/Down = spin trick).

### useToonShaderSync.js (~100 lines)
Per-frame sync of toon shader uniforms (light direction, rim, steps, etc.) and blink animation. Lerps between intro and gameplay shader values. Skips when `useOriginalMaterials` is true.
