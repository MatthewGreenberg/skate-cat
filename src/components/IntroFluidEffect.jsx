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
  uniform float uDistortionPixels;
  uniform float uFlowScale;
  uniform float uFlowSpeed;
  uniform float uCellSize;
  uniform float uPixelatePixels;
  uniform float uBlendStrength;
  uniform float uDesaturateBias;
  uniform float uDesaturateAmount;
  uniform float uBrushRadius;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

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
    float cellSize = max(uCellSize, 1.0);
    vec2 flowStep = vec2(cellSize) / safeResolution;
    vec2 flowUv = (floor(vUv * safeResolution / cellSize) + 0.5) * flowStep;
    vec2 maskTexel = 1.0 / safeMaskResolution;

    float time = uTime * uFlowSpeed;
    float waveA = sin(flowUv.y * uFlowScale * 6.2831853 + time * 1.3);
    float waveB = cos(flowUv.x * uFlowScale * 5.6548668 - time * 1.1);
    float waveC = sin((flowUv.x + flowUv.y) * uFlowScale * 4.3982297 + time * 0.8);
    float jitter = hash(floor(flowUv * safeResolution * 0.5) + floor(time * 4.0)) - 0.5;

    vec2 offset = vec2(
      waveA + waveC * 0.55 + jitter * 0.35,
      waveB - waveC * 0.45 - jitter * 0.2
    );
    float maskDx = texture2D(uMask, vUv + vec2(maskTexel.x, 0.0)).r - texture2D(uMask, vUv - vec2(maskTexel.x, 0.0)).r;
    float maskDy = texture2D(uMask, vUv + vec2(0.0, maskTexel.y)).r - texture2D(uMask, vUv - vec2(0.0, maskTexel.y)).r;
    float coreInk = smoothstep(0.08, 0.95, rawMask) * uMix;
    vec2 pointerDelta = vUv - uPointerUv;
    float pointerInfluence = 1.0 - smoothstep(uBrushRadius * 0.45, uBrushRadius * 2.2, length(pointerDelta));
    vec2 pointerFlow = clamp(uPointerVelocity * safeResolution * 0.08, vec2(-2.0), vec2(2.0)) * pointerInfluence;
    vec2 maskFlow = vec2(maskDx, -maskDy) * 0.9;
    vec2 coreFlow = vec2(waveA, waveB) * coreInk * 0.65;
    offset = (offset * 0.22 + maskFlow * 0.2 + coreFlow + pointerFlow) * (uDistortionPixels / safeResolution) * ink;

    vec2 warpedUv = clamp(vUv + offset, vec2(0.0), vec2(1.0));
    vec2 backgroundWarpUv = clamp(vUv + offset * (1.65 + coreInk * 0.55), vec2(0.0), vec2(1.0));
    vec3 warped = texture2D(inputBuffer, warpedUv).rgb;
    vec3 backgroundWarp = texture2D(inputBuffer, backgroundWarpUv).rgb;
    float pixelatePixels = max(uPixelatePixels, 1.0);
    vec2 pixelStep = vec2(pixelatePixels) / safeResolution;
    vec2 pixelatedUv = (floor(backgroundWarpUv * safeResolution / pixelatePixels) + 0.5) * pixelStep;
    pixelatedUv = clamp(pixelatedUv, pixelStep * 0.5, vec2(1.0) - pixelStep * 0.5);
    vec3 pixelated = texture2D(inputBuffer, pixelatedUv).rgb;
    float pixelMix = smoothstep(0.03, 0.88, rawMask) * ink;
    float distortionPresence = smoothstep(0.04, 0.92, rawMask);
    vec3 distortedBg = mix(warped, backgroundWarp, distortionPresence * 0.7);
    vec3 effected = mix(distortedBg, pixelated, pixelMix * 0.82);
    vec3 blended = mix(base.rgb, effected, min(1.0, (uBlendStrength + 0.14) * ink));

    float luma = dot(blended, vec3(0.2126, 0.7152, 0.0722));
    vec3 desaturated = vec3(luma);
    float shadowMask = 1.0 - smoothstep(0.2, 0.82, luma);
    float desaturateMask = mix(1.0, shadowMask, clamp(uDesaturateBias, 0.0, 1.0));
    blended = mix(blended, desaturated, desaturateMask * uDesaturateAmount * ink);

    gl_FragColor = vec4(blended, base.a);
  }
`

const MASK_SIZE = 512

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
        uDistortionPixels: new THREE.Uniform(1.35),
        uFlowScale: new THREE.Uniform(4.2),
        uFlowSpeed: new THREE.Uniform(0.28),
        uCellSize: new THREE.Uniform(3),
        uPixelatePixels: new THREE.Uniform(10),
        uBlendStrength: new THREE.Uniform(0.34),
        uDesaturateBias: new THREE.Uniform(0.55),
        uDesaturateAmount: new THREE.Uniform(0.83),
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
    uniforms.uDistortionPixels.value = settings.distortionPixels
    uniforms.uFlowScale.value = settings.flowScale
    uniforms.uFlowSpeed.value = settings.flowSpeed
    uniforms.uCellSize.value = settings.cellSize
    uniforms.uPixelatePixels.value = settings.pixelatePixels
    uniforms.uBlendStrength.value = settings.blendStrength
    uniforms.uDesaturateBias.value = settings.desaturateBias
    uniforms.uDesaturateAmount.value = settings.desaturateAmount
    uniforms.uBrushRadius.value = settings.brushRadius
  }, [pass, settings])

  useEffect(() => {
    if (!maskGpu) return undefined

    let frameId = 0

    const tick = () => {
      const fadeAlpha = 1 - Math.exp(-settings.decayRate / 60)
      if (fadeAlpha > 0.0001) {
        maskGpu.ctx.globalCompositeOperation = 'source-over'
        maskGpu.ctx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha})`
        maskGpu.ctx.fillRect(0, 0, maskGpu.canvas.width, maskGpu.canvas.height)
        maskGpu.texture.needsUpdate = true
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
