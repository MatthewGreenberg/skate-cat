import { useEffect, useMemo } from 'react'
import { Pass } from 'postprocessing'
import * as THREE from 'three'

const transitionVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`

const transitionFragmentShader = /* glsl */ `
  uniform sampler2D inputBuffer;
  uniform sampler2D uSnapshot;
  uniform float uProgress;
  uniform float uAspectRatio;
  uniform float uRevealCurve;
  uniform float uThresholdStart;
  uniform float uThresholdEnd;
  uniform float uBandBefore;
  uniform float uBandAfter;
  uniform float uGlowInnerOffset;
  uniform float uGlowOuterOffset;
  uniform float uGlowIntensity;
  uniform float uNoiseScaleA;
  uniform float uNoiseScaleB;
  uniform float uNoiseAmpA;
  uniform float uNoiseAmpB;
  uniform vec3 uGlowColor;
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
    vec4 inputColor = texture2D(inputBuffer, vUv);

    if (uProgress >= 1.0) {
      gl_FragColor = inputColor;
      return;
    }

    vec4 snapshotColor = texture2D(uSnapshot, vUv);
    if (uProgress <= 0.0) {
      gl_FragColor = snapshotColor;
      return;
    }

    vec2 center = vec2(0.5, 0.5);
    float dist = length((vUv - center) * vec2(1.0, uAspectRatio));
    float n = noise(vUv * uNoiseScaleA) * uNoiseAmpA + noise(vUv * uNoiseScaleB) * uNoiseAmpB;
    float edge = dist + n;

    float reveal = pow(clamp(uProgress, 0.0, 1.0), uRevealCurve);
    float threshold = mix(uThresholdStart, uThresholdEnd, reveal);
    float band = smoothstep(threshold - uBandBefore, threshold + uBandAfter, edge);

    float edgeGlow = smoothstep(threshold - uGlowOuterOffset, threshold - uGlowInnerOffset, edge)
      - smoothstep(threshold + uGlowInnerOffset, threshold + uGlowOuterOffset, edge);

    vec3 blended = mix(inputColor.rgb, snapshotColor.rgb, band);
    blended += uGlowColor * edgeGlow * uGlowIntensity;

    gl_FragColor = vec4(blended, 1.0);
  }
`

class IntroTransitionPass extends Pass {
  constructor() {
    super('IntroTransitionPass')
    this.progressRef = null
    this.snapshotTexture = null
    this.needsSwap = true
    this.fullscreenMaterial = new THREE.ShaderMaterial({
      uniforms: {
        inputBuffer: new THREE.Uniform(null),
        uSnapshot: new THREE.Uniform(null),
        uProgress: new THREE.Uniform(0),
        uAspectRatio: new THREE.Uniform(1),
        uRevealCurve: new THREE.Uniform(0.72),
        uThresholdStart: new THREE.Uniform(-0.02),
        uThresholdEnd: new THREE.Uniform(0.84),
        uBandBefore: new THREE.Uniform(0.07),
        uBandAfter: new THREE.Uniform(0.05),
        uGlowInnerOffset: new THREE.Uniform(0.01),
        uGlowOuterOffset: new THREE.Uniform(0.11),
        uGlowIntensity: new THREE.Uniform(0.5),
        uNoiseScaleA: new THREE.Uniform(8),
        uNoiseScaleB: new THREE.Uniform(16),
        uNoiseAmpA: new THREE.Uniform(0.25),
        uNoiseAmpB: new THREE.Uniform(0.1),
        uGlowColor: new THREE.Uniform(new THREE.Color('#ff7326')),
      },
      vertexShader: transitionVertexShader,
      fragmentShader: transitionFragmentShader,
      blending: THREE.NoBlending,
      toneMapped: false,
      depthWrite: false,
      depthTest: false,
    })
  }

  render(renderer, inputBuffer, outputBuffer) {
    const uniforms = this.fullscreenMaterial.uniforms
    uniforms.inputBuffer.value = inputBuffer.texture
    uniforms.uSnapshot.value = this.snapshotTexture
    uniforms.uProgress.value = this.progressRef?.current ?? 1
    uniforms.uAspectRatio.value = inputBuffer.width > 0
      ? inputBuffer.height / inputBuffer.width
      : 1

    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer)
    renderer.render(this.scene, this.camera)
  }
}

export default function TransitionEffect({ snapshotTexture, progressRef, settings }) {
  const pass = useMemo(() => new IntroTransitionPass(), [])

  useEffect(() => {
    pass.progressRef = progressRef
    pass.snapshotTexture = snapshotTexture

    return () => {
      pass.progressRef = null
      pass.snapshotTexture = null
    }
  }, [pass, progressRef, snapshotTexture])

  useEffect(() => {
    const uniforms = pass.fullscreenMaterial.uniforms
    uniforms.uRevealCurve.value = settings.revealCurve
    uniforms.uThresholdStart.value = settings.thresholdStart
    uniforms.uThresholdEnd.value = settings.thresholdEnd
    uniforms.uBandBefore.value = settings.bandBefore
    uniforms.uBandAfter.value = settings.bandAfter
    uniforms.uGlowInnerOffset.value = settings.glowInnerOffset
    uniforms.uGlowOuterOffset.value = settings.glowOuterOffset
    uniforms.uGlowIntensity.value = settings.glowIntensity
    uniforms.uNoiseScaleA.value = settings.noiseScaleA
    uniforms.uNoiseScaleB.value = settings.noiseScaleB
    uniforms.uNoiseAmpA.value = settings.noiseAmpA
    uniforms.uNoiseAmpB.value = settings.noiseAmpB
    uniforms.uGlowColor.value.set(settings.glowColor)
  }, [pass, settings])

  useEffect(() => () => {
    pass.dispose()
  }, [pass])

  return <primitive object={pass} />
}
