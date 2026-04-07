# Safari Performance Optimization Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce Safari CPU usage on the intro screen from ~7.25 to under 1.5 (parity with Chrome's 0.6).

**Architecture:** Safari's 2D canvas renderer, WebGL texture uploads, and CSS compositor are dramatically slower than Chrome's. The intro screen compounds five independent per-frame costs: full canvas redraws, canvas texture GPU uploads, a separate RAF loop for fluid mask decay, backdrop-filter blur, and a fully-active post-processing stack. Each optimization targets one cost center with a targeted fix — no broad refactors needed.

**Tech Stack:** React Three Fiber, Three.js CanvasTexture, postprocessing, CSS

**Verification:** `npx eslint src/` after each task. Visual testing in Safari manually.

---

### Task 1: Dirty-flag the TV screen canvas to skip unchanged frames

The biggest Safari cost: `drawTvScreen()` redraws a 768px canvas with gradients, shadows, and text *every single frame*, then uploads to GPU. On the static title screen, nothing changes frame-to-frame unless the user hovers or a mode transition fires.

**Files:**
- Modify: `src/components/introScene/TvScreen.jsx` (useFrame hook, lines 195-297)

**Step 1: Add a dirty-tracking ref and skip redraws when clean**

In `TvScreen.jsx`, add a ref to track whether the canvas needs redrawing. The canvas is dirty when: screenMode changes, hover state changes, boot/summary elapsed advances (only in those modes), or bootVisualMix changes.

```jsx
// Add after line 190 (the channelFlipRef):
const prevDrawInputsRef = useRef(null)
```

Then wrap the `drawTvScreen` call (line 237) in a dirty check. Replace lines 236-263 with:

```jsx
if (!gpu) return

// Build a lightweight fingerprint of inputs that affect canvas output
const isAnimatingMode = screenMode === 'summary' || screenMode === 'boot' || screenMode === 'leaderboard' || screenMode === 'initials'
const drawInputs = `${screenMode}|${hoveredAction}|${disabled}|${bootReady}|${Math.round(bootProgress)}`

// Animated modes need continuous redraws; static modes only redraw on input change
const needsRedraw = isAnimatingMode
  || channelFlipRef.current > 0
  || (powerOnRef.current < 1 && (screenMode === 'summary' || screenMode === 'boot' || screenMode === 'leaderboard' || screenMode === 'initials'))
  || drawInputs !== prevDrawInputsRef.current

if (needsRedraw) {
  prevDrawInputsRef.current = drawInputs
  drawTvScreen(gpu.ctx, gpu.canvas, state.clock.elapsedTime, {
    hovered: hoveredAction === 'start' || hoveredAction === 'back' || hoveredAction === 'confirmInitials',
    disabled,
    buttonLabel,
    instructionLabel,
    screenMode,
    summary,
    showDismissButton,
    dismissHovered: hoveredAction === 'dismiss',
    summaryElapsed: summaryElapsedRef.current,
    bootElapsed: bootElapsedRef.current,
    bootStatusLabel,
    bootProgress,
    bootReady,
    highScore,
    highScoresHovered: hoveredAction === 'highscores',
    leaderboard,
    leaderboardElapsed: leaderboardElapsedRef.current,
    initials: initialsEntry?.initials ?? null,
    cursorPos: initialsEntry?.cursorPos ?? 0,
    initialsScore: initialsEntry?.score ?? 0,
    initialsRank: initialsEntry?.rank ?? 'F',
    initialsElapsed: initialsElapsedRef.current,
  })
  gpu.texture.needsUpdate = true
}
```

The CRT shader uniform updates (lines 264-296) should remain unconditional since they're cheap GPU-side math.

**Step 2: Lint**

Run: `npx eslint src/components/introScene/TvScreen.jsx`

**Step 3: Commit**

```
feat: skip TV canvas redraw on unchanged frames

On the static title screen, the canvas content is identical frame-to-frame.
This skips the expensive 2D canvas redraw + GPU texture upload (~40-50ms on Safari)
when no inputs have changed.
```

**Expected impact:** Eliminates ~40-50ms/frame on Safari during static title screen (the most common state).

---

### Task 2: Gate the fluid mask decay RAF loop

`IntroFluidEffect.jsx` runs an independent `requestAnimationFrame` loop (line 347-368) that fills the mask canvas with a fade rect + uploads the texture every frame. When the user hasn't painted any strokes, the mask is solid black — the fill is a no-op visually but still costs ~10-15ms on Safari.

**Files:**
- Modify: `src/components/IntroFluidEffect.jsx` (decay tick, lines 344-368)

**Step 1: Track whether the mask has any painted content and skip decay when clean**

Add a dirty flag to `maskGpu` in the useMemo (after line 226):

```jsx
// In the maskGpu useMemo return object (line 219), add:
dirty: false,
```

Set it to true when paint actually happens. In `onPointerMove` (around line 306), after `paintSegment`:

```jsx
maskGpu.dirty = true
```

In the `clearMask` function (around line 252), after the fill:

```jsx
maskGpu.dirty = false
```

Then in the decay tick (line 349), gate the canvas work:

```jsx
const tick = () => {
  if (maskGpu.dirty) {
    const fadeAlpha = 1 - Math.exp(-settings.decayRate / 60)
    if (fadeAlpha > 0.0001) {
      maskGpu.ctx.globalCompositeOperation = 'source-over'
      maskGpu.ctx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha})`
      maskGpu.ctx.fillRect(0, 0, maskGpu.canvas.width, maskGpu.canvas.height)
      maskGpu.texture.needsUpdate = true
    }
  }
  maskGpu.velocity.multiplyScalar(0.86)
  frameId = window.requestAnimationFrame(tick)
}
```

Note: We still need the RAF loop running for velocity decay, but the expensive canvas fill + texture upload are gated.

**Step 2: Lint**

Run: `npx eslint src/components/IntroFluidEffect.jsx`

**Step 3: Commit**

```
perf: skip fluid mask decay canvas work when mask is clean

The RAF loop was filling a 512x512 canvas and uploading it as a GPU texture
every frame even when no strokes had been painted. Now skips the canvas
fill + texture upload when the mask is already fully black.
```

**Expected impact:** Eliminates ~10-15ms/frame on Safari when user hasn't interacted with fluid effect.

---

### Task 3: Replace backdrop-filter blur with solid background on Safari

`BootOverlay` in `App.jsx:128` uses `backdropFilter: 'blur(16px)'`, which forces Safari's compositor to sample and blur the entire WebGL canvas underneath on every frame. This is a known Safari performance killer.

**Files:**
- Modify: `src/App.jsx` (BootOverlay component, lines 97-150)

**Step 1: Detect Safari and use opaque background instead**

The `shouldUseSafariGameplayContactShadows()` function (line 81) already detects Safari. Reuse that pattern. In the `BootOverlay` component, conditionally drop the backdrop-filter:

```jsx
function BootOverlay({
  visible,
  opacity,
  phase,
  progress,
  statusLabel,
  detailLabel,
}) {
  if (!visible && opacity <= 0.001) return null

  const showProgress = phase === BOOT_PHASE_LOADING || phase === BOOT_PHASE_PRIMING
  const roundedProgress = Math.round(progress)
  const isSafari = shouldUseSafariGameplayContactShadows()

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(1.25rem, 3vw, 2.5rem)',
        opacity,
        pointerEvents: opacity > 0.15 ? 'auto' : 'none',
        transition: phase === BOOT_PHASE_REVEALING ? 'none' : 'opacity 240ms ease-out',
        background: isSafari
          ? 'linear-gradient(180deg, rgba(5, 6, 14, 0.97), rgba(4, 4, 10, 0.99))'
          : `
            radial-gradient(circle at 50% 18%, rgba(255, 188, 116, 0.18), transparent 36%),
            radial-gradient(circle at 50% 120%, rgba(80, 220, 255, 0.16), transparent 40%),
            linear-gradient(180deg, rgba(5, 6, 14, 0.86), rgba(4, 4, 10, 0.96))
          `,
        backdropFilter: isSafari ? 'none' : 'blur(16px)',
      }}
    >
```

The Safari background is more opaque to compensate for losing the blur (0.97/0.99 vs 0.86/0.96). The radial gradients are dropped since they're subtle and the overlay is temporary.

**Step 2: Lint**

Run: `npx eslint src/App.jsx`

**Step 3: Commit**

```
perf: drop backdrop-filter blur on Safari boot overlay

Safari's compositor is extremely slow at backdrop-filter blur over WebGL
canvases. Use an opaque fallback background on Safari instead.
```

**Expected impact:** Eliminates compositor overhead (~5-10ms/frame on Safari).

---

### Task 4: Reduce TV canvas texture size on Safari

Safari's texture upload pipeline is slower. Using 768px when 512px is visually sufficient on a CRT-shader-distorted TV screen wastes upload bandwidth.

**Files:**
- Modify: `src/components/introScene/TvScreen.jsx` (getScreenTextureSize function, lines 14-18)

**Step 1: Cap texture size to 512 on Safari**

```jsx
function isSafari() {
  if (typeof navigator === 'undefined') return false
  const { userAgent, vendor = '' } = navigator
  return vendor.includes('Apple') && userAgent.includes('Safari') && !userAgent.includes('Chrome')
}

function getScreenTextureSize(quality) {
  if (isSafari()) return 512
  if (quality === 'high') return 1024
  if (quality === 'quiet') return 512
  return 768
}
```

The CRT shader distortion, scanlines, and noise mask the resolution difference. 512px through the CRT pipeline is visually indistinguishable from 768px.

**Step 2: Lint**

Run: `npx eslint src/components/introScene/TvScreen.jsx`

**Step 3: Commit**

```
perf: cap TV canvas texture to 512px on Safari

Safari's GPU texture upload is slower than Chrome's. The CRT shader
distortion masks the resolution difference, so 512px is sufficient.
```

**Expected impact:** ~30% reduction in canvas draw time + texture upload cost per dirty frame.

---

### Task 5: Reduce shadowBlur usage in tvScreenCanvas.js

Canvas 2D `shadowBlur` is extremely expensive on Safari — it triggers a separate blur pass per draw call. The HUD pills use `shadowBlur: 16` on every pill draw.

**Files:**
- Modify: `src/components/introScene/tvScreenCanvas.js` (drawHudPill function, lines 6-39)

**Step 1: Remove or reduce shadowBlur in drawHudPill**

The CRT shader already adds its own glow/bloom. The canvas-level shadow glow is redundant.

```jsx
export function drawHudPill(
  ctx,
  x,
  y,
  width,
  height,
  label,
  {
    fill = "rgba(45, 17, 62, 0.92)",
    stroke = "#ffd166",
    text = "#fff6d8",
    glow = "rgba(255, 209, 102, 0.45)",
    font = '900 28px "Nunito", sans-serif',
  } = {},
) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - height / 2, width, height, height / 2);
  ctx.fillStyle = fill;
  // Skip shadowBlur — the CRT shader provides its own glow effect,
  // and canvas shadowBlur is extremely expensive on Safari.
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = text;
  ctx.font = font;
  ctx.fillText(label, x, y + 1);
  ctx.restore();
}
```

Also search for other `shadowBlur` usage in the file and remove/reduce them:

Run: `grep -n 'shadowBlur' src/components/introScene/tvScreenCanvas.js`

For each occurrence, evaluate whether the CRT shader makes it redundant (it almost certainly does — the CRT adds scanlines, noise, vignette, and bloom post-process on top).

**Step 2: Lint**

Run: `npx eslint src/components/introScene/tvScreenCanvas.js`

**Step 3: Commit**

```
perf: remove canvas shadowBlur from TV screen drawing

Canvas 2D shadowBlur triggers expensive per-draw blur passes on Safari.
The CRT post-shader already provides glow/bloom, making canvas-level
shadows redundant.
```

**Expected impact:** Significant reduction in per-draw-call cost during canvas redraws. Safari's canvas shadowBlur can add 2-5ms per draw call.

---

### Task 6: Skip no-op post-processing effects during intro

During the intro screen, several effects in the `EffectComposer` are at zero/default values but still execute their full shader pass: ChromaticAberration offset is (0,0), Vignette darkness is 0, LensDistortion is at default. Each pass is a full-screen texture sample on Safari.

**Files:**
- Modify: `src/components/PostEffects.jsx`

**Step 1: Conditionally exclude zero-effect passes**

The cleanest approach is to track whether each effect is visually active and skip rendering it when not. The `postprocessing` library's Effect class has a built-in mechanism — effects with no visual contribution can be disabled.

In the `useFrame` hook, after updating each effect's values, disable effects that are at zero:

After the existing uniform updates in useFrame (around line 216), add:

```jsx
// Disable effects that have no visual contribution to save full-screen passes
chromaticAberration.blendMode.setBlendFunction(
  chromaticStrengthRef.current < 0.001 ? 0 : 23, // SKIP vs NORMAL
  chromaticStrengthRef.current < 0.001 ? 0 : 23
)
```

Actually, the simpler and safer approach: just conditionally render the effects. Replace the static `<primitive>` entries with conditional rendering based on whether we're in game mode:

```jsx
{(postMixRef.current > 0.01 || chromaticSpike > 0) && <primitive object={chromaticAberration} />}
```

Wait — this would cause mount/unmount thrashing. Better approach: use the postprocessing `Effect.enabled` property in the useFrame:

```jsx
// At end of useFrame, after all uniform updates:
chromaticAberration.enabled = chromaticStrengthRef.current > 0.001 || chromaticSpike > 0
vignette.enabled = vignette.darkness > 0.001
```

This is the least invasive change — the EffectComposer skips disabled effects.

**Step 2: Lint**

Run: `npx eslint src/components/PostEffects.jsx`

**Step 3: Commit**

```
perf: disable zero-contribution post-processing effects

ChromaticAberration and Vignette run full-screen shader passes even when
their values are zero. Disable them when not contributing visually.
```

**Expected impact:** 2 fewer full-screen shader passes during intro (~5-10ms on Safari).

---

## Summary of Expected Impact

| Task | Safari ms/frame saved | Applies to |
|------|----------------------|------------|
| 1. Canvas dirty-flag | ~40-50ms | Static title screen |
| 2. Fluid mask gate | ~10-15ms | No pointer interaction |
| 3. Backdrop-filter removal | ~5-10ms | Boot overlay visible |
| 4. Texture size reduction | ~10-15ms | All intro states |
| 5. shadowBlur removal | ~5-15ms | Canvas redraw frames |
| 6. Post-pass culling | ~5-10ms | Intro screen |

**Combined:** ~75-115ms/frame saved on Safari intro screen. At 60fps, that's 16.7ms budget — these changes should bring Safari well within budget.

**Priority order:** Tasks 1 > 2 > 3 > 5 are highest impact. Tasks 4 and 6 are meaningful polish.
