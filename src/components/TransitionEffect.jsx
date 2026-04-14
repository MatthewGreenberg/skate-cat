/* eslint-disable react-hooks/immutability */
import { useEffect, useLayoutEffect, useMemo } from 'react'
import { Pass } from 'postprocessing'
import * as THREE from 'three'

const _clearColor = new THREE.Color()

const transitionVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`

// Diffusion pass: evolves the reveal mask via ping-pong feedback.
// Reads previous frame's mask, diffuses neighbors, injects raw threshold reveal.
const diffusionFragmentShader = /* glsl */ `
  uniform sampler2D uPrevField;
  uniform float uProgress;
  uniform float uAspectRatio;
  uniform float uRevealCurve;
  uniform float uThresholdStart;
  uniform float uThresholdEnd;
  uniform float uNoiseScaleA;
  uniform float uNoiseScaleB;
  uniform float uNoiseAmpA;
  uniform float uNoiseAmpB;
  uniform float uDiffuseSpread;
  uniform vec2 uTexelSize;
  varying vec2 vUv;

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

  void main() {
    vec2 center = vec2(0.5);
    float dist = length((vUv - center) * vec2(1.0, uAspectRatio));
    float n = noise(vUv * uNoiseScaleA) * uNoiseAmpA
            + noise(vUv * uNoiseScaleB) * uNoiseAmpB;
    float edge = dist + n;

    float reveal = pow(clamp(uProgress, 0.0, 1.0), uRevealCurve);
    float threshold = mix(uThresholdStart, uThresholdEnd, reveal);

    // Sharp raw reveal so diffusion has room to soften
    float rawReveal = 1.0 - smoothstep(threshold - 0.03, threshold + 0.02, edge);

    // 5-tap neighbor sampling from previous frame
    float prev  = texture2D(uPrevField, vUv).r;
    float prevN = texture2D(uPrevField, vUv + vec2(0.0,  uTexelSize.y * 1.5)).r;
    float prevS = texture2D(uPrevField, vUv + vec2(0.0, -uTexelSize.y * 1.5)).r;
    float prevE = texture2D(uPrevField, vUv + vec2( uTexelSize.x * 1.5, 0.0)).r;
    float prevW = texture2D(uPrevField, vUv + vec2(-uTexelSize.x * 1.5, 0.0)).r;

    // Weighted average biased toward max neighbor (creates spreading tendrils)
    float avg = (prev * 2.0 + prevN + prevS + prevE + prevW) / 6.0;
    float maxN = max(max(prevN, prevS), max(prevE, prevW));
    float diffused = mix(avg, maxN, uDiffuseSpread) * 0.997;

    // Raw reveal keeps overall timing on track
    float result = max(diffused, rawReveal);

    gl_FragColor = vec4(result, 0.0, 0.0, 1.0);
  }
`

// Composite pass: blends game/live intro using the diffused mask, adds glow ring.
const compositeFragmentShader = /* glsl */ `
  uniform sampler2D inputBuffer;
  uniform sampler2D uIntro;
  uniform sampler2D uDiffusedMask;
  uniform float uProgress;
  uniform float uBandBefore;
  uniform float uBandAfter;
  uniform float uGlowInnerOffset;
  uniform float uGlowOuterOffset;
  uniform float uGlowIntensity;
  uniform vec3 uGlowColor;
  uniform float uDollyAmount;
  uniform float uDollyStart;
  uniform float uFlashStrength;
  varying vec2 vUv;

  void main() {
    vec4 inputColor = texture2D(inputBuffer, vUv);

    if (uProgress >= 1.0) {
      gl_FragColor = inputColor;
      return;
    }

    // Dolly: zoom intro UVs toward center (ease-out for immediate feel)
    float dollyT = uDollyStart + (1.0 - uDollyStart) * (1.0 - (1.0 - uProgress) * (1.0 - uProgress));
    vec2 introUv = mix(vUv, vec2(0.5), dollyT * uDollyAmount);
    vec4 introColor = texture2D(uIntro, introUv);
    if (uProgress <= 0.0) {
      gl_FragColor = introColor;
      return;
    }

    // Diffused reveal mask: 1 = game visible, 0 = intro visible
    float revealMask = texture2D(uDiffusedMask, vUv).r;

    // Band softness controls how sharply the mask transitions
    float softReveal = smoothstep(uBandBefore, 1.0 - uBandAfter, revealMask);
    float band = 1.0 - softReveal;

    // Glow ring centered at the transition edge (mask ~ 0.5)
    float edgeGlow = smoothstep(0.5 - uGlowOuterOffset, 0.5 - uGlowInnerOffset, revealMask)
                   - smoothstep(0.5 + uGlowInnerOffset, 0.5 + uGlowOuterOffset, revealMask);

    vec3 blended = mix(inputColor.rgb, introColor.rgb, band);
    blended += uGlowColor * edgeGlow * uGlowIntensity;

    // White flash: peaks at capture moment, decays exponentially
    float flash = exp(-uProgress * 25.0) * uFlashStrength;
    blended += vec3(flash);

    gl_FragColor = vec4(blended, 1.0);
  }
`

const simpleFadeFragmentShader = /* glsl */ `
  uniform sampler2D inputBuffer;
  uniform float uProgress;
  uniform vec3 uTint;
  varying vec2 vUv;

  void main() {
    vec4 inputColor = texture2D(inputBuffer, vUv);
    float reveal = smoothstep(0.0, 1.0, uProgress);
    vec3 veil = mix(vec3(0.0), uTint * 0.22, 0.35);
    vec3 color = mix(veil, inputColor.rgb, reveal);
    gl_FragColor = vec4(color, inputColor.a);
  }
`

class SimpleFadeTransitionPass extends Pass {
  constructor() {
    super('SimpleFadeTransitionPass')
    this.progressRef = null
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        inputBuffer: new THREE.Uniform(null),
        uProgress: new THREE.Uniform(0),
        uTint: new THREE.Uniform(new THREE.Color('#000000')),
      },
      vertexShader: transitionVertexShader,
      fragmentShader: simpleFadeFragmentShader,
      blending: THREE.NoBlending,
      toneMapped: false,
      depthWrite: false,
      depthTest: false,
    })

    this.fullscreenMaterial = this.material
    this.needsSwap = true
  }

  render(renderer, inputBuffer, outputBuffer) {
    this.material.uniforms.inputBuffer.value = inputBuffer.texture
    this.material.uniforms.uProgress.value = this.progressRef?.current ?? 0
    this.screen.material = this.material
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer)
    renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.material.dispose()
    super.dispose()
  }
}

class IntroTransitionPass extends Pass {
  constructor() {
    super('IntroTransitionPass')
    this.progressRef = null
    this.capturedTexture = null
    this.needsSwap = true

    this.pingPongA = null
    this.pingPongB = null
    this.ppWidth = 0
    this.ppHeight = 0
    this.pingPongSeeded = false

    this.diffusionMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uPrevField: new THREE.Uniform(null),
        uProgress: new THREE.Uniform(0),
        uAspectRatio: new THREE.Uniform(1),
        uRevealCurve: new THREE.Uniform(0.72),
        uThresholdStart: new THREE.Uniform(-0.02),
        uThresholdEnd: new THREE.Uniform(0.84),
        uNoiseScaleA: new THREE.Uniform(8),
        uNoiseScaleB: new THREE.Uniform(16),
        uNoiseAmpA: new THREE.Uniform(0.25),
        uNoiseAmpB: new THREE.Uniform(0.1),
        uDiffuseSpread: new THREE.Uniform(0.35),
        uTexelSize: new THREE.Uniform(new THREE.Vector2()),
      },
      vertexShader: transitionVertexShader,
      fragmentShader: diffusionFragmentShader,
      blending: THREE.NoBlending,
      toneMapped: false,
      depthWrite: false,
      depthTest: false,
    })

    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        inputBuffer: new THREE.Uniform(null),
        uIntro: new THREE.Uniform(null),
        uDiffusedMask: new THREE.Uniform(null),
        uProgress: new THREE.Uniform(0),
        uBandBefore: new THREE.Uniform(0.07),
        uBandAfter: new THREE.Uniform(0.05),
        uGlowInnerOffset: new THREE.Uniform(0.01),
        uGlowOuterOffset: new THREE.Uniform(0.11),
        uGlowIntensity: new THREE.Uniform(0.5),
        uGlowColor: new THREE.Uniform(new THREE.Color('#ff7326')),
        uDollyAmount: new THREE.Uniform(0.4),
        uDollyStart: new THREE.Uniform(0.06),
        uFlashStrength: new THREE.Uniform(0.6),
      },
      vertexShader: transitionVertexShader,
      fragmentShader: compositeFragmentShader,
      blending: THREE.NoBlending,
      toneMapped: false,
      depthWrite: false,
      depthTest: false,
    })

    this.fullscreenMaterial = this.compositeMaterial
  }

  ensurePingPongTargets(width, height) {
    const halfW = Math.ceil(width / 2)
    const halfH = Math.ceil(height / 2)
    if (this.ppWidth === halfW && this.ppHeight === halfH) return

    this.pingPongA?.dispose()
    this.pingPongB?.dispose()

    const opts = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    }

    this.pingPongA = new THREE.WebGLRenderTarget(halfW, halfH, opts)
    this.pingPongB = new THREE.WebGLRenderTarget(halfW, halfH, opts)
    this.ppWidth = halfW
    this.ppHeight = halfH
    this.pingPongSeeded = false

    this.diffusionMaterial.uniforms.uTexelSize.value.set(1 / halfW, 1 / halfH)
  }

  seedPingPong(renderer) {
    const previousAlpha = renderer.getClearAlpha()
    renderer.getClearColor(_clearColor)
    renderer.setClearColor(0x000000, 0)

    renderer.setRenderTarget(this.pingPongA)
    renderer.clear(true, false, false)
    renderer.setRenderTarget(this.pingPongB)
    renderer.clear(true, false, false)

    renderer.setClearColor(_clearColor, previousAlpha)
    this.pingPongSeeded = true
  }

  render(renderer, inputBuffer, outputBuffer) {
    const progress = this.progressRef?.current ?? 0

    if (!this.capturedTexture || progress >= 1.0) {
      this.screen.material = this.compositeMaterial
      this.compositeMaterial.uniforms.inputBuffer.value = inputBuffer.texture
      this.compositeMaterial.uniforms.uProgress.value = 1.0
      renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer)
      renderer.render(this.scene, this.camera)
      return
    }

    this.ensurePingPongTargets(inputBuffer.width, inputBuffer.height)
    if (!this.pingPongSeeded || progress <= 0.001) {
      this.seedPingPong(renderer)
    }

    const aspect = inputBuffer.width > 0 ? inputBuffer.height / inputBuffer.width : 1

    // --- Diffusion pass: read A, write B ---
    this.screen.material = this.diffusionMaterial
    const d = this.diffusionMaterial.uniforms
    d.uPrevField.value = this.pingPongA.texture
    d.uProgress.value = progress
    d.uAspectRatio.value = aspect

    renderer.setRenderTarget(this.pingPongB)
    renderer.render(this.scene, this.camera)

    // Swap
    const temp = this.pingPongA
    this.pingPongA = this.pingPongB
    this.pingPongB = temp

    // --- Composite pass: blend using diffused mask (or wipe) ---
    this.screen.material = this.compositeMaterial
    const c = this.compositeMaterial.uniforms
    c.inputBuffer.value = inputBuffer.texture
    c.uIntro.value = this.capturedTexture
    c.uDiffusedMask.value = this.pingPongA.texture
    c.uProgress.value = progress

    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer)
    renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.pingPongA?.dispose()
    this.pingPongB?.dispose()
    this.diffusionMaterial.dispose()
    this.compositeMaterial.dispose()
    this.pingPongA = null
    this.pingPongB = null
    super.dispose()
  }
}

export default function TransitionEffect({
  capturedTexture,
  progressRef,
  settings,
  direction = 'forward',
  simpleMode = false,
}) {
  const pass = useMemo(
    () => (simpleMode ? new SimpleFadeTransitionPass() : new IntroTransitionPass()),
    [simpleMode]
  )

  useLayoutEffect(() => {
    pass.progressRef = progressRef
    if ('capturedTexture' in pass) {
      pass.capturedTexture = capturedTexture
    }

    return () => {
      pass.progressRef = null
      if ('capturedTexture' in pass) {
        pass.capturedTexture = null
      }
    }
  }, [capturedTexture, pass, progressRef])

  useEffect(() => {
    if (simpleMode) {
      pass.material.uniforms.uTint.value.set(direction === 'reverse' ? settings.returnGlowColor : settings.glowColor)
      return
    }

    const d = pass.diffusionMaterial.uniforms
    const isReverse = direction === 'reverse'
    d.uRevealCurve.value = isReverse ? settings.returnRevealCurve : settings.revealCurve
    d.uThresholdStart.value = isReverse ? settings.returnThresholdStart : settings.thresholdStart
    d.uThresholdEnd.value = isReverse ? settings.returnThresholdEnd : settings.thresholdEnd
    d.uNoiseScaleA.value = settings.noiseScaleA
    d.uNoiseScaleB.value = settings.noiseScaleB
    d.uNoiseAmpA.value = settings.noiseAmpA
    d.uNoiseAmpB.value = settings.noiseAmpB
    d.uDiffuseSpread.value = isReverse ? settings.returnDiffuseSpread : settings.diffuseSpread

    const c = pass.compositeMaterial.uniforms
    c.uBandBefore.value = isReverse ? settings.returnBandBefore : settings.bandBefore
    c.uBandAfter.value = isReverse ? settings.returnBandAfter : settings.bandAfter
    c.uGlowInnerOffset.value = isReverse ? settings.returnGlowInnerOffset : settings.glowInnerOffset
    c.uGlowOuterOffset.value = isReverse ? settings.returnGlowOuterOffset : settings.glowOuterOffset
    c.uGlowIntensity.value = isReverse ? settings.returnGlowIntensity : settings.glowIntensity
    c.uGlowColor.value.set(isReverse ? settings.returnGlowColor : settings.glowColor)
    c.uDollyAmount.value = direction === 'reverse' ? 0 : settings.dollyAmount
    c.uDollyStart.value = settings.dollyStart ?? 0.06
    c.uFlashStrength.value = isReverse ? settings.returnFlashStrength : (settings.flashStrength ?? 0.6)
  }, [direction, pass, settings, simpleMode])

  useEffect(() => () => {
    pass.dispose()
  }, [pass])

  return <primitive object={pass} />
}
