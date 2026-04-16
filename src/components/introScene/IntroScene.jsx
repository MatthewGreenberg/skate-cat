/**
 * CRT TV room intro: loads TV / cat / chair GLTFs, Leva tuning, animated lights, procedural room, curved UI screen + start.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Center, Text3D, useGLTF, useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { folder } from 'leva'
import * as THREE from 'three'
import helvetikerBoldUrl from 'three/examples/fonts/helvetiker_bold.typeface.json?url'
import { useOptionalControls } from '../../lib/debugControls'
import { configureKTX2Loader } from '../../lib/ktx2Loader'
import { createContactShadowTexture } from '../../lib/toonMaterials'
import {
  DEFAULT_CAT,
  DEFAULT_TV,
  DEFAULT_TV_CRT,
  DEFAULT_TV_UI,
} from './constants'
import { IntroLighting } from './IntroLighting'
import { IntroRoom } from './IntroRoom'
import { prepareAsset } from './prepareAsset'
import { createFloorTexture, createWallTexture } from './textures'
import { TvScreen } from './TvScreen'

const CAT_BREATH_DURATION = 1.15
const CAT_BREATH_SCALE_AMOUNT = 0.045
const MEOW_BURST_DURATION = 0.9
const CARTRIDGE_EJECT_DURATION = 0.7
const MAX_CONCURRENT_MEOWS = 8
const MEOW_SLOT_INDICES = Array.from({ length: MAX_CONCURRENT_MEOWS }, (_, index) => index)

export default function IntroScene({
  onStart,
  onDismiss,
  onAction,
  quality = 'auto',
  disabled = false,
  buttonLabel = 'PRESS START',
  instructionLabel = 'SPACE / ENTER TO SHRED',
  screenMode = 'title',
  summary = null,
  showDismissButton = false,
  bootVisualMix = 1,
  bootStatusLabel = 'SYNCING STAGE',
  bootProgress = 0,
  bootReady = false,
  highScore = 0,
  leaderboards = { daily: [], weekly: [], alltime: [] },
  leaderboardTab = 'alltime',
  initialsEntry = null,
  renderProfile = {},
}) {
  const { camera, gl } = useThree()
  const tvGlowRef = useRef()
  const accentLightRef = useRef()
  const heroSpotlightRef = useRef()
  const sweepSpotlightRef = useRef()
  const sweepSpotlightTargetRef = useRef()
  const boardGlowRef = useRef()
  const shadowTargetRef = useRef()
  const catGroupRef = useRef()
  const catBreathElapsedRef = useRef(CAT_BREATH_DURATION)
  const meowAnchorRefs = useRef([])
  const meowBillboardRefs = useRef([])
  const meowMaterialRefs = useRef([])
  const meowSpawnCountRef = useRef(0)
  const meowBurstsRef = useRef(
    MEOW_SLOT_INDICES.map(() => ({
      elapsed: MEOW_BURST_DURATION,
      lateral: 0,
      rise: 0,
      depth: 0,
      swayPhase: 0,
      twist: 0,
    }))
  )
  const chairGroupRef = useRef()
  const chairSpinRef = useRef({ progress: 0, target: 0 })
  const cartridgeGroupRef = useRef()
  const cartridgeEjectRef = useRef({ progress: 1, active: false })
  const crtGlitchRef = useRef(0)
  const skateboardGroupRef = useRef()
  const kickflipRef = useRef({ progress: 1, active: false })
  const { scene: tvScene } = useGLTF(
    '/models/intro/crt_tv.glb',
    false,
    false,
    (loader) => configureKTX2Loader(loader, gl)
  )
  const { scene: catScene } = useGLTF('/models/cat/scene.gltf')
  const { scene: chairScene } = useGLTF(
    '/models/intro/office_chair.glb',
    false,
    false,
    (loader) => configureKTX2Loader(loader, gl)
  )
  const { scene: cartridgeScene } = useGLTF(
    '/models/intro/duck_hunt_cartridge.glb',
    false,
    false,
    (loader) => configureKTX2Loader(loader, gl)
  )
  const { scene: skateboardScene } = useGLTF(
    '/models/intro/skateboard.glb',
    false,
    false,
    (loader) => configureKTX2Loader(loader, gl)
  )
  const { scene: octocatScene } = useGLTF(
    '/models/github_octocat.glb',
    false,
    false,
    (loader) => configureKTX2Loader(loader, gl)
  )
  const tv = useMemo(() => prepareAsset(tvScene, { screenMaterialName: 'TVScreen' }), [tvScene])
  const cat = useMemo(() => prepareAsset(catScene), [catScene])
  const chair = useMemo(() => prepareAsset(chairScene), [chairScene])
  const cartridge = useMemo(() => prepareAsset(cartridgeScene), [cartridgeScene])
  const skateboard = useMemo(() => prepareAsset(skateboardScene), [skateboardScene])
  const octocat = useMemo(() => prepareAsset(octocatScene), [octocatScene])
  const { diffusion: woodDiffuse, normal: woodNormal } = useTexture({
    diffusion: '/textures/wood/diffusion.webp',
    normal: '/textures/wood/normal.webp',
  })
  const posterTexture = useTexture('/textures/poster.webp')
  const phishPosterTexture = useTexture('/textures/phish.webp')
  const [posterMode, setPosterMode] = useState('original')
  const posterModeRef = useRef(posterMode)
  const posterFadeTargetRef = useRef(0)
  useEffect(() => {
    posterModeRef.current = posterMode
    posterFadeTargetRef.current = posterMode === 'phish' ? 1 : 0
  }, [posterMode])
  const phishAudioRef = useRef(null)
  useEffect(() => {
    if (typeof Audio === 'undefined') return undefined
    const audio = new Audio('/audio/sfx/suzy.mp3')
    audio.volume = 0.5
    phishAudioRef.current = audio
    return () => {
      audio.pause()
      phishAudioRef.current = null
    }
  }, [])
  const handlePosterClick = useCallback(() => {
    const prev = posterModeRef.current
    const next = prev === 'phish' ? 'original' : 'phish'
    setPosterMode(next)
    if (prev === 'original' && next === 'phish') {
      const audio = phishAudioRef.current
      if (audio) {
        audio.currentTime = 0
        audio.play().catch(() => {})
      }
    }
  }, [])
  const floorTexture = useMemo(() => createFloorTexture(), [])
  const wallTexture = useMemo(() => createWallTexture(), [])
  const floorY = 0
  const screenCenter = useMemo(
    () => tv.screenBox?.getCenter(new THREE.Vector3()) ?? new THREE.Vector3(0, 1.15, 1.0),
    [tv]
  )
  const screenSize = useMemo(
    () => tv.screenBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(2.25, 1.65, 0.02),
    [tv]
  )

  const tvCtrl = useOptionalControls('Intro', {
    TV: folder({
      tvPosX: { value: DEFAULT_TV.posX, min: -5, max: 5, step: 0.01 },
      tvPosY: { value: DEFAULT_TV.posY, min: -5, max: 5, step: 0.01 },
      tvPosZ: { value: DEFAULT_TV.posZ, min: -5, max: 5, step: 0.01 },
      tvRotY: { value: DEFAULT_TV.rotY, min: -Math.PI, max: Math.PI, step: 0.01 },
      tvScale: { value: DEFAULT_TV.scale, min: 0.1, max: 8, step: 0.01 },
    }),
  }, [])

  const chairCtrl = useOptionalControls('Intro', {
    Chair: folder({
      chairPosX: { value: -0.8, min: -5, max: 5, step: 0.01 },
      chairPosY: { value: 0, min: -5, max: 5, step: 0.01 },
      chairPosZ: { value: -0.1, min: -5, max: 5, step: 0.01 },
      chairRotY: { value: 0.81, min: -Math.PI, max: Math.PI, step: 0.01 },
      chairScale: { value: 1.79, min: 0.1, max: 3, step: 0.01 },
    }),
  }, [])

  const catCtrl = useOptionalControls('Intro', {
    Cat: folder({
      catPosX: { value: DEFAULT_CAT.posX, min: -5, max: 5, step: 0.01 },
      catPosY: { value: DEFAULT_CAT.posY, min: -5, max: 5, step: 0.01 },
      catPosZ: { value: DEFAULT_CAT.posZ, min: -5, max: 5, step: 0.01 },
      catRotX: { value: DEFAULT_CAT.rotX, min: -Math.PI * 2, max: Math.PI * 2, step: 0.01 },
      catRotY: { value: DEFAULT_CAT.rotY, min: -Math.PI * 2, max: Math.PI * 2, step: 0.01 },
      catRotZ: { value: DEFAULT_CAT.rotZ, min: -Math.PI * 2, max: Math.PI * 2, step: 0.01 },
      catScale: { value: DEFAULT_CAT.scale, min: 0.005, max: 1, step: 0.001 },
    }),
  }, [])

  const cartridgeCtrl = useOptionalControls('Intro', {
    Cartridge: folder({
      cartridgePosX: { value: 0.83, min: -5, max: 5, step: 0.01 },
      cartridgePosY: { value: 0.06, min: -5, max: 5, step: 0.01 },
      cartridgePosZ: { value: 0, min: -5, max: 5, step: 0.01 },
      cartridgeRotX: { value: -1.2, min: -Math.PI * 2, max: Math.PI * 2, step: 0.01 },
      cartridgeRotY: { value: 0, min: -Math.PI * 2, max: Math.PI * 2, step: 0.01 },
      cartridgeRotZ: { value: -0.8, min: -Math.PI * 2, max: Math.PI * 2, step: 0.01 },
      cartridgeScale: { value: 0.00008, min: 0.00001, max: 0.01, step: 0.00001 },
    }),
  }, [])
  const skateboardPosition = [0.31, floorY + 1.99, -1.0]
  const skateboardRotation = [0.35, -4.5, 0]
  const skateboardScale = 0.24 * 0.01

  const octocatCtrl = useOptionalControls('Intro', {
    Octocat: folder({
      octocatPosX: { value: 0.9, min: -5, max: 5, step: 0.01 },
      octocatPosY: { value: 1.99, min: -5, max: 5, step: 0.01 },
      octocatPosZ: { value: -1.2, min: -5, max: 5, step: 0.01 },
      octocatRotX: { value: -0.1, min: -Math.PI * 2, max: Math.PI * 2, step: 0.01 },
      octocatRotY: { value: -0.4, min: -Math.PI * 2, max: Math.PI * 2, step: 0.01 },
      octocatRotZ: { value: 0, min: -Math.PI * 2, max: Math.PI * 2, step: 0.01 },
      octocatScale: { value: 0.03, min: 0.001, max: 2, step: 0.001 },
    }),
  }, [])

  const tvUiCtrl = useOptionalControls('Intro', {
    'TV UI': folder({
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
    }),
  }, [])
  const tvCrtCtrl = useOptionalControls('Intro', {
    'TV CRT': folder({
      crtWarp: { value: DEFAULT_TV_CRT.warp, min: 0, max: 0.12, step: 0.001 },
      crtAberration: { value: DEFAULT_TV_CRT.aberration, min: 0, max: 0.01, step: 0.0001 },
      crtEdgeAberration: { value: DEFAULT_TV_CRT.edgeAberration, min: 0, max: 0.02, step: 0.0001 },
      crtHoverBoost: { value: DEFAULT_TV_CRT.hoverBoost, min: 0, max: 1, step: 0.01 },
      crtScanlineIntensity: { value: DEFAULT_TV_CRT.scanlineIntensity, min: 0, max: 0.35, step: 0.005 },
      crtScanlineDensity: { value: DEFAULT_TV_CRT.scanlineDensity, min: 100, max: 1800, step: 10 },
      crtGrilleIntensity: { value: DEFAULT_TV_CRT.grilleIntensity, min: 0, max: 0.12, step: 0.002 },
      crtGrilleDensity: { value: DEFAULT_TV_CRT.grilleDensity, min: 200, max: 2400, step: 20 },
      crtRollIntensity: { value: DEFAULT_TV_CRT.rollIntensity, min: 0, max: 0.2, step: 0.005 },
      crtRollSpeed: { value: DEFAULT_TV_CRT.rollSpeed, min: 0, max: 0.5, step: 0.005 },
      crtNoiseIntensity: { value: DEFAULT_TV_CRT.noiseIntensity, min: 0, max: 0.1, step: 0.002 },
      crtVignetteStrength: { value: DEFAULT_TV_CRT.vignetteStrength, min: 0.3, max: 2, step: 0.01 },
      crtVignetteStart: { value: DEFAULT_TV_CRT.vignetteStart, min: 0, max: 0.8, step: 0.01 },
      crtBrightness: { value: DEFAULT_TV_CRT.brightness, min: 0.6, max: 1.6, step: 0.01 },
      crtBlackLevel: { value: DEFAULT_TV_CRT.blackLevel, min: 0, max: 0.08, step: 0.001 },
      crtPowerOnDuration: { value: DEFAULT_TV_CRT.powerOnDuration, min: 0.05, max: 2, step: 0.01 },
    }),
  }, [])
  const posterCtrl = useOptionalControls('Intro', {
    Poster: folder({
      posterVisible: true,
      posterPosX: { value: 2.54, min: -5, max: 5, step: 0.01 },
      posterPosY: { value: -0.18, min: -2, max: 2.5, step: 0.01 },
      posterPosZ: { value: 0.07, min: -0.2, max: 0.25, step: 0.001 },
      posterRotZ: { value: 0, min: -Math.PI, max: Math.PI, step: 0.001 },
      posterScale: { value: 1.08, min: 0.4, max: 2.5, step: 0.01 },
      posterMaxWidth: { value: 1.08, min: 0.3, max: 2.4, step: 0.01 },
      posterMaxHeight: { value: 1.48, min: 0.4, max: 3.2, step: 0.01 },
    }),
  }, [])

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
  const catPosition = useMemo(
    () => new THREE.Vector3(
      catCtrl.catPosX,
      floorY + catCtrl.catPosY - cat.min.y * catCtrl.catScale,
      catCtrl.catPosZ
    ),
    [cat, catCtrl.catPosX, catCtrl.catPosY, catCtrl.catPosZ, catCtrl.catScale, floorY]
  )
  const catRotation = useMemo(
    () => new THREE.Euler(catCtrl.catRotX, catCtrl.catRotY, catCtrl.catRotZ),
    [catCtrl.catRotX, catCtrl.catRotY, catCtrl.catRotZ]
  )
  const catWorldSize = useMemo(
    () => cat.size.clone().multiplyScalar(catCtrl.catScale),
    [cat, catCtrl.catScale]
  )
  const catContactShadowTexture = useMemo(
    () => (typeof document === 'undefined' ? null : createContactShadowTexture()),
    []
  )
  const catContactShadowSize = useMemo(() => {
    const width = Math.max(catWorldSize.x * 1.55, 1.05)
    const depth = Math.max(catWorldSize.z * 1.95, 1.15)
    return [width, depth]
  }, [catWorldSize])
  const catMouthLocalPosition = useMemo(
    () => new THREE.Vector3(
      cat.center.x + cat.size.x * 0.02,
      cat.min.y + cat.size.y * 0.72,
      cat.max.z + cat.size.z * 0.22
    ),
    [cat]
  )
  const meowTextSize = cat.size.y * 0.14
  const meowTextHeight = cat.size.y * 0.03
  const meowBevelSize = cat.size.y * 0.005
  const meowBevelThickness = cat.size.y * 0.004
  const spawnMeowBurst = () => {
    const bursts = meowBurstsRef.current
    const spawnCount = meowSpawnCountRef.current++
    const patternIndex = spawnCount % 5
    const lateralPattern = [-1, -0.45, 0, 0.45, 1]
    const risePattern = [0.02, 0.08, 0.05, 0.11, 0.07]
    const depthPattern = [0, 0.02, 0.04, 0.06, 0.08]
    const twistPattern = [-0.2, -0.08, 0, 0.08, 0.2]

    let slotIndex = bursts.findIndex((burst) => burst.elapsed >= MEOW_BURST_DURATION)
    if (slotIndex === -1) {
      slotIndex = bursts.reduce(
        (oldestIndex, burst, index, list) => (
          burst.elapsed > list[oldestIndex].elapsed ? index : oldestIndex
        ),
        0
      )
    }

    bursts[slotIndex] = {
      elapsed: 0,
      lateral: lateralPattern[patternIndex],
      rise: risePattern[patternIndex],
      depth: depthPattern[patternIndex],
      swayPhase: spawnCount * 0.8,
      twist: twistPattern[patternIndex],
    }
  }
  const catLightShadowDirection = useMemo(() => {
    const offset = new THREE.Vector3(
      catPosition.x - screenWorld.x,
      0,
      catPosition.z - screenWorld.z
    )
    if (offset.lengthSq() < 1e-6) return new THREE.Vector3(0.65, 0, 0.85)
    return offset.normalize()
  }, [catPosition.x, catPosition.z, screenWorld.x, screenWorld.z])
  const catCameraShadowDirection = useMemo(() => {
    const offset = new THREE.Vector3(
      camera.position.x - catPosition.x,
      0,
      camera.position.z - catPosition.z
    )
    if (offset.lengthSq() < 1e-6) return new THREE.Vector3(-0.18, 0, 0.98)
    return offset.normalize()
  }, [camera, catPosition.x, catPosition.z])
  const catCastShadowDirection = useMemo(() => {
    const direction = catCameraShadowDirection
      .clone()
      .multiplyScalar(0.72)
      .add(catLightShadowDirection.clone().multiplyScalar(0.28))

    if (direction.lengthSq() < 1e-6) return new THREE.Vector3(-0.08, 0, 0.99)
    return direction.normalize()
  }, [catCameraShadowDirection, catLightShadowDirection])
  const catCastShadowYaw = useMemo(
    () => Math.atan2(catCastShadowDirection.x, catCastShadowDirection.z),
    [catCastShadowDirection]
  )
  const catCastShadowPosition = useMemo(
    () => [
      catPosition.x + catCastShadowDirection.x * 0.52,
      floorY + 0.011,
      catPosition.z + catCastShadowDirection.z * 0.46,
    ],
    [catCastShadowDirection, catPosition.x, catPosition.z, floorY]
  )
  const catCastShadowSize = useMemo(() => {
    const length = Math.max(catWorldSize.z * 2.9, 1.85)
    const width = Math.max(catWorldSize.x * 1.45, 0.95)
    return [width, length]
  }, [catWorldSize])
  const catShadowCatcherPosition = useMemo(
    () => [
      catPosition.x + catCastShadowDirection.x * 0.18,
      floorY + 0.008,
      catPosition.z + catCastShadowDirection.z * 0.16,
    ],
    [catCastShadowDirection.x, catCastShadowDirection.z, catPosition.x, catPosition.z, floorY]
  )
  const catShadowCatcherSize = useMemo(() => {
    const width = Math.max(catWorldSize.x * 1.7, 1.2)
    const depth = Math.max(catWorldSize.z * 2.35, 1.6)
    return [width, depth]
  }, [catWorldSize])
  const posterAspect = useMemo(() => {
    const image = posterTexture?.image
    if (!image?.width || !image?.height) return 0.72
    return image.width / image.height
  }, [posterTexture])
  useEffect(() => {
    for (const tex of [posterTexture, phishPosterTexture]) {
      if (!tex) continue
      tex.colorSpace = THREE.SRGBColorSpace
      tex.wrapS = THREE.ClampToEdgeWrapping
      tex.wrapT = THREE.ClampToEdgeWrapping
      tex.minFilter = THREE.LinearMipmapLinearFilter
      tex.magFilter = THREE.LinearFilter
      tex.anisotropy = Math.min(gl.capabilities.getMaxAnisotropy(), 8)
      tex.needsUpdate = true
    }
  }, [gl, posterTexture, phishPosterTexture])

  useEffect(() => {
    return () => {
      catContactShadowTexture?.dispose()
      floorTexture?.dispose()
      wallTexture?.dispose()
      document.body.style.cursor = 'auto'
    }
  }, [catContactShadowTexture, floorTexture, wallTexture])

  const catHeroTarget = useMemo(
    () => new THREE.Vector3(0, catWorldSize.y * 0.56, catWorldSize.z * 0.02)
      .applyEuler(catRotation)
      .add(catPosition),
    [catPosition, catRotation, catWorldSize]
  )
  const boardAnchor = useMemo(
    () => new THREE.Vector3(0, catWorldSize.y * 0.1, -catWorldSize.z * 0.18)
      .applyEuler(catRotation)
      .add(catPosition),
    [catPosition, catRotation, catWorldSize]
  )
  const backWallZ = screenWorld.z - 2.88
  const tvPanelCenterY = floorY + 1.95
  const defaultLampPosition = useMemo(
    () => new THREE.Vector3(tvPosition.x + 2.45, floorY, tvPosition.z + 0.95),
    [floorY, tvPosition]
  )
  const lampCtrl = useOptionalControls('Intro', {
    Lamp: folder({
      lampPosX: { value: defaultLampPosition.x, min: -5, max: 5, step: 0.01 },
      lampPosY: { value: defaultLampPosition.y, min: -5, max: 5, step: 0.01 },
      lampPosZ: { value: defaultLampPosition.z, min: -5, max: 5, step: 0.01 },
      lampRotX: { value: 0, min: -Math.PI, max: Math.PI, step: 0.01 },
      lampRotY: { value: 0, min: -Math.PI, max: Math.PI, step: 0.01 },
      lampRotZ: { value: 0, min: -Math.PI, max: Math.PI, step: 0.01 },
      lampScale: { value: 1, min: 0.25, max: 3, step: 0.01 },
    }),
  }, [defaultLampPosition.x, defaultLampPosition.y, defaultLampPosition.z])
  const motionFxCtrl = useOptionalControls('Intro', {
    'Motion FX': folder({
      heroSpotIntensity: { value: 24.0, min: 0, max: 24, step: 0.1 },
      heroSpotAngle: { value: 0.39, min: 0.1, max: 1.2, step: 0.01 },
      heroSpotDistance: { value: 8.1, min: 0, max: 18, step: 0.1 },
      heroOrbitRadius: { value: 0.23, min: 0, max: 1.5, step: 0.01 },
      heroHeight: { value: 3.74, min: 0.5, max: 5, step: 0.01 },
      heroColor: '#ffffff',
      sweepSpotIntensity: { value: 10.1, min: 0, max: 16, step: 0.1 },
      sweepSpotAngle: { value: 0.85, min: 0.1, max: 1.1, step: 0.01 },
      sweepSpotDistance: { value: 10, min: 0, max: 18, step: 0.1 },
      sweepSpeed: { value: 1.01, min: 0, max: 3, step: 0.01 },
      sweepColor: '#89baff',
      boardGlowIntensity: { value: 1.8, min: 0, max: 8, step: 0.05 },
      boardGlowColor: '#bc702e',
    }),
  }, [])

  useEffect(() => {
    if (heroSpotlightRef.current && shadowTargetRef.current) {
      heroSpotlightRef.current.target = shadowTargetRef.current
    }
    if (sweepSpotlightRef.current && sweepSpotlightTargetRef.current) {
      sweepSpotlightRef.current.target = sweepSpotlightTargetRef.current
    }
  }, [])

  // Flicker TV/accent lights; orbit hero + sweep spots; follow cat/board for shadows and glow
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    const roomPower = THREE.MathUtils.lerp(0.16, 1, bootVisualMix)
    const accentPower = THREE.MathUtils.lerp(0.12, 1, bootVisualMix)
    const cartridgePulse = cartridgeEjectRef.current
    if (cartridgePulse.active) {
      cartridgePulse.progress = Math.min(1, cartridgePulse.progress + delta / CARTRIDGE_EJECT_DURATION)
      if (cartridgePulse.progress >= 1) {
        cartridgePulse.progress = 1
        cartridgePulse.active = false
      }
    }
    const cartridgeProgress = cartridgePulse.progress
    const cartridgePop = Math.sin(cartridgeProgress * Math.PI)
    const cartridgeRattle = Math.sin(cartridgeProgress * Math.PI * 9) * Math.pow(1 - cartridgeProgress, 1.7)
    const cartridgeGlitchMix = cartridgePop * 0.65 + Math.abs(cartridgeRattle) * 0.35
    crtGlitchRef.current = cartridgeGlitchMix
    if (tvGlowRef.current) {
      const baseGlow = 21.5 + Math.sin(t * 8.4) * 1.2 + Math.sin(t * 15.5) * 0.5
      const glitchGlow = 1 + cartridgeGlitchMix * (0.5 + Math.sin(t * 35) * 0.18)
      tvGlowRef.current.intensity = baseGlow * roomPower * glitchGlow
    }
    if (accentLightRef.current) {
      const baseAccent = 6.4 + Math.sin(t * 2.6) * 0.55
      const glitchAccent = 1 + cartridgeGlitchMix * (0.22 + Math.sin(t * 28) * 0.1)
      accentLightRef.current.intensity = baseAccent * accentPower * glitchAccent
    }
    if (heroSpotlightRef.current) {
      heroSpotlightRef.current.position.set(
        catHeroTarget.x + 0.95 + Math.sin(t * 0.9) * motionFxCtrl.heroOrbitRadius,
        catHeroTarget.y + motionFxCtrl.heroHeight + Math.cos(t * 0.65) * 0.14,
        catHeroTarget.z + 1.75 + Math.cos(t * 0.75) * motionFxCtrl.heroOrbitRadius * 0.8
      )
      heroSpotlightRef.current.intensity = (motionFxCtrl.heroSpotIntensity + Math.sin(t * 2.2) * 0.45) * roomPower
      heroSpotlightRef.current.angle = motionFxCtrl.heroSpotAngle + Math.sin(t * 0.8) * 0.025
    }
    if (shadowTargetRef.current) {
      shadowTargetRef.current.position.set(catPosition.x, floorY - 0.2, catPosition.z)
      shadowTargetRef.current.updateMatrixWorld()
    }
    if (sweepSpotlightRef.current) {
      const sweepPhase = Math.sin(t * motionFxCtrl.sweepSpeed)
      sweepSpotlightRef.current.position.set(
        screenWorld.x - 2.4 + sweepPhase * 1.1,
        catHeroTarget.y + 1.95 + Math.cos(t * 0.6) * 0.22,
        screenWorld.z + 1.85 + Math.cos(t * motionFxCtrl.sweepSpeed * 0.85) * 0.45
      )
      sweepSpotlightRef.current.intensity = (motionFxCtrl.sweepSpotIntensity + Math.sin(t * 1.3) * 0.35) * roomPower
    }
    if (sweepSpotlightTargetRef.current) {
      sweepSpotlightTargetRef.current.position.set(
        THREE.MathUtils.lerp(screenWorld.x, catHeroTarget.x, 0.45),
        THREE.MathUtils.lerp(screenWorld.y, catHeroTarget.y, 0.75) + Math.sin(t * 1.1) * 0.06,
        THREE.MathUtils.lerp(screenWorld.z, catHeroTarget.z, 0.25)
      )
      sweepSpotlightTargetRef.current.updateMatrixWorld()
    }
    if (boardGlowRef.current) {
      boardGlowRef.current.position.set(boardAnchor.x, boardAnchor.y + 0.18, boardAnchor.z + 0.02)
      boardGlowRef.current.intensity = (motionFxCtrl.boardGlowIntensity + (Math.sin(t * 3.4) * 0.5 + 0.5) * 0.9) * roomPower
    }
    if (catGroupRef.current) {
      catBreathElapsedRef.current = Math.min(catBreathElapsedRef.current + delta, CAT_BREATH_DURATION)

      const breathProgress = catBreathElapsedRef.current / CAT_BREATH_DURATION
      const breathWave = Math.sin(breathProgress * Math.PI * 2)
      const breathEnvelope = Math.pow(1 - breathProgress, 1.4)
      const animatedScale = catCtrl.catScale * (1 + breathWave * breathEnvelope * CAT_BREATH_SCALE_AMOUNT)

      // Keep the cat planted on the floor while the click pulse scales it.
      catGroupRef.current.position.set(
        catPosition.x,
        catPosition.y - cat.min.y * (animatedScale - catCtrl.catScale),
        catPosition.z
      )
      catGroupRef.current.scale.setScalar(animatedScale)
    }
    for (const index of MEOW_SLOT_INDICES) {
      const burst = meowBurstsRef.current[index]
      const anchor = meowAnchorRefs.current[index]
      const billboard = meowBillboardRefs.current[index]
      const material = meowMaterialRefs.current[index]

      if (!burst || !anchor || !billboard) continue

      burst.elapsed = Math.min(burst.elapsed + delta, MEOW_BURST_DURATION)
      const isMeowActive = burst.elapsed < MEOW_BURST_DURATION
      anchor.visible = isMeowActive

      if (isMeowActive) {
        const progress = burst.elapsed / MEOW_BURST_DURATION
        const eased = 1 - Math.pow(1 - progress, 3)
        const pop = Math.sin(progress * Math.PI)
        const driftX = (
          burst.lateral * cat.size.x * (0.018 + eased * 0.12)
          + Math.sin(progress * 9 + burst.swayPhase) * cat.size.x * 0.01
        )
        const driftY = cat.size.y * (0.04 + burst.rise + eased * 0.2)
        const driftZ = -cat.size.z * (0.02 + burst.depth + eased * 0.18)

        anchor.position.set(
          catMouthLocalPosition.x + driftX,
          catMouthLocalPosition.y + driftY,
          catMouthLocalPosition.z + driftZ
        )
        billboard.lookAt(camera.position)
        billboard.rotateZ(burst.twist + eased * 0.14 * Math.sign(burst.lateral || 1))
        billboard.scale.setScalar(0.52 + pop * 0.54)

        if (material) {
          material.opacity = Math.min(1, pop * 1.35)
          material.emissiveIntensity = 0.8 + pop * 1.15
        }
      } else if (material) {
        material.opacity = 0
      }
    }
    const spin = chairSpinRef.current
    const remaining = spin.target - spin.progress
    if (remaining > 0) {
      const velocity = Math.max(2.5, remaining * 3.2)
      spin.progress = Math.min(spin.target, spin.progress + delta * velocity)
    }
    if (chairGroupRef.current) {
      chairGroupRef.current.rotation.y = chairCtrl.chairRotY + spin.progress
    }
    if (cartridgeGroupRef.current) {
      cartridgeGroupRef.current.position.set(
        cartridgeCtrl.cartridgePosX + cartridgeRattle * 0.018,
        floorY + cartridgeCtrl.cartridgePosY + cartridgePop * 0.16 + Math.abs(cartridgeRattle) * 0.028,
        cartridgeCtrl.cartridgePosZ - cartridgePop * 0.08
      )
      cartridgeGroupRef.current.rotation.set(
        cartridgeCtrl.cartridgeRotX - cartridgePop * 0.72 + cartridgeRattle * 0.08,
        cartridgeCtrl.cartridgeRotY + cartridgeRattle * 0.3,
        cartridgeCtrl.cartridgeRotZ + cartridgePop * 0.28
      )
      cartridgeGroupRef.current.scale.setScalar(
        cartridgeCtrl.cartridgeScale * (1 + cartridgePop * 0.09)
      )
    }
    if (catGroupRef.current) {
      catGroupRef.current.rotation.y = catCtrl.catRotY + spin.progress
    }
    if (skateboardGroupRef.current) {
      const kf = kickflipRef.current
      if (kf.active) {
        kf.progress = Math.min(1, kf.progress + delta * 2)
        if (kf.progress >= 1) {
          kf.progress = 1
          kf.active = false
        }
      }
      const p = kf.progress
      const heightBump = Math.sin(p * Math.PI) * 0.28
      const flipAngle = p * Math.PI * 2
      const grp = skateboardGroupRef.current
      grp.position.set(
        skateboardPosition[0],
        skateboardPosition[1] + heightBump,
        skateboardPosition[2]
      )
      grp.rotation.set(
        skateboardRotation[0],
        skateboardRotation[1],
        skateboardRotation[2] + flipAngle
      )
    }
  })

  return (
    <>
      {/* Fog, all lights, spotlight targets */}
      <IntroLighting
        tvGlowRef={tvGlowRef}
        accentLightRef={accentLightRef}
        heroSpotlightRef={heroSpotlightRef}
        sweepSpotlightRef={sweepSpotlightRef}
        sweepSpotlightTargetRef={sweepSpotlightTargetRef}
        boardGlowRef={boardGlowRef}
        shadowTargetRef={shadowTargetRef}
        screenWorld={screenWorld}
        tvForward={tvForward}
        tvPanelCenterY={tvPanelCenterY}
        backWallZ={backWallZ}
        catHeroTarget={catHeroTarget}
        catPosition={catPosition}
        floorY={floorY}
        boardAnchor={boardAnchor}
        lampCtrl={lampCtrl}
        motionFxCtrl={motionFxCtrl}
        bootVisualMix={bootVisualMix}
      />

      {/* Floor, walls, rug, lamp mesh, contact-shadow quads */}
      <IntroRoom
        floorY={floorY}
        woodDiffuse={woodDiffuse}
        woodNormal={woodNormal}
        wallTexture={wallTexture}
        catShadowCatcherPosition={catShadowCatcherPosition}
        catShadowCatcherSize={catShadowCatcherSize}
        catCastShadowYaw={catCastShadowYaw}
        catCastShadowPosition={catCastShadowPosition}
        catCastShadowSize={catCastShadowSize}
        catContactShadowSize={catContactShadowSize}
        catContactShadowTexture={catContactShadowTexture}
        catPosition={catPosition}
        screenWorld={screenWorld}
        tvPanelCenterY={tvPanelCenterY}
        backWallZ={backWallZ}
        lampCtrl={lampCtrl}
        posterTexture={posterTexture}
        posterAspect={posterAspect}
        secondaryPosterTexture={phishPosterTexture}
        posterFadeTargetRef={posterFadeTargetRef}
        posterVisible={posterCtrl.posterVisible}
        posterPosition={[posterCtrl.posterPosX, posterCtrl.posterPosY, posterCtrl.posterPosZ]}
        posterRotationZ={posterCtrl.posterRotZ}
        posterScale={posterCtrl.posterScale}
        posterMaxWidth={posterCtrl.posterMaxWidth}
        posterMaxHeight={posterCtrl.posterMaxHeight}
        onPosterClick={handlePosterClick}
      />

      {/* Chair GLTF — click to spin */}
      <group
        ref={chairGroupRef}
        position={[chairCtrl.chairPosX, floorY + chairCtrl.chairPosY - chair.min.y * chairCtrl.chairScale, chairCtrl.chairPosZ]}
        rotation={[0, chairCtrl.chairRotY, 0]}
        onClick={(e) => {
          e.stopPropagation()
          chairSpinRef.current.target += Math.PI * 2
        }}
      >
        <primitive object={chair.root} scale={chairCtrl.chairScale} />
      </group>

      <group
        ref={cartridgeGroupRef}
        position={[
          cartridgeCtrl.cartridgePosX,
          floorY + cartridgeCtrl.cartridgePosY,
          cartridgeCtrl.cartridgePosZ,
        ]}
        rotation={[
          cartridgeCtrl.cartridgeRotX,
          cartridgeCtrl.cartridgeRotY,
          cartridgeCtrl.cartridgeRotZ,
        ]}
        scale={cartridgeCtrl.cartridgeScale}
        onClick={(event) => {
          event.stopPropagation()
          cartridgeEjectRef.current = { progress: 0, active: true }
        }}
        onPointerOver={(event) => {
          event.stopPropagation()
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'auto'
        }}
      >
        <primitive
          object={cartridge.root}
          position={[-cartridge.center.x, -cartridge.min.y, -cartridge.center.z]}
        />
      </group>

      {/* Skateboard — click to kickflip */}
      <group
        ref={skateboardGroupRef}
        position={skateboardPosition}
        rotation={skateboardRotation}
        scale={skateboardScale}
        onClick={(e) => {
          e.stopPropagation()
          if (!kickflipRef.current.active) {
            kickflipRef.current = { progress: 0, active: true }
          }
        }}
      >
        <primitive
          object={skateboard.root}
          position={[-skateboard.center.x, -skateboard.min.y, -skateboard.center.z]}
        />
      </group>

      {/* GitHub Octocat — click to open the Skate Cat repo */}
      {octocat.root && (
        <group
          position={[octocatCtrl.octocatPosX, octocatCtrl.octocatPosY, octocatCtrl.octocatPosZ]}
          rotation={[octocatCtrl.octocatRotX, octocatCtrl.octocatRotY, octocatCtrl.octocatRotZ]}
          scale={octocatCtrl.octocatScale}
          onClick={(e) => {
            e.stopPropagation()
            window.open('https://github.com/MatthewGreenberg/skate-cat', '_blank', 'noopener,noreferrer')
          }}
          onPointerOver={(e) => {
            e.stopPropagation()
            document.body.style.cursor = 'pointer'
          }}
          onPointerOut={() => {
            document.body.style.cursor = 'auto'
          }}
        >
          <primitive
            object={octocat.root}
            position={[-octocat.center.x, -octocat.min.y, -octocat.center.z]}
          />
        </group>
      )}

      {/* CRT model + curved UI screen (canvas → CRT shader) */}
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
          showGlow={tvUiCtrl.glowEnabled && !renderProfile.disableIntroScreenGlow}
          glowScale={[tvUiCtrl.glowScaleX, tvUiCtrl.glowScaleY]}
          glowOpacity={tvUiCtrl.glowOpacity * THREE.MathUtils.lerp(0.18, 1, bootVisualMix)}
          glowOffsetZ={tvUiCtrl.glowOffsetZ}
          crt={{
            warp: tvCrtCtrl.crtWarp,
            aberration: tvCrtCtrl.crtAberration,
            edgeAberration: tvCrtCtrl.crtEdgeAberration,
            hoverBoost: tvCrtCtrl.crtHoverBoost,
            scanlineIntensity: tvCrtCtrl.crtScanlineIntensity,
            scanlineDensity: tvCrtCtrl.crtScanlineDensity,
            grilleIntensity: tvCrtCtrl.crtGrilleIntensity,
            grilleDensity: tvCrtCtrl.crtGrilleDensity,
            rollIntensity: tvCrtCtrl.crtRollIntensity,
            rollSpeed: tvCrtCtrl.crtRollSpeed,
            noiseIntensity: tvCrtCtrl.crtNoiseIntensity,
            vignetteStrength: tvCrtCtrl.crtVignetteStrength,
            vignetteStart: tvCrtCtrl.crtVignetteStart,
            brightness: tvCrtCtrl.crtBrightness,
            blackLevel: tvCrtCtrl.crtBlackLevel,
            powerOnDuration: tvCrtCtrl.crtPowerOnDuration,
          }}
          onStart={onStart}
          onDismiss={onDismiss}
          onAction={onAction}
          quality={quality}
          disabled={disabled}
          buttonLabel={buttonLabel}
          instructionLabel={instructionLabel}
          screenMode={screenMode}
          summary={summary}
          showDismissButton={showDismissButton}
          bootVisualMix={bootVisualMix}
          bootStatusLabel={bootStatusLabel}
          bootProgress={bootProgress}
          bootReady={bootReady}
          highScore={highScore}
          leaderboards={leaderboards}
          leaderboardTab={leaderboardTab}
          initialsEntry={initialsEntry}
          crtGlitchRef={crtGlitchRef}
          renderProfile={renderProfile}
        />
      </group>

      {/* Maxwell cat GLTF (separate from TV group) */}
      {cat.root && (
        <group
          ref={catGroupRef}
          position={catPosition.toArray()}
          rotation={[catCtrl.catRotX, catCtrl.catRotY, catCtrl.catRotZ]}
          scale={catCtrl.catScale}
          onClick={(event) => {
            event.stopPropagation()
            catBreathElapsedRef.current = 0
            spawnMeowBurst()
          }}
          onPointerOver={(event) => {
            event.stopPropagation()
            document.body.style.cursor = 'pointer'
          }}
          onPointerOut={() => {
            document.body.style.cursor = 'auto'
          }}
        >
          <primitive
            object={cat.root}
          />
          {MEOW_SLOT_INDICES.map((index) => (
            <group
              key={index}
              ref={(node) => {
                meowAnchorRefs.current[index] = node
              }}
              visible={false}
            >
              <group
                ref={(node) => {
                  meowBillboardRefs.current[index] = node
                }}
              >
                <Center>
                  <Text3D
                    font={helvetikerBoldUrl}
                    size={meowTextSize}
                    height={meowTextHeight}
                    curveSegments={8}
                    bevelEnabled
                    bevelSize={meowBevelSize}
                    bevelThickness={meowBevelThickness}
                    bevelSegments={4}
                    castShadow
                  >
                    MEOW
                    <meshStandardMaterial
                      ref={(node) => {
                        meowMaterialRefs.current[index] = node
                      }}
                      color="#fff8d6"
                      emissive="#ff8c61"
                      emissiveIntensity={0}
                      roughness={0.28}
                      metalness={0.08}
                      transparent
                      opacity={0}
                      depthWrite={false}
                    />
                  </Text3D>
                </Center>
              </group>
            </group>
          ))}
        </group>
      )}

    </>
  )
}

useGLTF.preload('/models/cat/scene.gltf')
useTexture.preload('/textures/poster.webp')
useTexture.preload('/textures/phish.webp')
