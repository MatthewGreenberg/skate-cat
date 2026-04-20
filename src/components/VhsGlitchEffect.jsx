/* eslint-disable react-hooks/immutability */
import { useEffect, useMemo } from 'react'
import { Effect } from 'postprocessing'
import { folder } from 'leva'
import * as THREE from 'three'
import { useOptionalControls } from '../lib/debugControls'

// VHS eject glitch: 4 beats over uProgress 0→1
//   Impact   — strong RGB split, judder kick, 2–3 tear bands
//   Tracking — sine-wave wobble, scanline judder, desaturation
//   Rewind   — fast-scrolling tear bands, wider chroma split
//   Eject    — image squashes to a horizontal strip, white-hot edge
// Every magic number in the effect is exposed as a uniform and wired to a leva
// control under the "VHS Glitch" folder.

const fragmentShader = /* glsl */ `
  uniform float uProgress;
  uniform float uTime;

  // Phase envelopes (4 values each: in-start, in-end, out-start, out-end).
  uniform vec4 uImpactEnv;
  uniform vec4 uTrackingEnv;
  uniform vec4 uRewindEnv;
  uniform vec2 uEjectEnv;

  // Judder
  uniform float uStepRate;
  uniform float uBandCount;
  uniform float uBandScrollRate;
  uniform float uJudderImpact;
  uniform float uJudderTracking;
  uniform float uJudderRewind;

  // Tracking wobble
  uniform float uWobbleFreqY;
  uniform float uWobbleFreqT;
  uniform float uWobbleAmt;

  // Rewind tear bands
  uniform float uTearScrollFreqY;
  uniform float uTearScrollSpeed;
  uniform float uTearThreshold;
  uniform float uTearAmount;
  uniform float uTearGlowStrength;
  uniform vec3 uTearGlowColor;

  // RGB split
  uniform float uSplitImpact;
  uniform float uSplitTracking;
  uniform float uSplitRewind;
  uniform float uSplitEject;
  uniform float uSplitRadialBias;

  // Color / scan
  uniform float uDesatAmount;
  uniform float uScanFreq;
  uniform float uScanStrength;

  // Static noise
  uniform float uStaticScale;
  uniform float uStaticSpeed;
  uniform float uStaticImpact;
  uniform float uStaticTracking;
  uniform float uStaticRewind;

  // Flash
  uniform float uFlashStrength;
  uniform float uFlashDecay;

  // Eject pinch
  uniform float uEjectMinBand;
  uniform float uEdgeGlowStrength;
  uniform float uEdgeGlowFalloff;
  uniform vec3 uEdgeGlowColor;
  uniform float uCenterHotStrength;
  uniform float uCenterHotWidth;
  uniform vec3 uCenterHotColor;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float envelope(float t, vec4 e) {
    return smoothstep(e.x, e.y, t) * (1.0 - smoothstep(e.z, e.w, t));
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float t = clamp(uProgress, 0.0, 1.0);
    if (t <= 0.0001) {
      outputColor = inputColor;
      return;
    }

    float impact   = envelope(t, uImpactEnv);
    float tracking = envelope(t, uTrackingEnv);
    float rewind   = envelope(t, uRewindEnv);
    float eject    = smoothstep(uEjectEnv.x, uEjectEnv.y, t);

    float tStep = floor(uTime * uStepRate) / max(uStepRate, 0.0001);

    vec2 sUv = uv;

    // Horizontal band judder
    float bandY = floor(uv.y * uBandCount + tStep * uBandScrollRate) / max(uBandCount, 1.0);
    float bandRand = hash(vec2(bandY, tStep)) - 0.5;
    float judder = bandRand * (uJudderImpact * impact + uJudderTracking * tracking + uJudderRewind * rewind);
    sUv.x += judder;

    // Sinusoidal tracking wobble
    sUv.x += sin(uv.y * uWobbleFreqY + uTime * uWobbleFreqT) * uWobbleAmt * tracking;

    // Rewind tear bands
    float scrollY = fract(uv.y * uTearScrollFreqY - uTime * uTearScrollSpeed);
    float tearMask = step(uTearThreshold, scrollY) * rewind;
    sUv.x += (hash(vec2(scrollY, tStep)) - 0.5) * uTearAmount * tearMask;

    // Eject pinch
    float bandHalfHeight = mix(0.5, uEjectMinBand, eject);
    float yDist = abs(uv.y - 0.5);
    float insideStrip = step(yDist, bandHalfHeight);
    float squashedY = (uv.y - 0.5) / max(bandHalfHeight * 2.0, 0.0001) + 0.5;
    sUv.y = mix(sUv.y, clamp(squashedY, 0.0, 1.0), eject);

    // RGB split with radial bias
    float splitAmt = uSplitImpact * impact + uSplitTracking * tracking + uSplitRewind * rewind + uSplitEject * eject;
    vec2 radial = (uv - 0.5) * 2.0;
    vec2 splitDir = vec2(1.0, 0.0) + radial * uSplitRadialBias;
    vec4 rSample = texture2D(inputBuffer, sUv + splitDir * splitAmt);
    vec4 gSample = texture2D(inputBuffer, sUv);
    vec4 bSample = texture2D(inputBuffer, sUv - splitDir * splitAmt);
    vec3 color = vec3(rSample.r, gSample.g, bSample.b);

    // Desaturation during tracking
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(color, vec3(luma), uDesatAmount * tracking);

    // Scanline darkening
    float scan = 1.0 - uScanStrength * 0.5 + (uScanStrength * 0.5) * sin(uv.y * uScanFreq + uTime * 3.0);
    color *= mix(1.0, scan, tracking + rewind * 0.8);

    // Static noise
    float staticN = noise(uv * uStaticScale + uTime * uStaticSpeed) - 0.5;
    color += staticN * (uStaticImpact * impact + uStaticTracking * tracking + uStaticRewind * rewind);

    // Impact white flash
    float impactFlash = exp(-t * uFlashDecay) * uFlashStrength;
    color = mix(color, vec3(1.0), impactFlash);

    // Tear-band brightening
    color += uTearGlowColor * tearMask * uTearGlowStrength;

    // Eject: outside the strip fades to black
    color *= mix(1.0, insideStrip, eject);
    // Hot edge on strip boundary
    float edgeGlow = smoothstep(bandHalfHeight + uEdgeGlowFalloff, bandHalfHeight, yDist)
                   * (1.0 - insideStrip) * eject;
    color += uEdgeGlowColor * edgeGlow * uEdgeGlowStrength;
    // Central white-hot line
    float centerHot = smoothstep(uCenterHotWidth, 0.0, yDist) * eject;
    color = mix(color, uCenterHotColor, centerHot * uCenterHotStrength);

    outputColor = vec4(color, inputColor.a);
  }
`

const DEFAULTS = {
  impactEnv: [0.0, 0.14, 0.2, 0.4],
  trackingEnv: [0.15, 0.38, 0.66, 0.82],
  rewindEnv: [0.58, 0.76, 0.9, 0.97],
  ejectEnv: [0.88, 1.0],
  stepRate: 16,
  bandCount: 48,
  bandScrollRate: 2.5,
  judderImpact: 0.016,
  judderTracking: 0.006,
  judderRewind: 0.028,
  wobbleFreqY: 26,
  wobbleFreqT: 11,
  wobbleAmt: 0.006,
  tearScrollFreqY: 1.6,
  tearScrollSpeed: 3.2,
  tearThreshold: 0.9,
  tearAmount: 0.11,
  tearGlowStrength: 0.42,
  tearGlowColor: '#ffe1f3',
  splitImpact: 0.010,
  splitTracking: 0.003,
  splitRewind: 0.016,
  splitEject: 0.004,
  splitRadialBias: 0.35,
  desatAmount: 0.42,
  scanFreq: 840,
  scanStrength: 0.35,
  staticScale: 320,
  staticSpeed: 55,
  staticImpact: 0.1,
  staticTracking: 0.05,
  staticRewind: 0.14,
  flashStrength: 0.24,
  flashDecay: 28,
  ejectMinBand: 0.0035,
  edgeGlowStrength: 1.6,
  edgeGlowFalloff: 0.004,
  edgeGlowColor: '#fff2d1',
  centerHotStrength: 0.85,
  centerHotWidth: 0.0,
  centerHotColor: '#fff5e0',
}

class VhsGlitchPass extends Effect {
  constructor() {
    super('VhsGlitchEffect', fragmentShader, {
      uniforms: new Map([
        ['uProgress', new THREE.Uniform(0)],
        ['uTime', new THREE.Uniform(0)],
        ['uImpactEnv', new THREE.Uniform(new THREE.Vector4(...DEFAULTS.impactEnv))],
        ['uTrackingEnv', new THREE.Uniform(new THREE.Vector4(...DEFAULTS.trackingEnv))],
        ['uRewindEnv', new THREE.Uniform(new THREE.Vector4(...DEFAULTS.rewindEnv))],
        ['uEjectEnv', new THREE.Uniform(new THREE.Vector2(...DEFAULTS.ejectEnv))],
        ['uStepRate', new THREE.Uniform(DEFAULTS.stepRate)],
        ['uBandCount', new THREE.Uniform(DEFAULTS.bandCount)],
        ['uBandScrollRate', new THREE.Uniform(DEFAULTS.bandScrollRate)],
        ['uJudderImpact', new THREE.Uniform(DEFAULTS.judderImpact)],
        ['uJudderTracking', new THREE.Uniform(DEFAULTS.judderTracking)],
        ['uJudderRewind', new THREE.Uniform(DEFAULTS.judderRewind)],
        ['uWobbleFreqY', new THREE.Uniform(DEFAULTS.wobbleFreqY)],
        ['uWobbleFreqT', new THREE.Uniform(DEFAULTS.wobbleFreqT)],
        ['uWobbleAmt', new THREE.Uniform(DEFAULTS.wobbleAmt)],
        ['uTearScrollFreqY', new THREE.Uniform(DEFAULTS.tearScrollFreqY)],
        ['uTearScrollSpeed', new THREE.Uniform(DEFAULTS.tearScrollSpeed)],
        ['uTearThreshold', new THREE.Uniform(DEFAULTS.tearThreshold)],
        ['uTearAmount', new THREE.Uniform(DEFAULTS.tearAmount)],
        ['uTearGlowStrength', new THREE.Uniform(DEFAULTS.tearGlowStrength)],
        ['uTearGlowColor', new THREE.Uniform(new THREE.Color(DEFAULTS.tearGlowColor))],
        ['uSplitImpact', new THREE.Uniform(DEFAULTS.splitImpact)],
        ['uSplitTracking', new THREE.Uniform(DEFAULTS.splitTracking)],
        ['uSplitRewind', new THREE.Uniform(DEFAULTS.splitRewind)],
        ['uSplitEject', new THREE.Uniform(DEFAULTS.splitEject)],
        ['uSplitRadialBias', new THREE.Uniform(DEFAULTS.splitRadialBias)],
        ['uDesatAmount', new THREE.Uniform(DEFAULTS.desatAmount)],
        ['uScanFreq', new THREE.Uniform(DEFAULTS.scanFreq)],
        ['uScanStrength', new THREE.Uniform(DEFAULTS.scanStrength)],
        ['uStaticScale', new THREE.Uniform(DEFAULTS.staticScale)],
        ['uStaticSpeed', new THREE.Uniform(DEFAULTS.staticSpeed)],
        ['uStaticImpact', new THREE.Uniform(DEFAULTS.staticImpact)],
        ['uStaticTracking', new THREE.Uniform(DEFAULTS.staticTracking)],
        ['uStaticRewind', new THREE.Uniform(DEFAULTS.staticRewind)],
        ['uFlashStrength', new THREE.Uniform(DEFAULTS.flashStrength)],
        ['uFlashDecay', new THREE.Uniform(DEFAULTS.flashDecay)],
        ['uEjectMinBand', new THREE.Uniform(DEFAULTS.ejectMinBand)],
        ['uEdgeGlowStrength', new THREE.Uniform(DEFAULTS.edgeGlowStrength)],
        ['uEdgeGlowFalloff', new THREE.Uniform(DEFAULTS.edgeGlowFalloff)],
        ['uEdgeGlowColor', new THREE.Uniform(new THREE.Color(DEFAULTS.edgeGlowColor))],
        ['uCenterHotStrength', new THREE.Uniform(DEFAULTS.centerHotStrength)],
        ['uCenterHotWidth', new THREE.Uniform(DEFAULTS.centerHotWidth)],
        ['uCenterHotColor', new THREE.Uniform(new THREE.Color(DEFAULTS.centerHotColor))],
      ]),
    })
    this.progressRef = null
    // Preview-loop state (set by the component from leva)
    this.loop = false
    this.loopDuration = 0.7
    this.loopPause = 0.6
    this.loopT = 0
  }

  update(renderer, inputBuffer, deltaTime) {
    this.uniforms.get('uTime').value += deltaTime
    if (this.loop) {
      const cycle = Math.max(this.loopDuration + this.loopPause, 0.01)
      this.loopT = (this.loopT + deltaTime) % cycle
      const progress = Math.min(this.loopT / Math.max(this.loopDuration, 0.01), 1)
      this.uniforms.get('uProgress').value = progress
    } else {
      this.loopT = 0
      this.uniforms.get('uProgress').value = this.progressRef?.current ?? 0
    }
  }
}

function useVhsControls() {
  return useOptionalControls('VHS Glitch', {
    Preview: folder({
      loop: { value: false, label: 'Loop preview' },
      loopDuration: { value: 0.7, min: 0.1, max: 3, step: 0.05, label: 'Cycle (s)' },
      loopPause: { value: 0.6, min: 0, max: 3, step: 0.05, label: 'Pause (s)' },
    }, { collapsed: true }),
    Timing: folder({
      impactInStart: { value: DEFAULTS.impactEnv[0], min: 0, max: 1, step: 0.01, label: 'Impact ↑ start' },
      impactInEnd: { value: DEFAULTS.impactEnv[1], min: 0, max: 1, step: 0.01, label: 'Impact ↑ end' },
      impactOutStart: { value: DEFAULTS.impactEnv[2], min: 0, max: 1, step: 0.01, label: 'Impact ↓ start' },
      impactOutEnd: { value: DEFAULTS.impactEnv[3], min: 0, max: 1, step: 0.01, label: 'Impact ↓ end' },
      trackingInStart: { value: DEFAULTS.trackingEnv[0], min: 0, max: 1, step: 0.01, label: 'Tracking ↑ start' },
      trackingInEnd: { value: DEFAULTS.trackingEnv[1], min: 0, max: 1, step: 0.01, label: 'Tracking ↑ end' },
      trackingOutStart: { value: DEFAULTS.trackingEnv[2], min: 0, max: 1, step: 0.01, label: 'Tracking ↓ start' },
      trackingOutEnd: { value: DEFAULTS.trackingEnv[3], min: 0, max: 1, step: 0.01, label: 'Tracking ↓ end' },
      rewindInStart: { value: DEFAULTS.rewindEnv[0], min: 0, max: 1, step: 0.01, label: 'Rewind ↑ start' },
      rewindInEnd: { value: DEFAULTS.rewindEnv[1], min: 0, max: 1, step: 0.01, label: 'Rewind ↑ end' },
      rewindOutStart: { value: DEFAULTS.rewindEnv[2], min: 0, max: 1, step: 0.01, label: 'Rewind ↓ start' },
      rewindOutEnd: { value: DEFAULTS.rewindEnv[3], min: 0, max: 1, step: 0.01, label: 'Rewind ↓ end' },
      ejectStart: { value: DEFAULTS.ejectEnv[0], min: 0, max: 1, step: 0.01, label: 'Eject start' },
      ejectEnd: { value: DEFAULTS.ejectEnv[1], min: 0, max: 1, step: 0.01, label: 'Eject end' },
    }, { collapsed: true }),
    Judder: folder({
      stepRate: { value: DEFAULTS.stepRate, min: 1, max: 60, step: 1 },
      bandCount: { value: DEFAULTS.bandCount, min: 4, max: 200, step: 1 },
      bandScrollRate: { value: DEFAULTS.bandScrollRate, min: 0, max: 10, step: 0.1 },
      judderImpact: { value: DEFAULTS.judderImpact, min: 0, max: 0.1, step: 0.001 },
      judderTracking: { value: DEFAULTS.judderTracking, min: 0, max: 0.1, step: 0.001 },
      judderRewind: { value: DEFAULTS.judderRewind, min: 0, max: 0.2, step: 0.001 },
    }, { collapsed: true }),
    Wobble: folder({
      wobbleFreqY: { value: DEFAULTS.wobbleFreqY, min: 0, max: 120, step: 0.5 },
      wobbleFreqT: { value: DEFAULTS.wobbleFreqT, min: 0, max: 60, step: 0.5 },
      wobbleAmt: { value: DEFAULTS.wobbleAmt, min: 0, max: 0.05, step: 0.0005 },
    }, { collapsed: true }),
    Tear: folder({
      tearScrollFreqY: { value: DEFAULTS.tearScrollFreqY, min: 0, max: 8, step: 0.1 },
      tearScrollSpeed: { value: DEFAULTS.tearScrollSpeed, min: 0, max: 16, step: 0.1 },
      tearThreshold: { value: DEFAULTS.tearThreshold, min: 0.5, max: 1, step: 0.01 },
      tearAmount: { value: DEFAULTS.tearAmount, min: 0, max: 0.4, step: 0.005 },
      tearGlowStrength: { value: DEFAULTS.tearGlowStrength, min: 0, max: 2, step: 0.02 },
      tearGlowColor: DEFAULTS.tearGlowColor,
    }, { collapsed: true }),
    'RGB Split': folder({
      splitImpact: { value: DEFAULTS.splitImpact, min: 0, max: 0.06, step: 0.0005 },
      splitTracking: { value: DEFAULTS.splitTracking, min: 0, max: 0.06, step: 0.0005 },
      splitRewind: { value: DEFAULTS.splitRewind, min: 0, max: 0.06, step: 0.0005 },
      splitEject: { value: DEFAULTS.splitEject, min: 0, max: 0.06, step: 0.0005 },
      splitRadialBias: { value: DEFAULTS.splitRadialBias, min: 0, max: 1.5, step: 0.01 },
    }, { collapsed: true }),
    'Color / Scan': folder({
      desatAmount: { value: DEFAULTS.desatAmount, min: 0, max: 1, step: 0.01 },
      scanFreq: { value: DEFAULTS.scanFreq, min: 60, max: 2000, step: 10 },
      scanStrength: { value: DEFAULTS.scanStrength, min: 0, max: 1, step: 0.01 },
    }, { collapsed: true }),
    Static: folder({
      staticScale: { value: DEFAULTS.staticScale, min: 20, max: 1200, step: 10 },
      staticSpeed: { value: DEFAULTS.staticSpeed, min: 0, max: 300, step: 1 },
      staticImpact: { value: DEFAULTS.staticImpact, min: 0, max: 0.5, step: 0.005 },
      staticTracking: { value: DEFAULTS.staticTracking, min: 0, max: 0.5, step: 0.005 },
      staticRewind: { value: DEFAULTS.staticRewind, min: 0, max: 0.5, step: 0.005 },
    }, { collapsed: true }),
    Flash: folder({
      flashStrength: { value: DEFAULTS.flashStrength, min: 0, max: 1, step: 0.01 },
      flashDecay: { value: DEFAULTS.flashDecay, min: 1, max: 120, step: 1 },
    }, { collapsed: true }),
    Eject: folder({
      ejectMinBand: { value: DEFAULTS.ejectMinBand, min: 0.0005, max: 0.05, step: 0.0005 },
      edgeGlowStrength: { value: DEFAULTS.edgeGlowStrength, min: 0, max: 4, step: 0.02 },
      edgeGlowFalloff: { value: DEFAULTS.edgeGlowFalloff, min: 0.0005, max: 0.05, step: 0.0005 },
      edgeGlowColor: DEFAULTS.edgeGlowColor,
      centerHotStrength: { value: DEFAULTS.centerHotStrength, min: 0, max: 1, step: 0.01 },
      centerHotWidth: { value: DEFAULTS.centerHotWidth, min: 0.0005, max: 0.05, step: 0.0005 },
      centerHotColor: DEFAULTS.centerHotColor,
    }, { collapsed: true }),
  }, [])
}

export default function VhsGlitchEffect({ progressRef }) {
  const pass = useMemo(() => new VhsGlitchPass(), [])
  const ctrl = useVhsControls()

  useEffect(() => {
    pass.progressRef = progressRef
    return () => {
      pass.progressRef = null
    }
  }, [pass, progressRef])

  useEffect(() => {
    pass.loop = ctrl.loop
    pass.loopDuration = ctrl.loopDuration
    pass.loopPause = ctrl.loopPause
  }, [pass, ctrl.loop, ctrl.loopDuration, ctrl.loopPause])

  useEffect(() => {
    const u = pass.uniforms
    u.get('uImpactEnv').value.set(ctrl.impactInStart, ctrl.impactInEnd, ctrl.impactOutStart, ctrl.impactOutEnd)
    u.get('uTrackingEnv').value.set(ctrl.trackingInStart, ctrl.trackingInEnd, ctrl.trackingOutStart, ctrl.trackingOutEnd)
    u.get('uRewindEnv').value.set(ctrl.rewindInStart, ctrl.rewindInEnd, ctrl.rewindOutStart, ctrl.rewindOutEnd)
    u.get('uEjectEnv').value.set(ctrl.ejectStart, ctrl.ejectEnd)
    u.get('uStepRate').value = ctrl.stepRate
    u.get('uBandCount').value = ctrl.bandCount
    u.get('uBandScrollRate').value = ctrl.bandScrollRate
    u.get('uJudderImpact').value = ctrl.judderImpact
    u.get('uJudderTracking').value = ctrl.judderTracking
    u.get('uJudderRewind').value = ctrl.judderRewind
    u.get('uWobbleFreqY').value = ctrl.wobbleFreqY
    u.get('uWobbleFreqT').value = ctrl.wobbleFreqT
    u.get('uWobbleAmt').value = ctrl.wobbleAmt
    u.get('uTearScrollFreqY').value = ctrl.tearScrollFreqY
    u.get('uTearScrollSpeed').value = ctrl.tearScrollSpeed
    u.get('uTearThreshold').value = ctrl.tearThreshold
    u.get('uTearAmount').value = ctrl.tearAmount
    u.get('uTearGlowStrength').value = ctrl.tearGlowStrength
    u.get('uTearGlowColor').value.set(ctrl.tearGlowColor)
    u.get('uSplitImpact').value = ctrl.splitImpact
    u.get('uSplitTracking').value = ctrl.splitTracking
    u.get('uSplitRewind').value = ctrl.splitRewind
    u.get('uSplitEject').value = ctrl.splitEject
    u.get('uSplitRadialBias').value = ctrl.splitRadialBias
    u.get('uDesatAmount').value = ctrl.desatAmount
    u.get('uScanFreq').value = ctrl.scanFreq
    u.get('uScanStrength').value = ctrl.scanStrength
    u.get('uStaticScale').value = ctrl.staticScale
    u.get('uStaticSpeed').value = ctrl.staticSpeed
    u.get('uStaticImpact').value = ctrl.staticImpact
    u.get('uStaticTracking').value = ctrl.staticTracking
    u.get('uStaticRewind').value = ctrl.staticRewind
    u.get('uFlashStrength').value = ctrl.flashStrength
    u.get('uFlashDecay').value = ctrl.flashDecay
    u.get('uEjectMinBand').value = ctrl.ejectMinBand
    u.get('uEdgeGlowStrength').value = ctrl.edgeGlowStrength
    u.get('uEdgeGlowFalloff').value = ctrl.edgeGlowFalloff
    u.get('uEdgeGlowColor').value.set(ctrl.edgeGlowColor)
    u.get('uCenterHotStrength').value = ctrl.centerHotStrength
    u.get('uCenterHotWidth').value = ctrl.centerHotWidth
    u.get('uCenterHotColor').value.set(ctrl.centerHotColor)
  }, [pass, ctrl])

  useEffect(() => () => {
    pass.dispose()
  }, [pass])

  return <primitive object={pass} />
}

export { VhsGlitchPass }
