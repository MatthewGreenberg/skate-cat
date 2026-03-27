# Intro → Game Transition: Current State & Issues

## What We Built

### Ping-Pong Diffusion Dissolve (TransitionEffect.jsx)
Two-pass postprocessing effect using ping-pong render targets:
1. **Diffusion pass** (half-res, HalfFloat): evolves a reveal mask each frame via 5-tap neighbor sampling. Injects a raw radial threshold each frame, then diffuses it so the reveal edge spreads organically (ink-on-paper feel). Biases toward max-neighbor to create tendrils.
2. **Composite pass** (full-res): reads the diffused mask to blend between a frozen snapshot (intro) and the live inputBuffer (game). Adds a glow ring at the transition edge. Also applies a UV dolly (zoom toward center) on the snapshot texture.

### Camera Dolly (CameraRig.jsx)
Four-phase camera system:
- **Phase A** (idle): snap to intro position
- **Phase B** (pre-capture, `!started && isTransitioning`): dolly toward `introCamZ - 0.6`
- **Phase C** (dissolve, `started && isTransitioning`): progress-driven interpolation from captured camera position → game position using quadratic ease-out
- **Phase D** (game): normal game camera with zoom/shake

### Flow (App.jsx)
1. Press start → `isTransitioning=true`, `shouldCaptureRef=true`
2. SnapshotCapture captures next frame → `handleSceneCaptured`
3. `handleSceneCaptured`: resets progress to 0, sets snapshot texture, calls `finishStart()` (sets `hasStartedGame=true`, game scene mounts)
4. TransitionEffect mounts (`isTransitioning && snapshotTexture`)
5. TransitionAnimator increments `transitionProgressRef` from 0→1 over 0.95s
6. `handleTransitionComplete`: sets `isTransitioning=false`, starts music/countdown

Music/countdown is deferred until after the transition completes.

---

## Current Issue: Dolly Freeze

**What the user sees:** Press start → brief camera ease on intro scene → transition starts → dolly freezes → dolly resumes after a beat

### Root Cause Analysis

The freeze happens at the snapshot capture boundary. Here's the exact frame-by-frame:

**Frames 0-1 (handleStart):**
- `isTransitioning=true`, `shouldCaptureRef=true`
- Phase B: camera starts lerping toward `introCamZ - 0.6` at speed 2.0
- But capture happens on the very next render frame (no delay), so Phase B only runs for ~1-2 frames
- Camera barely moves (0.016 * 2.0 * 0.6 = 0.019 units per frame)

**Frame 2 (capture):**
- SnapshotCapture grabs the frame → `handleSceneCaptured` fires
- `setSnapshotTexture(...)`, `setHasStartedGame(true)` — batched React state updates
- `transitionProgressRef.current = 0`

**Frame 3 (React re-renders):**
- TransitionEffect mounts, returns `<primitive object={pass} />`
- useEffect hasn't run yet → `pass.progressRef = null`, `pass.snapshotTexture = null`
- Pass renders with `progress = this.progressRef?.current ?? 0`
- Guard `!this.snapshotTexture` catches this → passes through inputBuffer (game scene) for 1 frame
- CameraRig Phase C: `started && isTransitioning` → reads `transitionProgressRef.current` which is 0 → camera sits at captured position

**Frame 4 (useEffects run):**
- `pass.progressRef` and `pass.snapshotTexture` now set
- Progress ≈ 0.017 (one frame of TransitionAnimator)
- Snapshot finally visible, UV dolly at `dollyT = 0.034` → zoom = 0.034 * 0.4 = 1.3% — **imperceptible**
- CameraRig Phase C: `transitionEase(0.017) = 0.034` → camera moved 0.15 units — **barely visible**

**Frames 5-15 (~200ms):**
- UV dolly gradually becomes visible (reaches ~6% zoom by frame 10)
- Camera slowly accelerates toward game position
- **This is the "freeze" the user perceives** — 200ms of near-zero visual movement after the snapshot appears

### Why Previous Fixes Didn't Work

1. **300ms setTimeout delay**: Gave a visible live dolly on the intro scene, but the transition from "live parallax dolly" to "frozen 2D UV zoom" was jarring — the scene perceptibly froze when the snapshot captured.

2. **Synchronous ref setting during render**: Broke the component — Three.js pass properties set during React render don't integrate properly with the EffectComposer's pass lifecycle.

3. **Higher dollyAmount (0.4)**: Helps later in the transition but doesn't fix the first 200ms because `easeOut(0.017) * 0.4` is still < 2% zoom.

4. **Ease-out curve**: Better than ease-in (which had zero velocity at start), but the absolute values at small progress are still tiny.

5. **Delayed capture (250ms) + white flash + UV dolly offset + faster Phase B** (Options A+E combined): Added `captureDelay` setTimeout in `handleStart`, exponential flash decay in composite shader (`exp(-progress * 25) * flashStrength`), dolly start offset (`uDollyStart=0.06`), boosted Phase B to speed 5.0 / distance 1.5, and switched to `useLayoutEffect` to eliminate 1-frame game flash. **Still freezes.** The shader-level fixes address the visual "dead zone" in the composite pass, but the freeze persists — strongly suggesting the root cause is not in the shader math or camera timing.

---

## Deeper Analysis: Why the Freeze Survives Shader Fixes

The shader-level fixes (dolly offset, flash, faster ease) treat the symptom (near-zero visual change at small progress values). But the freeze persists, which points to causes that no amount of shader tuning can fix:

### Hypothesis 1: Frame drops from game component mounting

When `handleSceneCaptured` calls `finishStart()` → `setHasStartedGame(true)`, several components mount for the first time in a single React commit:

```jsx
{hasStartedGame && (
  <>
    <Obstacles ... />       // Likely heaviest — meshes, collision
    <SpeedLines />
    <KickflipSparks />
    <DustTrail />
    <AmbientParticles />
  </>
)}
```

Each creates geometries, materials, and potentially triggers GPU uploads. This synchronous work during the React render phase can easily exceed 16ms, causing dropped frames. The user sees a hitch/stutter regardless of what the shader is doing.

Note: `SkateCat` is already pre-mounted (just `visible={false}`), so it's not part of this spike. But Obstacles, particle systems, and effects are all cold-mounted at transition time.

**How to verify:** Add `performance.mark()`/`performance.measure()` around the `hasStartedGame` state transition, or temporarily comment out the conditional game components to see if the freeze disappears.

### Hypothesis 2: Animated intro elements freeze in snapshot

IntroScene has several animated elements:
- Accent light flicker (sine wave, `IntroScene.jsx` ~line 250)
- TV screen canvas with flickering/dust particles (redrawn every frame)
- Sparkles component (animated position/opacity)

When these freeze in the snapshot, the human visual system detects the loss of micro-motion even subconsciously. A flash can mask a single frame boundary, but the viewer still notices "the scene went dead" over the next 100-200ms as the flash fades. This is especially noticeable with the TV screen flicker, which has high temporal contrast.

### Hypothesis 3: The live→frozen discontinuity is fundamentally unmaskable

The flash approach (Option E) assumes a brief distraction can bridge the gap between live 3D parallax and frozen 2D UV zoom. But the human visual system is extremely good at detecting when depth/parallax information disappears. The UV dolly is a pure 2D zoom — it lacks:
- Parallax between foreground/background elements
- Perspective foreshortening changes
- Occlusion changes as viewpoint shifts

No matter how aggressive the dolly curve or how bright the flash, the scene "feels" frozen because it IS frozen. The brain picks up on it within 2-3 frames.

---

## Recommended Next Steps

### Option D (Strongest): Portal rendering — keep intro alive during dissolve

Keep the IntroScene alive in a `createPortal` / `useFBO` render target during the transition. The dissolve blends between two LIVE renders (intro with continuing dolly + game scene). The intro scene is only unmounted after the transition completes.

**Why this fixes the core issue:** There is no frozen snapshot. Both scenes are live. The camera continues its real 3D dolly through the intro scene during the entire dissolve. Parallax, light flicker, particles — all continue animating.

**Implementation sketch:**
1. When transition starts, render IntroScene into a secondary FBO via `useFBO` or `createPortal`
2. The dissolve composite reads from the FBO (live intro) instead of a static snapshot
3. IntroScene stays mounted during the transition (unmount on complete)
4. Phase B camera drives real parallax throughout
5. No snapshot capture needed — remove SnapshotCapturePass entirely

**Trade-off:** Renders two full scenes simultaneously for ~1 second. Profile to confirm this stays above 60fps.

### Option F (Complementary): Pre-mount game components

Regardless of which dissolve approach is used, the game component mounting spike (Hypothesis 1) should be addressed separately:

1. Pre-mount `Obstacles`, `SpeedLines`, `KickflipSparks`, `DustTrail`, `AmbientParticles` with `visible={false}` (same pattern as SkateCat)
2. Flip visibility instead of conditional rendering
3. This eliminates the CPU/GC spike at transition time

### Option G (Simpler alternative): Deferred game mount + aggressive UV dolly

If Option D is too complex, decouple the game mount from the snapshot capture:
1. Capture the snapshot and start the dissolve immediately (no delay needed)
2. Delay `finishStart()` / `setHasStartedGame(true)` until progress > 0.15 (~140ms into transition)
3. Use a very front-loaded dolly curve: `pow(progress, 0.3)` capped at `dollyAmount`
4. The game scene mounts mid-transition when the diffusion mask has already revealed a large enough area that the mounting hitch is hidden behind the dissolve

This avoids the complexity of Option D while hiding the mount spike behind visual activity.

---

## Current File States

### TransitionEffect.jsx
- Two-pass ping-pong diffusion + composite
- UV dolly with ease-out curve and `uDollyStart` offset (0.06)
- `uFlashStrength` (0.6): additive white flash, `exp(-progress * 25)`
- Guard for null snapshotTexture (passes through inputBuffer at progress=1)
- `useLayoutEffect` for setting pass refs (eliminates 1-frame gap)
- Leva-synced: `dollyStart`, `flashStrength`

### CameraRig.jsx
- Four-phase system with `transitionProgressRef` prop
- Phase C: quadratic ease-out interpolation from captured pos → game pos
- Phase B: targets `introCamZ - 1.5` at lerp speed 5.0

### App.jsx
- Delayed capture via `captureDelay` setTimeout (250ms, Leva-tunable)
- `captureDelayTimerRef` with cleanup in `handleReturnToIntro` and unmount effect
- `finishStart` no longer calls `startMusicPlayback`
- `handleTransitionComplete` starts music via `pendingStartRef` signal
- Leva controls: `diffuseSpread` (0.35), `dollyAmount` (0.4), `dollyStart` (0.06), `flashStrength` (0.6), `captureDelay` (250ms)
