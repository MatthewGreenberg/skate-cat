import { useEffect, useMemo, useRef, useState } from 'react'
import { useCursor } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const SCREEN_CYAN = '#55ddee'

function drawTvScreen(ctx, canvas, time, { hovered = false }) {
  const { width, height } = canvas
  const flicker = 0.95 + Math.sin(time * 12) * 0.02

  ctx.clearRect(0, 0, width, height)
  ctx.globalAlpha = flicker

  // Cozy sunset background
  const bgGradient = ctx.createLinearGradient(0, 0, 0, height)
  bgGradient.addColorStop(0, '#3a1f4a')
  bgGradient.addColorStop(0.4, '#8b3a58')
  bgGradient.addColorStop(0.7, '#d66b53')
  bgGradient.addColorStop(1, '#ffb870')
  ctx.fillStyle = bgGradient
  ctx.fillRect(0, 0, width, height)

  // Soft scanlines
  ctx.fillStyle = 'rgba(20, 10, 15, 0.15)'
  for (let y = 0; y < height; y += 6) {
    ctx.fillRect(0, y, width, 2)
  }

  // Glowing sun
  const sunGradient = ctx.createRadialGradient(width * 0.5, height * 0.4, 0, width * 0.5, height * 0.4, width * 0.35)
  sunGradient.addColorStop(0, 'rgba(255, 240, 200, 0.95)')
  sunGradient.addColorStop(0.3, 'rgba(255, 180, 100, 0.8)')
  sunGradient.addColorStop(1, 'rgba(255, 120, 50, 0)')
  ctx.fillStyle = sunGradient
  ctx.fillRect(0, 0, width, height)

  ctx.globalAlpha = 1
  ctx.textAlign = 'center'

  // Title
  ctx.shadowColor = 'rgba(255, 150, 80, 0.6)'
  ctx.shadowBlur = 20
  ctx.fillStyle = '#fff9f0'
  ctx.font = '900 120px "Arial Black", sans-serif'
  ctx.fillText('SKATE', width * 0.5, height * 0.35)
  ctx.fillText('CAT', width * 0.5, height * 0.52)

  // Subtitle
  ctx.shadowBlur = 10
  ctx.shadowColor = 'rgba(255, 100, 50, 0.5)'
  ctx.fillStyle = '#ffe0cc'
  ctx.font = '700 32px "Nunito", sans-serif'
  ctx.letterSpacing = '4px'
  ctx.fillText('LATE NIGHT SESSION', width * 0.5, height * 0.65)
  ctx.letterSpacing = '0px'

  // Interactive Button
  const buttonScale = hovered ? 1.05 : 1
  const buttonWidth = width * 0.42 * buttonScale
  const buttonHeight = height * 0.12 * buttonScale
  const buttonX = width * 0.5 - buttonWidth / 2
  const buttonY = height * 0.78 - buttonHeight / 2
  const buttonLabel = 'PRESS START'

  ctx.save()
  ctx.beginPath()
  ctx.roundRect(buttonX, buttonY, buttonWidth, buttonHeight, 30)
  const btnGradient = ctx.createLinearGradient(0, buttonY, 0, buttonY + buttonHeight)
  btnGradient.addColorStop(0, hovered ? '#ffd299' : '#ffb366')
  btnGradient.addColorStop(1, hovered ? '#ff9b55' : '#ff7a33')
  ctx.fillStyle = btnGradient
  ctx.shadowColor = hovered ? 'rgba(255, 180, 100, 0.8)' : 'rgba(255, 140, 60, 0.5)'
  ctx.shadowBlur = hovered ? 25 : 15
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = 'rgba(255, 250, 240, 0.7)'
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.fillStyle = '#ffffff'
  ctx.font = '800 36px "Nunito", sans-serif'
  ctx.fillText(buttonLabel, width * 0.5, buttonY + buttonHeight * 0.66)
  ctx.restore()

  // Soft dust motes
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < 30; i += 1) {
    const px = (Math.sin(time * 0.2 + i * 2.1) * 0.5 + 0.5) * width
    const py = (Math.cos(time * 0.15 + i * 1.3) * 0.5 + 0.5) * height
    ctx.globalAlpha = (Math.sin(time * 1.5 + i) * 0.5 + 0.5) * 0.4
    ctx.beginPath()
    ctx.arc(px, py, 1.5 + (i % 2), 0, Math.PI * 2)
    ctx.fill()
  }
}

function createCurvedScreenGeometry(width, height, curveDepth, widthSegments = 28, heightSegments = 20) {
  const geometry = new THREE.PlaneGeometry(width, height, widthSegments, heightSegments)
  const position = geometry.attributes.position
  const vertex = new THREE.Vector3()

  for (let i = 0; i < position.count; i += 1) {
    vertex.fromBufferAttribute(position, i)
    const xNorm = width === 0 ? 0 : vertex.x / (width * 0.5)
    const yNorm = height === 0 ? 0 : vertex.y / (height * 0.5)
    const falloff = Math.max(0, 1 - (xNorm * xNorm + yNorm * yNorm) * 0.5)
    vertex.z = curveDepth * falloff
    position.setXYZ(i, vertex.x, vertex.y, vertex.z)
  }

  position.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

export default function TvScreen({
  position,
  size,
  rotation,
  curveAmount = 0.045,
  showGlow = false,
  glowScale = [1.06, 1.08],
  glowOpacity = 0.05,
  glowColor = SCREEN_CYAN,
  onStart,
  disabled = false,
}) {
  const canvasRef = useRef(null)
  const textureRef = useRef(null)
  const [hovered, setHovered] = useState(false)
  const screenWidth = size[0]
  const screenHeight = size[1]
  const glowWidth = screenWidth * glowScale[0]
  const glowHeight = screenHeight * glowScale[1]
  const curveDepth = Math.max(screenWidth, screenHeight) * curveAmount

  const screenGeometry = useMemo(
    () => createCurvedScreenGeometry(screenWidth, screenHeight, curveDepth),
    [curveDepth, screenHeight, screenWidth]
  )
  const glowGeometry = useMemo(
    () => createCurvedScreenGeometry(glowWidth, glowHeight, curveDepth * 0.9),
    [curveDepth, glowHeight, glowWidth]
  )
  useCursor(hovered && !disabled)

  if (!textureRef.current && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 1024
    canvasRef.current = canvas
    const nextTexture = new THREE.CanvasTexture(canvas)
    nextTexture.flipY = true
    nextTexture.colorSpace = THREE.SRGBColorSpace
    nextTexture.anisotropy = 8
    textureRef.current = nextTexture
  }

  useEffect(() => {
    if (disabled) setHovered(false)
  }, [disabled])

  useEffect(() => () => {
    screenGeometry.dispose()
    glowGeometry.dispose()
  }, [glowGeometry, screenGeometry])

  useEffect(() => () => textureRef.current?.dispose(), [])

  useEffect(() => {
    if (disabled) return undefined
    const onKeyDown = (event) => {
      if (event.repeat) return
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onStart?.()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [disabled, onStart])

  useFrame((state) => {
    const canvas = canvasRef.current
    const texture = textureRef.current
    if (!canvas || !texture) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawTvScreen(ctx, canvas, state.clock.elapsedTime, { hovered })
    texture.needsUpdate = true
  })

  if (!textureRef.current) return null

  return (
    <group position={position} rotation={rotation}>
      {showGlow && (
        <mesh geometry={glowGeometry} position={[0, 0, -0.01]} renderOrder={3}>
          <meshBasicMaterial
            color={glowColor}
            toneMapped={false}
            transparent
            opacity={glowOpacity}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            depthTest={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      <mesh
        geometry={screenGeometry}
        renderOrder={4}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onPointerDown={(event) => {
          event.stopPropagation()
          if (!disabled) onStart?.()
        }}
      >
        <meshBasicMaterial map={textureRef.current} toneMapped={false} depthTest={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}
