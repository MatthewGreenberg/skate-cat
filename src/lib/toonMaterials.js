import * as THREE from 'three'
import { toonVertexShader, toonFragmentShader } from '../shaders/toonShader'
import { outlineVertexShader, outlineFragmentShader } from '../shaders/outlineShader'
import { logToonVertexShader, logToonFragmentShader } from '../shaders/logToonShader'

export function createToonMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: toonVertexShader,
    fragmentShader: toonFragmentShader,
    uniforms: {
      uColor: { value: new THREE.Color('#ffffff') },
      uLightDirection: { value: new THREE.Vector3(4, -7.5, 3) },
      uGlossiness: { value: 1.0 },
      uRimAmount: { value: 0.84 },
      uRimThreshold: { value: 0.28 },
      uSteps: { value: 3.0 },
      uShadowBrightness: { value: 0.20 },
      uBrightness: { value: 1.70 },
      uRimColor: { value: new THREE.Color('#d7dcff') },
      uMap: { value: null },
      uHasMap: { value: 0.0 },
      uAlphaTest: { value: 0.0 },
      uBlinkAmount: { value: 0.0 },
      uLeftEyeCenter: { value: new THREE.Vector2(0.84, 0.60) },
      uRightEyeCenter: { value: new THREE.Vector2(0.66, 0.57) },
      uEyeRadius: { value: new THREE.Vector2(0.08, 0.05) },
      uLidColor: { value: new THREE.Color('#1a1a2e') },
    },
  })
}

export function createOutlineMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: outlineVertexShader,
    fragmentShader: outlineFragmentShader,
    side: THREE.BackSide,
    uniforms: {
      uOutlineColor: { value: new THREE.Color('#000000') },
      uThickness: { value: 0.04 },
    },
  })
}

export function createLogToonMaterial({
  color,
  lightX,
  lightY,
  lightZ,
  glossiness,
  rimAmount,
  rimThreshold,
  steps,
  shadowBrightness,
  brightness,
  rimColor,
}) {
  return new THREE.ShaderMaterial({
    vertexShader: logToonVertexShader,
    fragmentShader: logToonFragmentShader,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uLightDirection: { value: new THREE.Vector3(lightX, lightY, lightZ) },
      uGlossiness: { value: glossiness },
      uRimAmount: { value: rimAmount },
      uRimThreshold: { value: rimThreshold },
      uSteps: { value: steps },
      uShadowBrightness: { value: shadowBrightness },
      uBrightness: { value: brightness },
      uRimColor: { value: new THREE.Color(rimColor) },
    },
  })
}

export function drawShadowBlob(ctx, centerX, centerY, radiusX, radiusY, alpha) {
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 1)
  gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`)
  gradient.addColorStop(0.45, `rgba(255, 255, 255, ${alpha * 0.65})`)
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

  ctx.save()
  ctx.translate(centerX, centerY)
  ctx.scale(radiusX, radiusY)
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(0, 0, 1, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export function createContactShadowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 160
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  drawShadowBlob(ctx, 126, 96, 118, 38, 1)
  drawShadowBlob(ctx, 124, 92, 84, 25, 1)
  drawShadowBlob(ctx, 74, 99, 48, 20, 0.58)
  drawShadowBlob(ctx, 188, 86, 38, 16, 0.34)

  ctx.globalCompositeOperation = 'destination-out'
  drawShadowBlob(ctx, 128, 70, 42, 8, 0.35)
  ctx.globalCompositeOperation = 'source-over'

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}
