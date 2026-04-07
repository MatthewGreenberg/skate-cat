/* eslint-disable react-hooks/immutability */
import { useEffect, useLayoutEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { Pass } from 'postprocessing'
import * as THREE from 'three'

const fluidVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`

const fluidFragmentShader = /* glsl */ `
  uniform sampler2D inputBuffer;
  uniform sampler2D uMask;
  uniform vec2 uResolution;
  uniform vec2 uMaskResolution;
  uniform vec2 uPointerUv;
  uniform vec2 uPointerVelocity;
  uniform float uTime;
  uniform float uMix;
  uniform float uWarpStrength;
  uniform float uScanlineFrequency;
  uniform float uScanlineStrength;
  uniform float uRgbSplit;
  uniform float uHighlightStrength;
  uniform float uEdgeGlowStrength;
  uniform float uVelocityWarp;
  uniform float uBrushRadius;
  varying vec2 vUv;

  void main() {
    vec4 base = texture2D(inputBuffer, vUv);

    if (uMix <= 0.0001) {
      gl_FragColor = base;
      return;
    }

    float rawMask = texture2D(uMask, vUv).r;
    float ink = smoothstep(0.02, 0.9, rawMask) * uMix;
    if (ink <= 0.0001) {
      gl_FragColor = base;
      return;
    }

    vec2 safeResolution = max(uResolution, vec2(1.0));
    vec2 safeMaskResolution = max(uMaskResolution, vec2(1.0));
    vec2 maskTexel = 1.0 / safeMaskResolution;
    float maskDx = texture2D(uMask, vUv + vec2(maskTexel.x, 0.0)).r - texture2D(uMask, vUv - vec2(maskTexel.x, 0.0)).r;
    float maskDy = texture2D(uMask, vUv + vec2(0.0, maskTexel.y)).r - texture2D(uMask, vUv - vec2(0.0, maskTexel.y)).r;
    float coreInk = smoothstep(0.08, 0.95, rawMask) * uMix;
    vec2 pointerDelta = vUv - uPointerUv;
    float pointerInfluence = 1.0 - smoothstep(uBrushRadius * 0.45, uBrushRadius * 2.2, length(pointerDelta));
    vec2 pointerFlow = uPointerVelocity * safeResolution;
    float velocitySignal = clamp(
      (pointerFlow.x * 0.018 + pointerFlow.y * 0.006) * uVelocityWarp,
      -6.0,
      6.0
    ) * pointerInfluence;

    float scanPhase = vUv.y * uScanlineFrequency * 6.2831853;
    float scanWaveA = sin(scanPhase + uTime * 13.0);
    float scanWaveB = sin(scanPhase * 0.57 - uTime * 7.0);
    float scanMix = (scanWaveA + scanWaveB * 0.55) * uScanlineStrength;
    float edgeBand = smoothstep(0.05, 0.22, rawMask) * (1.0 - smoothstep(0.38, 0.72, rawMask));
    float warpEnvelope = ink * (0.45 + coreInk * 0.55 + edgeBand * 0.35);

    vec2 warpOffset = vec2(
      (scanMix + velocitySignal + maskDx * 2.2 + maskDy * 0.35) * (uWarpStrength / safeResolution.x) * warpEnvelope,
      maskDy * 0.18 * (uWarpStrength / safeResolution.y) * warpEnvelope
    );

    vec2 warpedUv = clamp(vUv + warpOffset, vec2(0.0), vec2(1.0));
    float splitPixels = (uRgbSplit / safeResolution.x) * warpEnvelope;
    vec2 splitOffset = vec2(splitPixels * (0.55 + edgeBand * 0.75), 0.0);
    float red = texture2D(inputBuffer, clamp(warpedUv + splitOffset, vec2(0.0), vec2(1.0))).r;
    float green = texture2D(inputBuffer, warpedUv).g;
    float blue = texture2D(inputBuffer, clamp(warpedUv - splitOffset, vec2(0.0), vec2(1.0))).b;
    vec3 crtSample = vec3(red, green, blue);

    float luma = dot(crtSample, vec3(0.2126, 0.7152, 0.0722));
    vec3 contrastLift = mix(vec3(luma), crtSample, 1.0 + uHighlightStrength * 0.22);
    contrastLift *= 1.0 + uHighlightStrength * 0.24 * ink;

    float ringPulse = 0.55 + 0.45 * sin(scanPhase * 0.42 - uTime * 8.0);
    vec3 edgeTint = mix(vec3(1.0), vec3(0.52, 0.93, 1.0), 0.78);
    vec3 effected = contrastLift + edgeTint * edgeBand * ringPulse * uEdgeGlowStrength * 0.24;
    vec3 blended = mix(base.rgb, effected, ink);

    gl_FragColor = vec4(blended, base.a);
  }
`

const MASK_SIZE = 512
const MIN_POINTER_MOVE_PIXELS = 5

function drawBrushStamp(ctx, x, y, radius, strength) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
  gradient.addColorStop(0, `rgba(255, 255, 255, ${strength})`)
  gradient.addColorStop(0.45, `rgba(255, 255, 255, ${strength * 0.55})`)
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
}

function paintSegment(ctx, from, to, radius, strength) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const distance = Math.hypot(dx, dy)
  const steps = Math.max(1, Math.ceil(distance / Math.max(radius * 0.35, 1)))

  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps
    drawBrushStamp(
      ctx,
      THREE.MathUtils.lerp(from.x, to.x, t),
      THREE.MathUtils.lerp(from.y, to.y, t),
      radius,
      strength
    )
  }
}

class IntroFluidPass extends Pass {
  constructor() {
    super('IntroFluidPass')
    this.mixRef = null
    this.maskTexture = null
    this.pointerUv = null
    this.pointerVelocity = null
    this.time = 0
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        inputBuffer: new THREE.Uniform(null),
        uMask: new THREE.Uniform(null),
        uResolution: new THREE.Uniform(new THREE.Vector2(1, 1)),
        uMaskResolution: new THREE.Uniform(new THREE.Vector2(MASK_SIZE, MASK_SIZE)),
        uPointerUv: new THREE.Uniform(new THREE.Vector2(-10, -10)),
        uPointerVelocity: new THREE.Uniform(new THREE.Vector2()),
        uTime: new THREE.Uniform(0),
        uMix: new THREE.Uniform(0),
        uWarpStrength: new THREE.Uniform(2.2),
        uScanlineFrequency: new THREE.Uniform(180),
        uScanlineStrength: new THREE.Uniform(0.22),
        uRgbSplit: new THREE.Uniform(1.1),
        uHighlightStrength: new THREE.Uniform(0.16),
        uEdgeGlowStrength: new THREE.Uniform(0.42),
        uVelocityWarp: new THREE.Uniform(1.6),
        uBrushRadius: new THREE.Uniform(0.06),
      },
      vertexShader: fluidVertexShader,
      fragmentShader: fluidFragmentShader,
      blending: THREE.NoBlending,
      toneMapped: false,
      depthWrite: false,
      depthTest: false,
    })

    this.fullscreenMaterial = this.material
    this.needsSwap = true
  }

  setSize(width, height) {
    this.material.uniforms.uResolution.value.set(width, height)
  }

  render(renderer, inputBuffer, outputBuffer, deltaTime = 0) {
    const mixValue = THREE.MathUtils.clamp(this.mixRef?.current ?? 0, 0, 1)
    this.time += deltaTime

    const uniforms = this.material.uniforms
    uniforms.inputBuffer.value = inputBuffer.texture
    uniforms.uMask.value = this.maskTexture
    uniforms.uResolution.value.set(inputBuffer.width, inputBuffer.height)
    uniforms.uTime.value = this.time
    uniforms.uMix.value = mixValue
    uniforms.uPointerUv.value.copy(this.pointerUv ?? uniforms.uPointerUv.value.set(-10, -10))
    uniforms.uPointerVelocity.value.copy(this.pointerVelocity ?? uniforms.uPointerVelocity.value.set(0, 0))

    this.screen.material = this.material
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer)
    renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.material.dispose()
    super.dispose()
  }
}

export default function IntroFluidEffect({ active, mixRef, settings }) {
  const { gl } = useThree()
  const pass = useMemo(() => new IntroFluidPass(), [])
  const maskGpu = useMemo(() => {
    if (typeof document === 'undefined') return null

    const canvas = document.createElement('canvas')
    canvas.width = MASK_SIZE
    canvas.height = MASK_SIZE
    const ctx = canvas.getContext('2d', { willReadFrequently: false })
    if (!ctx) return null

    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = false

    return {
      canvas,
      ctx,
      texture,
      pointer: null,
      pointerUv: new THREE.Vector2(-10, -10),
      velocity: new THREE.Vector2(),
      dirty: false,
      decayFrames: 0,
    }
  }, [])

  useLayoutEffect(() => {
    pass.mixRef = mixRef
    pass.maskTexture = maskGpu?.texture ?? null
    pass.pointerUv = maskGpu?.pointerUv ?? null
    pass.pointerVelocity = maskGpu?.velocity ?? null

    return () => {
      pass.mixRef = null
      pass.maskTexture = null
      pass.pointerUv = null
      pass.pointerVelocity = null
    }
  }, [maskGpu, mixRef, pass])

  useEffect(() => {
    if (!maskGpu) return undefined

    const setPointerInactive = () => {
      maskGpu.pointer = null
      maskGpu.pointerUv.set(-10, -10)
      maskGpu.velocity.set(0, 0)
    }

    const clearMask = () => {
      maskGpu.ctx.globalCompositeOperation = 'source-over'
      maskGpu.ctx.clearRect(0, 0, maskGpu.canvas.width, maskGpu.canvas.height)
      maskGpu.ctx.fillStyle = '#000'
      maskGpu.ctx.fillRect(0, 0, maskGpu.canvas.width, maskGpu.canvas.height)
      setPointerInactive()
      maskGpu.texture.needsUpdate = true
      maskGpu.dirty = false
    }

    if (!active) {
      clearMask()
      return undefined
    }

    const onPointerMove = (event) => {
      if (event.pointerType === 'touch') return

      const rect = gl.domElement.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      const normalizedX = (event.clientX - rect.left) / rect.width
      const normalizedY = (event.clientY - rect.top) / rect.height
      const isInside = normalizedX >= 0 && normalizedX <= 1 && normalizedY >= 0 && normalizedY <= 1
      if (!isInside) {
        setPointerInactive()
        return
      }

      const x = normalizedX * maskGpu.canvas.width
      const y = normalizedY * maskGpu.canvas.height
      const radius = settings.brushRadius * maskGpu.canvas.width
      const nextUv = new THREE.Vector2(
        THREE.MathUtils.clamp(normalizedX, 0, 1),
        THREE.MathUtils.clamp(1 - normalizedY, 0, 1)
      )
      if (maskGpu.pointer == null) {
        maskGpu.pointer = { x, y }
        maskGpu.pointerUv.copy(nextUv)
        maskGpu.velocity.set(0, 0)
        return
      }

      const moveDx = x - maskGpu.pointer.x
      const moveDy = y - maskGpu.pointer.y
      const moveDistance = Math.hypot(moveDx, moveDy)
      const minMoveDistance = Math.max(MIN_POINTER_MOVE_PIXELS, radius * 0.22)
      if (moveDistance < minMoveDistance) {
        maskGpu.velocity.multiplyScalar(0.65)
        return
      }

      const previousUv = maskGpu.pointerUv

      maskGpu.ctx.globalCompositeOperation = 'lighter'
      const nextPoint = { x, y }
      paintSegment(
        maskGpu.ctx,
        maskGpu.pointer ?? nextPoint,
        nextPoint,
        radius,
        settings.brushStrength
      )
      maskGpu.dirty = true
      maskGpu.decayFrames = 0
      maskGpu.pointer = nextPoint
      maskGpu.velocity.lerp(
        new THREE.Vector2(nextUv.x - previousUv.x, nextUv.y - previousUv.y),
        0.85
      )
      maskGpu.pointerUv.copy(nextUv)
      maskGpu.texture.needsUpdate = true
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('blur', setPointerInactive)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('blur', setPointerInactive)
      clearMask()
    }
  }, [active, gl, maskGpu, settings.brushRadius, settings.brushStrength])

  useEffect(() => {
    const uniforms = pass.material.uniforms
    uniforms.uWarpStrength.value = settings.warpStrength
    uniforms.uScanlineFrequency.value = settings.scanlineFrequency
    uniforms.uScanlineStrength.value = settings.scanlineStrength
    uniforms.uRgbSplit.value = settings.rgbSplit
    uniforms.uHighlightStrength.value = settings.highlightStrength
    uniforms.uEdgeGlowStrength.value = settings.edgeGlowStrength
    uniforms.uVelocityWarp.value = settings.velocityWarp
    uniforms.uBrushRadius.value = settings.brushRadius
  }, [pass, settings])

  useEffect(() => {
    if (!maskGpu) return undefined

    let frameId = 0

    const tick = () => {
      if (maskGpu.dirty) {
        const fadeAlpha = 1 - Math.exp(-settings.decayRate / 60)
        // After enough decay frames, the canvas is effectively black — stop work
        const framesNeeded = fadeAlpha > 0.0001
          ? Math.ceil(Math.log(1 / 255) / Math.log(1 - fadeAlpha)) + 10
          : 120
        maskGpu.decayFrames = (maskGpu.decayFrames || 0) + 1
        if (maskGpu.decayFrames > framesNeeded) {
          maskGpu.dirty = false
          maskGpu.decayFrames = 0
        } else if (fadeAlpha > 0.0001) {
          maskGpu.ctx.globalCompositeOperation = 'source-over'
          maskGpu.ctx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha})`
          maskGpu.ctx.fillRect(0, 0, maskGpu.canvas.width, maskGpu.canvas.height)
          maskGpu.texture.needsUpdate = true
        }
      }
      maskGpu.velocity.multiplyScalar(0.86)
      frameId = window.requestAnimationFrame(tick)
    }

    if (active) {
      frameId = window.requestAnimationFrame(tick)
    }

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [active, maskGpu, settings.decayRate])

  useEffect(() => () => {
    maskGpu?.texture.dispose()
    pass.dispose()
  }, [maskGpu, pass])

  return <primitive object={pass} />
}
