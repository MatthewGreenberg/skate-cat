import { useEffect, useMemo, useRef, useState } from 'react'
import { useCursor, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import * as THREE from 'three'

function prepareAsset(scene, { screenMaterialName = null } = {}) {
  const root = scene.clone(true)
  let screenMesh = null

  root.traverse((child) => {
    if (!child.isMesh) return
    child.castShadow = true
    child.receiveShadow = true

    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) => material.clone())
      if (screenMaterialName && child.material.some((material) => material.name === screenMaterialName)) {
        screenMesh = child
      }
    } else if (child.material) {
      child.material = child.material.clone()
      if (screenMaterialName && child.material.name === screenMaterialName) {
        screenMesh = child
      }
    }
  })

  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const screenBox = screenMesh ? new THREE.Box3().setFromObject(screenMesh) : null
  let screenPlanePosition = null
  let screenPlaneRotation = null

  if (screenMesh?.geometry?.attributes?.position && screenBox) {
    const position = screenMesh.geometry.attributes.position
    const index = screenMesh.geometry.index
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    const ab = new THREE.Vector3()
    const ac = new THREE.Vector3()
    const triangleNormal = new THREE.Vector3()
    const averageNormalLocal = new THREE.Vector3()
    const triangleIndexCount = index
      ? Math.min(index.count, 180)
      : Math.min(position.count, 180)

    for (let i = 0; i < triangleIndexCount; i += 3) {
      const ai = index ? index.getX(i) : i
      const bi = index ? index.getX(i + 1) : i + 1
      const ci = index ? index.getX(i + 2) : i + 2

      a.fromBufferAttribute(position, ai)
      b.fromBufferAttribute(position, bi)
      c.fromBufferAttribute(position, ci)
      ab.subVectors(b, a)
      ac.subVectors(c, a)
      triangleNormal.crossVectors(ab, ac)

      if (triangleNormal.lengthSq() > 1e-10) {
        averageNormalLocal.add(triangleNormal.normalize())
      }
    }

    if (averageNormalLocal.lengthSq() > 1e-10) {
      averageNormalLocal.normalize()
      const screenMeshWorldQuat = screenMesh.getWorldQuaternion(new THREE.Quaternion())
      const screenNormalWorld = averageNormalLocal.clone().applyQuaternion(screenMeshWorldQuat).normalize()
      const screenFixQuat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        averageNormalLocal
      )
      const screenPlaneQuat = screenMeshWorldQuat.clone().multiply(screenFixQuat)

      screenPlanePosition = screenBox
        .getCenter(new THREE.Vector3())
        .add(screenNormalWorld.multiplyScalar(0.02))
      screenPlaneRotation = new THREE.Euler().setFromQuaternion(screenPlaneQuat, 'XYZ')
    }
  }

  return {
    root,
    min: box.min.clone(),
    max: box.max.clone(),
    center: box.getCenter(new THREE.Vector3()),
    size: box.getSize(new THREE.Vector3()),
    screenBox: screenBox ? screenBox.clone() : null,
    screenPlanePosition: screenPlanePosition ? screenPlanePosition.clone() : null,
    screenPlaneRotation: screenPlaneRotation ? screenPlaneRotation.clone() : null,
  }
}

const ROOM_BACKGROUND = '#09070a'
const RUG_COLOR = '#3b2324'
const SCREEN_CYAN = '#ffd166'
const SCREEN_ORANGE = '#ef476f'
const WALL_EDGE_COOL = '#6479b8'
const DEFAULT_TV = {
  posX: 0.48,
  posY: 0,
  posZ: -1.1,
  rotY: 3.14,
  scale: 4.44,
}

const DEFAULT_CAT = {
  posX: 0.89,
  posY: 0,
  posZ: -0.1,
  rotX: 0,
  rotY: -0.7,
  rotZ: 0.18,
  scale: 0.03,
}

const DEFAULT_TV_UI = {
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  scaleX: 0.88,
  scaleY: 0.88,
  curve: 0.045,
  glowEnabled: true,
  glowScaleX: 1.03,
  glowScaleY: 1.03,
  glowOpacity: 0.04,
  glowOffsetZ: -0.01,
}

function drawTvScreen(ctx, canvas, time, { hovered = false, buttonLabel = 'PRESS START' } = {}) {
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

  ctx.save()
  // Button fill
  ctx.beginPath()
  ctx.roundRect(buttonX, buttonY, buttonWidth, buttonHeight, 30)
  const btnGradient = ctx.createLinearGradient(0, buttonY, 0, buttonY + buttonHeight)
  btnGradient.addColorStop(0, hovered ? '#ffd299' : '#ffb366')
  btnGradient.addColorStop(1, hovered ? '#ff9b55' : '#ff7a33')
  ctx.fillStyle = btnGradient
  ctx.shadowColor = hovered ? 'rgba(255, 180, 100, 0.8)' : 'rgba(255, 140, 60, 0.5)'
  ctx.shadowBlur = hovered ? 25 : 15
  ctx.fill()

  // Button border
  ctx.lineWidth = 4
  ctx.strokeStyle = 'rgba(255, 250, 240, 0.7)'
  ctx.stroke()

  // Button text
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

function TvScreen({
  position,
  size,
  rotation,
  screenOffset = [0, 0, 0],
  screenRotationOffset = [0, 0, 0],
  sizeScale = [1, 1],
  curveAmount = 0.045,
  showGlow = false,
  glowScale = [1.06, 1.08],
  glowOpacity = 0.05,
  glowOffsetZ = -0.01,
  onStart,
  disabled = false,
  buttonLabel = 'PRESS START',
}) {
  const canvasRef = useRef(null)
  const textureRef = useRef(null)
  const [hovered, setHovered] = useState(false)
  const screenWidth = size[0] * sizeScale[0]
  const screenHeight = size[1] * sizeScale[1]
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
    drawTvScreen(ctx, canvas, state.clock.elapsedTime, { hovered, disabled, buttonLabel })
    texture.needsUpdate = true
  })

  if (!textureRef.current) return null

  return (
    <group position={position} rotation={rotation}>
      <group position={screenOffset} rotation={screenRotationOffset}>
        {showGlow && (
          <mesh geometry={glowGeometry} position={[0, 0, glowOffsetZ]} renderOrder={3}>
            <meshBasicMaterial
              color={SCREEN_CYAN}
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
    </group>
  )
}

export default function IntroScene({ onStart, disabled = false, buttonLabel = 'PRESS START' }) {
  const tvGlowRef = useRef()
  const accentLightRef = useRef()
  const { scene: tvScene } = useGLTF('/crt_tv.glb')
  const { scene: catScene } = useGLTF('/maxwell_the_cat_dingus/scene.gltf')
  const { scene: chairScene } = useGLTF('/intro/sofa_chair.glb')
  const tv = useMemo(() => prepareAsset(tvScene, { screenMaterialName: 'TVScreen' }), [tvScene])
  const cat = useMemo(() => prepareAsset(catScene), [catScene])
  const chair = useMemo(() => prepareAsset(chairScene), [chairScene])
  const floorY = 0
  const screenCenter = useMemo(
    () => tv.screenBox?.getCenter(new THREE.Vector3()) ?? new THREE.Vector3(0, 1.15, 1.0),
    [tv]
  )
  const screenSize = useMemo(
    () => tv.screenBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(2.25, 1.65, 0.02),
    [tv]
  )

  // ── Leva Controls ──────────────────────────────────────────────────────────
  // Camera controls are in CameraRig.jsx under "Intro Scene Camera"

  const tvCtrl = useControls('Intro Scene TV', {
    tvPosX: { value: DEFAULT_TV.posX, min: -5, max: 5, step: 0.01 },
    tvPosY: { value: DEFAULT_TV.posY, min: -5, max: 5, step: 0.01 },
    tvPosZ: { value: DEFAULT_TV.posZ, min: -5, max: 5, step: 0.01 },
    tvRotY: { value: DEFAULT_TV.rotY, min: -Math.PI, max: Math.PI, step: 0.01 },
    tvScale: { value: DEFAULT_TV.scale, min: 0.1, max: 8, step: 0.01 },
  })

  const chairCtrl = useControls('Intro Scene Chair', {
    chairPosX: { value: -1.3, min: -5, max: 5, step: 0.01 },
    chairPosY: { value: 0, min: -5, max: 5, step: 0.01 },
    chairPosZ: { value: -0.1, min: -5, max: 5, step: 0.01 },
    chairRotY: { value: 0.81, min: -Math.PI, max: Math.PI, step: 0.01 },
    chairScale: { value: 1.12, min: 0.1, max: 3, step: 0.01 },
  })

  const catCtrl = useControls('Intro Scene Cat', {
    catPosX: { value: DEFAULT_CAT.posX, min: -5, max: 5, step: 0.01 },
    catPosY: { value: DEFAULT_CAT.posY, min: -5, max: 5, step: 0.01 },
    catPosZ: { value: DEFAULT_CAT.posZ, min: -5, max: 5, step: 0.01 },
    catRotX: { value: DEFAULT_CAT.rotX, min: -Math.PI * 2, max: Math.PI * 2, step: 0.01 },
    catRotY: { value: DEFAULT_CAT.rotY, min: -Math.PI * 2, max: Math.PI * 2, step: 0.01 },
    catRotZ: { value: DEFAULT_CAT.rotZ, min: -Math.PI * 2, max: Math.PI * 2, step: 0.01 },
    catScale: { value: DEFAULT_CAT.scale, min: 0.005, max: 1, step: 0.001 },
  })

  const tvUiCtrl = useControls('Intro Scene TV UI', {
    uiOffsetX: { value: DEFAULT_TV_UI.offsetX, min: -1, max: 1, step: 0.001 },
    uiOffsetY: { value: DEFAULT_TV_UI.offsetY, min: -1, max: 1, step: 0.001 },
    uiOffsetZ: { value: DEFAULT_TV_UI.offsetZ, min: -0.25, max: 0.25, step: 0.001 },
    uiRotX: { value: DEFAULT_TV_UI.rotX, min: -Math.PI, max: Math.PI, step: 0.001 },
    uiRotY: { value: DEFAULT_TV_UI.rotY, min: -Math.PI, max: Math.PI, step: 0.001 },
    uiRotZ: { value: DEFAULT_TV_UI.rotZ, min: -Math.PI, max: Math.PI, step: 0.001 },
    uiScaleX: { value: DEFAULT_TV_UI.scaleX, min: 0.25, max: 1.5, step: 0.001 },
    uiScaleY: { value: DEFAULT_TV_UI.scaleY, min: 0.25, max: 1.5, step: 0.001 },
    uiCurve: { value: DEFAULT_TV_UI.curve, min: 0, max: 0.2, step: 0.001 },
    glowEnabled: DEFAULT_TV_UI.glowEnabled,
    glowScaleX: { value: DEFAULT_TV_UI.glowScaleX, min: 0.5, max: 1.5, step: 0.001 },
    glowScaleY: { value: DEFAULT_TV_UI.glowScaleY, min: 0.5, max: 1.5, step: 0.001 },
    glowOpacity: { value: DEFAULT_TV_UI.glowOpacity, min: 0, max: 0.2, step: 0.001 },
    glowOffsetZ: { value: DEFAULT_TV_UI.glowOffsetZ, min: -0.25, max: 0.25, step: 0.001 },
  })

  // ── Derived values ─────────────────────────────────────────────────────────

  const tvPosition = useMemo(
    () => new THREE.Vector3(
      tvCtrl.tvPosX,
      floorY + tvCtrl.tvPosY - tv.min.y * tvCtrl.tvScale,
      tvCtrl.tvPosZ
    ),
    [floorY, tv, tvCtrl.tvPosX, tvCtrl.tvPosY, tvCtrl.tvPosZ, tvCtrl.tvScale]
  )
  const screenWorld = useMemo(
    () => screenCenter
      .clone()
      .multiplyScalar(tvCtrl.tvScale)
      .applyEuler(new THREE.Euler(0, tvCtrl.tvRotY, 0))
      .add(tvPosition),
    [screenCenter, tvCtrl.tvRotY, tvCtrl.tvScale, tvPosition]
  )
  const tvForward = useMemo(
    () => new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, tvCtrl.tvRotY, 0)),
    [tvCtrl.tvRotY]
  )
  const backWallZ = screenWorld.z - 2.88
  const tvPanelCenterY = floorY + 1.95
  const defaultLampPosition = useMemo(
    () => new THREE.Vector3(tvPosition.x + 2.45, floorY, tvPosition.z + 0.95),
    [floorY, tvPosition]
  )
  const lampCtrl = useControls('Intro Scene Lamp', {
    lampPosX: { value: defaultLampPosition.x, min: -5, max: 5, step: 0.01 },
    lampPosY: { value: defaultLampPosition.y, min: -5, max: 5, step: 0.01 },
    lampPosZ: { value: defaultLampPosition.z, min: -5, max: 5, step: 0.01 },
    lampRotX: { value: 0, min: -Math.PI, max: Math.PI, step: 0.01 },
    lampRotY: { value: 0, min: -Math.PI, max: Math.PI, step: 0.01 },
    lampRotZ: { value: 0, min: -Math.PI, max: Math.PI, step: 0.01 },
    lampScale: { value: 1, min: 0.25, max: 3, step: 0.01 },
  })

  // ── Animation ──────────────────────────────────────────────────────────────

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (tvGlowRef.current) {
      tvGlowRef.current.intensity = 21.5 + Math.sin(t * 8.4) * 1.2 + Math.sin(t * 15.5) * 0.5
    }
    if (accentLightRef.current) {
      accentLightRef.current.intensity = 6.4 + Math.sin(t * 2.6) * 0.55
    }
  })

  return (
    <>
      <color attach="background" args={[ROOM_BACKGROUND]} />
      <fog attach="fog" args={[ROOM_BACKGROUND, 4, 13]} />

      <ambientLight intensity={0.16} color="#251922" />
      <hemisphereLight args={['#8e7464', '#08070b', 0.15]} />

      {/* TV light — warm golden glow */}
      <pointLight
        ref={tvGlowRef}
        position={[screenWorld.x + tvForward.x * 0.5, screenWorld.y, screenWorld.z + tvForward.z * 0.5]}
        intensity={21.5}
        distance={11.5}
        decay={1.7}
        color={SCREEN_CYAN}
      />
      {/* Soft warm TV bounce near the floor and cabinet */}
      <pointLight
        ref={accentLightRef}
        position={[screenWorld.x + tvForward.x * 0.85, floorY + 0.28, screenWorld.z + tvForward.z * 0.9]}
        intensity={6.4}
        distance={7.8}
        decay={1.85}
        color="#ff9f68"
      />
      <spotLight
        position={[screenWorld.x + tvForward.x * 0.2, screenWorld.y + 0.15, screenWorld.z + tvForward.z * 0.15]}
        intensity={20}
        angle={0.78}
        penumbra={0.8}
        distance={12}
        decay={1.7}
        color="#ffd6a0"
        castShadow={false}
      />
      <pointLight
        position={[screenWorld.x, tvPanelCenterY + 0.7, backWallZ + 0.95]}
        intensity={3.8}
        distance={6.4}
        decay={2}
        color="#ffcf96"
      />
      <pointLight
        position={[lampCtrl.lampPosX - 0.2 * lampCtrl.lampScale, lampCtrl.lampPosY + 2.2 * lampCtrl.lampScale, lampCtrl.lampPosZ + 0.1 * lampCtrl.lampScale]}
        intensity={5.2}
        distance={7.8}
        decay={1.9}
        color="#ffd4a8"
      />
      <pointLight
        position={[3.55, 2.45, -2.0]}
        intensity={2.6}
        distance={6.8}
        decay={2}
        color={WALL_EDGE_COOL}
      />
      {/* Warm floor lamp */}
      <pointLight position={[lampCtrl.lampPosX, lampCtrl.lampPosY + 1.66 * lampCtrl.lampScale, lampCtrl.lampPosZ]} intensity={4.6} distance={6.4} decay={1.7} color="#ffd8ac" />

      {/* Soft fill light to illuminate the front of the cat */}
      <spotLight position={[0.7, 2.6, 3.2]} intensity={0.6} color="#ffd9b4" distance={6.4} decay={2} castShadow={false} />

      {/* Warm rim light from behind */}
      <pointLight position={[0.2, 1.7, -3.1]} intensity={1.35} distance={4.8} decay={2} color="#7e5f79" />

      {/* Key light on cat from the front-right */}
      <pointLight position={[1.85, 0.72, 0.72]} intensity={2.4} distance={4.1} decay={1.95} color="#ffc996" />

      {/* ── Room geometry ───────────────────────────────────────────────────── */}
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.5, floorY - 0.01, -1.0]} receiveShadow>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial color="#171117" roughness={0.96} metalness={0.0} />
      </mesh>

      {/* Area rug */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.5, floorY + 0.005, -0.8]}>
        <planeGeometry args={[5.5, 3.8]} />
        <meshStandardMaterial color={RUG_COLOR} roughness={0.95} metalness={0.01} />
      </mesh>

      {/* Back wall */}
      <group position={[0.5, floorY + 2.15, backWallZ]}>
        <mesh position={[0, 0, -0.12]} receiveShadow>
          <boxGeometry args={[11.2, 4.7, 0.24]} />
          <meshStandardMaterial color="#0d0a0f" roughness={0.97} />
        </mesh>
        <mesh position={[0, 0, 0.01]} receiveShadow>
          <planeGeometry args={[10.95, 4.5]} />
          <meshStandardMaterial color="#18131c" roughness={0.92} emissive="#1a1020" emissiveIntensity={0.04} />
        </mesh>
        <mesh position={[0, -1.45, 0.025]} receiveShadow>
          <planeGeometry args={[10.95, 1.2]} />
          <meshStandardMaterial color="#120d13" roughness={0.95} />
        </mesh>
        <mesh position={[0, -0.82, 0.05]} receiveShadow>
          <boxGeometry args={[11.0, 0.08, 0.08]} />
          <meshStandardMaterial color="#281922" roughness={0.78} />
        </mesh>
        <mesh position={[0, 2.16, 0.055]} receiveShadow>
          <boxGeometry args={[11.0, 0.1, 0.08]} />
          <meshStandardMaterial color="#1a1018" roughness={0.82} />
        </mesh>
        <mesh position={[0, -2.09, 0.06]} receiveShadow>
          <boxGeometry args={[11.05, 0.16, 0.09]} />
          <meshStandardMaterial color="#24161f" roughness={0.72} />
        </mesh>
        <mesh position={[-3.25, 0.08, 0.04]} receiveShadow>
          <boxGeometry args={[0.09, 4.18, 0.07]} />
          <meshStandardMaterial color="#21141d" roughness={0.82} />
        </mesh>
        <mesh position={[3.25, 0.08, 0.04]} receiveShadow>
          <boxGeometry args={[0.09, 4.18, 0.07]} />
          <meshStandardMaterial color="#21141d" roughness={0.82} />
        </mesh>
      </group>
      <mesh position={[screenWorld.x, tvPanelCenterY, backWallZ + 0.04]} receiveShadow>
        <planeGeometry args={[4.0, 2.85]} />
        <meshStandardMaterial color="#221722" roughness={0.84} emissive="#341f2a" emissiveIntensity={0.08} />
      </mesh>
      <mesh position={[screenWorld.x, tvPanelCenterY + 1.46, backWallZ + 0.065]} receiveShadow>
        <boxGeometry args={[4.22, 0.08, 0.08]} />
        <meshStandardMaterial color="#2a1823" roughness={0.76} />
      </mesh>
      <mesh position={[screenWorld.x, tvPanelCenterY - 1.46, backWallZ + 0.065]} receiveShadow>
        <boxGeometry args={[4.22, 0.08, 0.08]} />
        <meshStandardMaterial color="#2a1823" roughness={0.76} />
      </mesh>
      <mesh position={[screenWorld.x - 2.07, tvPanelCenterY, backWallZ + 0.065]} receiveShadow>
        <boxGeometry args={[0.08, 2.92, 0.08]} />
        <meshStandardMaterial color="#2a1823" roughness={0.76} />
      </mesh>
      <mesh position={[screenWorld.x + 2.07, tvPanelCenterY, backWallZ + 0.065]} receiveShadow>
        <boxGeometry args={[0.08, 2.92, 0.08]} />
        <meshStandardMaterial color="#2a1823" roughness={0.76} />
      </mesh>
      {/* Left wall */}
      <mesh position={[-4.0, floorY + 2.2, -0.5]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[9, 5.5]} />
        <meshStandardMaterial color="#100c12" roughness={0.92} />
      </mesh>
      {/* Right wall */}
      <mesh position={[4.5, floorY + 2.2, -0.5]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[9, 5.5]} />
        <meshStandardMaterial color="#100c12" roughness={0.92} />
      </mesh>
      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0.5, floorY + 4.4, -0.5]} receiveShadow>
        <planeGeometry args={[11, 11]} />
        <meshStandardMaterial color="#0b090d" roughness={0.98} />
      </mesh>

      {/* ── Floor lamp (right of TV) ─────────────────────────────────────────── */}
      <group
        position={[lampCtrl.lampPosX, lampCtrl.lampPosY, lampCtrl.lampPosZ]}
        rotation={[lampCtrl.lampRotX, lampCtrl.lampRotY, lampCtrl.lampRotZ]}
        scale={lampCtrl.lampScale}
      >
        {/* Pole */}
        <mesh position={[0, 0.88, 0]} castShadow>
          <cylinderGeometry args={[0.025, 0.03, 1.76, 10]} />
          <meshStandardMaterial color="#2a1a22" metalness={0.45} roughness={0.55} />
        </mesh>
        {/* Base */}
        <mesh position={[0, 0.015, 0]}>
          <cylinderGeometry args={[0.18, 0.2, 0.03, 16]} />
          <meshStandardMaterial color="#1e1018" metalness={0.4} roughness={0.6} />
        </mesh>
        {/* Shade */}
        <mesh position={[0, 1.88, 0]} rotation={[Math.PI, 0, 0]} castShadow>
          <coneGeometry args={[0.26, 0.38, 16, 1, true]} />
          <meshStandardMaterial color="#d4954a" roughness={0.42} side={THREE.DoubleSide} emissive="#ffae62" emissiveIntensity={0.28} />
        </mesh>
        {/* Bulb */}
        <mesh position={[0, 1.67, 0]}>
          <sphereGeometry args={[0.08, 18, 18]} />
          <meshStandardMaterial color="#fff3d1" emissive="#ffd79e" emissiveIntensity={2.8} toneMapped={false} />
        </mesh>
      </group>
      {/* Subtle wall accent — framed art */}
      <mesh position={[screenWorld.x - 1.6, floorY + 2.0, screenWorld.z - 2.74]} receiveShadow>
        <planeGeometry args={[0.6, 0.8]} />
        <meshStandardMaterial color="#221723" roughness={0.84} emissive="#13111a" emissiveIntensity={0.05} />
      </mesh>
      <mesh position={[screenWorld.x - 1.6, floorY + 2.0, screenWorld.z - 2.73]}>
        <planeGeometry args={[0.52, 0.72]} />
        <meshStandardMaterial color="#3b2a3a" roughness={0.78} emissive="#221630" emissiveIntensity={0.08} />
      </mesh>

      {/* ── Chair ─────────────────────────────────────────────────────────────── */}
      <primitive
        object={chair.root}
        position={[chairCtrl.chairPosX, floorY + chairCtrl.chairPosY - chair.min.y * chairCtrl.chairScale, chairCtrl.chairPosZ]}
        rotation={[0, chairCtrl.chairRotY, 0]}
        scale={chairCtrl.chairScale}
      />

      {/* ── TV scene group ───────────────────────────────────────────────────── */}
      <group position={[tvPosition.x, tvPosition.y, tvPosition.z]} rotation={[0, tvCtrl.tvRotY, 0]} scale={tvCtrl.tvScale}>
        <primitive object={tv.root} />
        <TvScreen
          position={tv.screenPlanePosition?.toArray() ?? [screenCenter.x, screenCenter.y, screenCenter.z + 0.015]}
          rotation={tv.screenPlaneRotation ? [tv.screenPlaneRotation.x, tv.screenPlaneRotation.y, tv.screenPlaneRotation.z] : [0, 0, 0]}
          screenOffset={[tvUiCtrl.uiOffsetX, tvUiCtrl.uiOffsetY, tvUiCtrl.uiOffsetZ]}
          screenRotationOffset={[tvUiCtrl.uiRotX, tvUiCtrl.uiRotY, tvUiCtrl.uiRotZ]}
          size={screenSize.toArray()}
          sizeScale={[tvUiCtrl.uiScaleX, tvUiCtrl.uiScaleY]}
          curveAmount={tvUiCtrl.uiCurve}
          showGlow={tvUiCtrl.glowEnabled}
          glowScale={[tvUiCtrl.glowScaleX, tvUiCtrl.glowScaleY]}
          glowOpacity={tvUiCtrl.glowOpacity}
          glowOffsetZ={tvUiCtrl.glowOffsetZ}
          onStart={onStart}
          disabled={disabled}
          buttonLabel={buttonLabel}
        />
      </group>

      {/* ── Cat (independent of TV group) ──────────────────────────────────── */}
      {cat.root && (
        <primitive
          object={cat.root}
          position={[catCtrl.catPosX, floorY + catCtrl.catPosY - cat.min.y * catCtrl.catScale, catCtrl.catPosZ]}
          rotation={[catCtrl.catRotX, catCtrl.catRotY, catCtrl.catRotZ]}
          scale={catCtrl.catScale}
        />
      )}
    </>
  )
}

useGLTF.preload('/crt_tv.glb')
useGLTF.preload('/maxwell_the_cat_dingus/scene.gltf')
useGLTF.preload('/intro/sofa_chair.glb')
