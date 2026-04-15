import { useRef, useEffect, useMemo, useState } from 'react'
import { useGLTF, useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { button, folder } from 'leva'
import * as THREE from 'three'
import { createToonMaterial, createOutlineMaterial, createContactShadowTexture } from '../lib/toonMaterials'
import useToonShaderSync from '../hooks/useToonShaderSync'
import useCatAnimation from '../hooks/useCatAnimation'
import { useOptionalControls } from '../lib/debugControls'
import { emitHudScoreChange, gameState, MAX_EXTRA_CAT_COUNT } from '../store'

const EXTRA_CAT_REST_POSITION = new THREE.Vector3(0.08, 0.34, -0.08)
const EXTRA_CAT_REST_ROTATION = new THREE.Euler(0.04, -0.1, 0.13)
const CAT_MODEL_SCALE = 0.03
const EXTRA_CAT_SCALE = CAT_MODEL_SCALE
const MAX_SIMULATED_EXTRA_CATS = MAX_EXTRA_CAT_COUNT
const EXTRA_CAT_STACK_STEP_Y = 0.17
const EXTRA_CAT_STACK_STEP_Z = -0.08
const EXTRA_CAT_DROP_OFFSET_Y = 0.95
const EXTRA_CAT_PLOP_DURATION = 0.26
const EXTRA_CAT_BOARD_DROP = 0.026
const EXTRA_CAT_BOARD_PITCH = 0.085
const EXTRA_CAT_FALL_STRETCH_XZ = 0.0
const EXTRA_CAT_FALL_STRETCH_Y = 0.0
const EXTRA_CAT_IMPACT_SQUISH_XZ = 0.0
const EXTRA_CAT_IMPACT_SQUISH_Y = 0.0
const BASE_CAT_IMPACT_SQUISH_XZ = 0.22
const BASE_CAT_IMPACT_SQUISH_Y = 0.28
const BASE_CAT_IMPACT_SINK = 0.01
const STACK_CAT_DEFAULT_POSITIONS = Array.from({ length: MAX_SIMULATED_EXTRA_CATS }, (_, index) => ({
  x: EXTRA_CAT_REST_POSITION.x,
  y: EXTRA_CAT_REST_POSITION.y + index * EXTRA_CAT_STACK_STEP_Y,
  z: EXTRA_CAT_REST_POSITION.z + index * EXTRA_CAT_STACK_STEP_Z,
}))
STACK_CAT_DEFAULT_POSITIONS[1] = { x: 0.11, y: 0.71, z: -0.1 }
STACK_CAT_DEFAULT_POSITIONS[2] = { x: 0.11, y: 1.08, z: -0.1 }

function applyOriginalMaterials(root) {
  root.traverse((child) => {
    if (!child.isMesh || !child.userData.__originalMaterial) return
    child.material = child.userData.__originalMaterial
    if (child.userData.__outlineMesh) child.userData.__outlineMesh.visible = false
  })
}

function applyToonMaterials(root) {
  root.traverse((child) => {
    if (!child.isMesh || !child.userData.__toonMaterial) return
    child.material = child.userData.__toonMaterial
    if (child.userData.__outlineMesh) child.userData.__outlineMesh.visible = true
  })
}

function createToonedCatClone({
  scene,
  paintedBodyMap,
  originalBodyMap,
  showOutlines,
  useShadowMap,
}) {
  const clone = scene.clone(true)
  const originals = new Map()
  clone.traverse((child) => {
    if (child.isMesh) originals.set(child, child.material.clone())
  })
  clone.traverse((child) => {
    if (!child.isMesh) return
    const oldMat = originals.get(child)
    if (!oldMat) return
    const mat = createToonMaterial()
    const map = oldMat.name === 'dingus' ? paintedBodyMap : oldMat.map
    if (map) {
      mat.uniforms.uMap.value = map
      mat.uniforms.uHasMap.value = 1.0
    }
    if (oldMat.transparent) {
      mat.transparent = true
      mat.uniforms.uAlphaTest.value = 0.5
      mat.depthWrite = false
    }
    if (oldMat.side === THREE.DoubleSide) mat.side = THREE.DoubleSide
    child.castShadow = useShadowMap
    const flatMat = new THREE.MeshBasicMaterial({
      map: oldMat.name === 'dingus' ? originalBodyMap : oldMat.map,
      color: oldMat.color,
      transparent: !!oldMat.transparent,
      alphaTest: oldMat.transparent ? 0.5 : 0,
      side: oldMat.side,
      depthWrite: !oldMat.transparent,
    })
    child.material = flatMat
    child.userData.__originalMaterial = flatMat
    child.userData.__toonMaterial = mat
    if (showOutlines && !oldMat.transparent && child.geometry) {
      const outlineMat = createOutlineMaterial()
      const outlineMesh = new THREE.Mesh(child.geometry, outlineMat)
      outlineMesh.matrixAutoUpdate = false
      outlineMesh.userData.__toonOutline = true
      outlineMesh.visible = false
      child.add(outlineMesh)
      child.userData.__outlineMesh = outlineMesh
    }
  })
  return clone
}

export default function SkateCat({
  trailTargetRef,
  isRunActive = false,
  controlsEnabled = true,
  isTransitioning = false,
  useOriginalMaterials = false,
  freezeMotion = false,
  musicRef,
  onJumpSfx,
  onPlopSfx,
  shadowMode = 'map',
  renderProfile = {},
}) {
  const useShadowMap = shadowMode === 'map' || shadowMode === 'hybrid'
  const useContactShadow = shadowMode === 'contact' || shadowMode === 'hybrid'
  const showOutlines = !renderProfile.disableCatOutlines
  const showAccentLights = !renderProfile.disableCatAccentLights
  const [manualCatDropTrigger, setManualCatDropTrigger] = useState(0)
  const handledManualCatDropRef = useRef(0)
  const blinkState = useRef({ timer: 3, blinking: false, blinkTime: 0, amount: 0, blinksLeft: 0 })

  // --- Refs ---
  const groupRef = useRef()
  const boardRef = useRef()
  const catRef = useRef()
  const stackRigRef = useRef()
  const extraCatRefs = useRef([])
  const grindLightRef = useRef()
  const catModelRef = useRef()
  const contactShadowRef = useRef()
  const contactShadowMaterialRef = useRef()
  const previousExtraCatCountRef = useRef(0)
  const extraCatPlopRef = useRef({ active: false, time: 0 })
  const manualSimulationRef = useRef({ previewCount: 0 })

  const { catRotX, catRotY, catRotZ } = useOptionalControls('Game', {
    Cat: folder({
      catRotX: { value: 0, min: -Math.PI, max: Math.PI, step: 0.05 },
      catRotY: { value: 1.3, min: -Math.PI, max: Math.PI, step: 0.05 },
      catRotZ: { value: 0, min: -Math.PI, max: Math.PI, step: 0.05 },
    }, { collapsed: true }),
  }, [])

  const toonControls = useOptionalControls('Game', {
    'Cat Toon Shader': folder({
      lightX: { value: 4.0, min: -20, max: 20, step: 0.5 },
      lightY: { value: -7.5, min: -20, max: 20, step: 0.5 },
      lightZ: { value: 3.0, min: -20, max: 20, step: 0.5 },
      glossiness: { value: 1, min: 1, max: 100, step: 1 },
      rimAmount: { value: 0.84, min: 0, max: 1, step: 0.01 },
      rimThreshold: { value: 0.28, min: 0, max: 1, step: 0.01 },
      rimColor: '#d7dcff',
      steps: { value: 3, min: 1, max: 8, step: 1 },
      shadowBrightness: { value: 0.20, min: 0, max: 1, step: 0.05 },
      brightness: { value: 1.70, min: 0.5, max: 4, step: 0.05 },
      outlineThickness: { value: 0.04, min: 0, max: 0.15, step: 0.005 },
      outlineColor: '#000000',
    }, { collapsed: true }),
  }, [])

  const blinkControls = useOptionalControls('Game', {
    'Cat Blink': folder({
      leftEyeX: { value: 0.84, min: 0, max: 1, step: 0.005 },
      leftEyeY: { value: 0.60, min: 0, max: 1, step: 0.005 },
      rightEyeX: { value: 0.66, min: 0, max: 1, step: 0.005 },
      rightEyeY: { value: 0.57, min: 0, max: 1, step: 0.005 },
      eyeRadiusX: { value: 0.08, min: 0.005, max: 0.15, step: 0.005 },
      eyeRadiusY: { value: 0.05, min: 0.005, max: 0.15, step: 0.005 },
      lidColor: '#1a1a2e',
      forceClose: false,
    }, { collapsed: true }),
  }, [])

  const catStackControls = useOptionalControls('Game', {
    'Cat Stack': folder({
      forceLoad: { value: 0, min: 0, max: MAX_SIMULATED_EXTRA_CATS, step: 1 },
      groundJumpDurationMultiplier: { value: 0.92, min: 0.7, max: 1, step: 0.01 },
      groundJumpHeightMultiplier: { value: 0.95, min: 0.7, max: 1.1, step: 0.01 },
      railJumpDurationMultiplier: { value: 0.95, min: 0.7, max: 1, step: 0.01 },
      railJumpHeightMultiplier: { value: 0.98, min: 0.7, max: 1.1, step: 0.01 },
      speedBonus: { value: 0.45, min: 0, max: 2, step: 0.01 },
      ...STACK_CAT_DEFAULT_POSITIONS.reduce((controls, position, index) => {
        const catNumber = index + 1
        controls[`stackCat${catNumber}PosX`] = { value: position.x, min: -1.5, max: 1.5, step: 0.01 }
        controls[`stackCat${catNumber}PosY`] = { value: position.y, min: -0.5, max: 1.5, step: 0.01 }
        controls[`stackCat${catNumber}PosZ`] = { value: position.z, min: -1.5, max: 1.5, step: 0.01 }
        return controls
      }, {}),
      stackCatRotX: { value: EXTRA_CAT_REST_ROTATION.x, min: -Math.PI, max: Math.PI, step: 0.01 },
      stackCatRotY: { value: EXTRA_CAT_REST_ROTATION.y, min: -Math.PI, max: Math.PI, step: 0.01 },
      stackCatRotZ: { value: EXTRA_CAT_REST_ROTATION.z, min: -Math.PI, max: Math.PI, step: 0.01 },
      stackCatScale: { value: EXTRA_CAT_SCALE, min: 0.005, max: 0.08, step: 0.001 },
      stackCatDropOffsetY: { value: EXTRA_CAT_DROP_OFFSET_Y, min: 0, max: 2.5, step: 0.01 },
      stackCatDropDuration: { value: EXTRA_CAT_PLOP_DURATION, min: 0.05, max: 1.2, step: 0.01 },
      stackCatBoardDrop: { value: EXTRA_CAT_BOARD_DROP, min: 0, max: 0.12, step: 0.001 },
      stackCatBoardPitch: { value: EXTRA_CAT_BOARD_PITCH, min: 0, max: 0.4, step: 0.005 },
      stackCatFallStretchXZ: { value: EXTRA_CAT_FALL_STRETCH_XZ, min: 0, max: 0.4, step: 0.01 },
      stackCatFallStretchY: { value: EXTRA_CAT_FALL_STRETCH_Y, min: 0, max: 0.5, step: 0.01 },
      stackCatImpactSquishXZ: { value: EXTRA_CAT_IMPACT_SQUISH_XZ, min: 0, max: 1, step: 0.01 },
      stackCatImpactSquishY: { value: EXTRA_CAT_IMPACT_SQUISH_Y, min: 0, max: 1, step: 0.01 },
      baseCatImpactSquishXZ: { value: BASE_CAT_IMPACT_SQUISH_XZ, min: 0, max: 0.8, step: 0.01 },
      baseCatImpactSquishY: { value: BASE_CAT_IMPACT_SQUISH_Y, min: 0, max: 0.8, step: 0.01 },
      baseCatImpactSink: { value: BASE_CAT_IMPACT_SINK, min: 0, max: 0.15, step: 0.001 },
      simulateCatDrop: button(() => { setManualCatDropTrigger((value) => value + 1) }),
    }, { collapsed: true }),
  }, [])

  // --- Model loading ---
  const skateboard = useGLTF('/models/skateboard.glb')
  const { scene: catScene } = useGLTF('/models/cat/scene.gltf')
  const paintedBodyMapSource = useTexture('/models/cat/textures/dingus_baseColor_painted-2.jpg')
  const originalBodyMapSource = useTexture('/models/cat/textures/dingus_baseColor.jpeg')

  const paintedBodyMap = useMemo(() => {
    const map = paintedBodyMapSource.clone()
    map.flipY = false
    map.colorSpace = THREE.SRGBColorSpace
    map.wrapS = THREE.RepeatWrapping
    map.wrapT = THREE.RepeatWrapping
    map.needsUpdate = true
    return map
  }, [paintedBodyMapSource])

  const originalBodyMap = useMemo(() => {
    const map = originalBodyMapSource.clone()
    map.flipY = false
    map.colorSpace = THREE.SRGBColorSpace
    map.wrapS = THREE.RepeatWrapping
    map.wrapT = THREE.RepeatWrapping
    map.needsUpdate = true
    return map
  }, [originalBodyMapSource])

  const contactShadowTexture = useMemo(() => {
    if (!useContactShadow || typeof document === 'undefined') return null
    return createContactShadowTexture()
  }, [useContactShadow])

  const skateClone = useMemo(() => {
    const clone = skateboard.scene.clone()
    clone.traverse((child) => {
      if (child.isMesh) child.castShadow = useShadowMap
    })
    return clone
  }, [skateboard, useShadowMap])

  // --- Toon material setup ---
  const catWithToon = useMemo(() => createToonedCatClone({
    scene: catScene,
    paintedBodyMap,
    originalBodyMap,
    showOutlines,
    useShadowMap,
  }), [catScene, paintedBodyMap, originalBodyMap, showOutlines, useShadowMap])

  const stackedCatsWithToon = useMemo(
    () => Array.from({ length: MAX_SIMULATED_EXTRA_CATS }, () => createToonedCatClone({
      scene: catScene,
      paintedBodyMap,
      originalBodyMap,
      showOutlines,
      useShadowMap,
    })),
    [catScene, paintedBodyMap, originalBodyMap, showOutlines, useShadowMap]
  )

  // --- Cache mesh refs for per-frame shader sync ---
  const toonMeshesRef = useRef([])
  const outlineMeshesRef = useRef([])
  useEffect(() => {
    const toonMeshes = []
    const outlineMeshes = []
      ;[catWithToon, ...stackedCatsWithToon].forEach((root) => {
        root.traverse((child) => {
          if (!child.isMesh || !child.material?.isShaderMaterial) return
          if (child.userData.__toonOutline) {
            outlineMeshes.push(child)
          } else if (child.material.uniforms?.uLightDirection) {
            toonMeshes.push(child)
          }
        })
      })
    toonMeshesRef.current = toonMeshes
    outlineMeshesRef.current = outlineMeshes
  }, [catWithToon, stackedCatsWithToon])

  // Swap materials based on intro/game mode
  useEffect(() => {
    const fn = useOriginalMaterials ? applyOriginalMaterials : applyToonMaterials
    fn(catWithToon)
    stackedCatsWithToon.forEach(fn)
  }, [useOriginalMaterials, catWithToon, stackedCatsWithToon])

  useEffect(() => {
    return () => {
      contactShadowTexture?.dispose()
    }
  }, [contactShadowTexture])

  useEffect(() => {
    if (isRunActive) return

    manualSimulationRef.current.previewCount = 0
    previousExtraCatCountRef.current = 0
    extraCatPlopRef.current.active = false
    extraCatPlopRef.current.time = 0
    extraCatPlopRef.current.catIndex = -1

    extraCatRefs.current.forEach((extraCatRef) => {
      if (!extraCatRef) return
      extraCatRef.visible = false
    })
  }, [isRunActive])

  // --- Hooks ---
  const { introStateRef } = useCatAnimation({
    groupRef, boardRef, catRef, grindLightRef, catModelRef,
    blinkStateRef: blinkState,
    musicRef, controlsEnabled, onJumpSfx,
    catRotX, catRotY, catRotZ,
    isTransitioning,
    freezeMotion,
    catStackControls,
  })

  useToonShaderSync({
    toonControls, blinkControls,
    toonMeshesRef, outlineMeshesRef,
    useOriginalMaterials,
    introStateRef,
    blinkStateRef: blinkState,
  })

  useFrame((_, delta) => {
    const actualExtraCatCount = Math.min(gameState.extraCatCount.current || 0, MAX_SIMULATED_EXTRA_CATS)
    const forcedLoad = THREE.MathUtils.clamp(catStackControls.forceLoad || 0, 0, MAX_SIMULATED_EXTRA_CATS)
    const effectiveLoadLevel = Math.max(gameState.loadLevel.current || 0, forcedLoad)
    const nextStackSpeedBonus = effectiveLoadLevel > 0
      ? catStackControls.speedBonus * effectiveLoadLevel
      : 0
    const didManualCatDropTrigger = manualCatDropTrigger !== handledManualCatDropRef.current
    const manualSimulation = manualSimulationRef.current

    if (gameState.stackSpeedBonus.current !== nextStackSpeedBonus) {
      gameState.stackSpeedBonus.current = nextStackSpeedBonus
    }

    if (didManualCatDropTrigger) {
      handledManualCatDropRef.current = manualCatDropTrigger
      const nextPreviewCount = manualSimulation.previewCount >= MAX_SIMULATED_EXTRA_CATS
        ? 1
        : manualSimulation.previewCount + 1
      gameState.extraCatCount.current = nextPreviewCount
      gameState.loadLevel.current = nextPreviewCount
      gameState.pendingCatDrop.current = false
      gameState.phaseAnnouncement.current = 'EXTRA CAT'
      emitHudScoreChange()
      manualSimulation.previewCount = nextPreviewCount
      extraCatPlopRef.current.active = true
      extraCatPlopRef.current.time = 0
      extraCatPlopRef.current.catIndex = nextPreviewCount - 1
      gameState.screenShake.current = Math.max(gameState.screenShake.current || 0, 0.18)
      onPlopSfx?.()
    }

    const actualDropTriggered = actualExtraCatCount > previousExtraCatCountRef.current && manualSimulation.previewCount === 0
    if (actualDropTriggered) {
      extraCatPlopRef.current.active = true
      extraCatPlopRef.current.time = 0
      extraCatPlopRef.current.catIndex = actualExtraCatCount - 1
      gameState.screenShake.current = Math.max(gameState.screenShake.current || 0, 0.18)
      onPlopSfx?.()
    }
    previousExtraCatCountRef.current = actualExtraCatCount

    const visibleExtraCatCount = manualSimulation.previewCount > 0
      ? manualSimulation.previewCount
      : Math.max(actualExtraCatCount, forcedLoad)

    if (visibleExtraCatCount === 0) {
      extraCatPlopRef.current.active = false
      extraCatPlopRef.current.time = 0
    }

    let extraCatYOffset = 0
    let boardPlopDrop = 0
    let boardPlopPitch = 0
    let extraCatScaleXZMultiplier = 1
    let extraCatScaleYMultiplier = 1
    let baseCatScaleXZMultiplier = 1
    let baseCatScaleYMultiplier = 1
    let baseCatSink = 0
    const activeDropIndex = extraCatPlopRef.current.catIndex ?? -1
    if (extraCatPlopRef.current.active) {
      extraCatPlopRef.current.time += delta
      const duration = Math.max(catStackControls.stackCatDropDuration, 0.001)
      const t = Math.min(extraCatPlopRef.current.time / duration, 1)
      const ease = THREE.MathUtils.smootherstep(t, 0, 1)
      extraCatYOffset = THREE.MathUtils.lerp(catStackControls.stackCatDropOffsetY, 0, ease)
      const bounce = Math.sin(t * Math.PI) * (1 - ease)
      const fallProgress = THREE.MathUtils.clamp(t / 0.72, 0, 1)
      const impactProgress = THREE.MathUtils.clamp((t - 0.56) / 0.44, 0, 1)
      const fallStretch = Math.sin(fallProgress * Math.PI) * (1 - impactProgress)
      const impactSquish = Math.sin(impactProgress * Math.PI)
      boardPlopDrop = -bounce * catStackControls.stackCatBoardDrop
      boardPlopPitch = bounce * catStackControls.stackCatBoardPitch
      extraCatScaleXZMultiplier = (
        1 -
        fallStretch * catStackControls.stackCatFallStretchXZ +
        impactSquish * catStackControls.stackCatImpactSquishXZ
      )
      extraCatScaleYMultiplier = (
        1 +
        fallStretch * catStackControls.stackCatFallStretchY -
        impactSquish * catStackControls.stackCatImpactSquishY
      )
      baseCatScaleXZMultiplier = 1 + impactSquish * catStackControls.baseCatImpactSquishXZ
      baseCatScaleYMultiplier = 1 - impactSquish * catStackControls.baseCatImpactSquishY
      baseCatSink = impactSquish * catStackControls.baseCatImpactSink
      if (t >= 1) {
        extraCatPlopRef.current.active = false
        extraCatPlopRef.current.time = 0
      }
    }

    extraCatRefs.current.forEach((extraCatRef, index) => {
      if (!extraCatRef) return
      const isVisible = index < visibleExtraCatCount
      extraCatRef.visible = isVisible
      if (!isVisible) return

      const catNumber = index + 1
      const stackCatPosX = catStackControls[`stackCat${catNumber}PosX`]
      const stackCatPosY = catStackControls[`stackCat${catNumber}PosY`]
      const stackCatPosZ = catStackControls[`stackCat${catNumber}PosZ`]
      const isDroppingCat = extraCatPlopRef.current.active && index === activeDropIndex
      const localExtraCatYOffset = isDroppingCat ? extraCatYOffset : 0
      const localScaleXZMultiplier = isDroppingCat ? extraCatScaleXZMultiplier : 1
      const localScaleYMultiplier = isDroppingCat ? extraCatScaleYMultiplier : 1
      extraCatRef.position.set(
        stackCatPosX,
        stackCatPosY + localExtraCatYOffset,
        stackCatPosZ
      )
      extraCatRef.rotation.set(
        catStackControls.stackCatRotX,
        catStackControls.stackCatRotY,
        catStackControls.stackCatRotZ
      )
      extraCatRef.scale.set(
        catStackControls.stackCatScale * localScaleXZMultiplier,
        catStackControls.stackCatScale * localScaleYMultiplier,
        catStackControls.stackCatScale * localScaleXZMultiplier
      )
    })

    if (catRef.current && extraCatPlopRef.current.active) {
      catRef.current.scale.set(
        catRef.current.scale.x * baseCatScaleXZMultiplier,
        catRef.current.scale.y * baseCatScaleYMultiplier,
        catRef.current.scale.z * baseCatScaleXZMultiplier
      )
      catRef.current.position.y -= baseCatSink
    }

    if (boardRef.current) {
      boardRef.current.position.y += boardPlopDrop
      boardRef.current.rotation.x += boardPlopPitch
    }

    if (!useContactShadow || !contactShadowRef.current || !contactShadowMaterialRef.current || !groupRef.current) return

    const shadowHeight = THREE.MathUtils.clamp(gameState.catHeight.current - 0.05, 0, 2.8)
    const leanAmount = Math.min(Math.abs(groupRef.current.rotation.x) + Math.abs(groupRef.current.rotation.z), 0.3)
    const depthStretch = 1 + shadowHeight * 0.32

    contactShadowRef.current.position.set(
      groupRef.current.position.x,
      0.003,
      groupRef.current.position.z + 0.04 + shadowHeight * 0.08
    )
    contactShadowRef.current.scale.set(
      1.35 + shadowHeight * 0.24 + leanAmount * 0.2,
      1.95 * depthStretch + leanAmount * 0.3,
      1
    )
    contactShadowMaterialRef.current.opacity = THREE.MathUtils.clamp(0.42 - shadowHeight * 0.11, 0.16, 0.42)
  })

  // --- Render ---
  return (
    <>
      {useContactShadow && contactShadowTexture && (
        <mesh ref={contactShadowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            ref={contactShadowMaterialRef}
            map={contactShadowTexture}
            color="#050301"
            transparent
            opacity={0.42}
            blending={THREE.MultiplyBlending}
            premultipliedAlpha
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
      )}
      <group ref={groupRef} position={[0, 0.05, 0]}>
        <group ref={boardRef}>
          <primitive
            object={skateClone}
            scale={2}
            rotation={[0, Math.PI / 2, 0]}
            position={[0, 0, 0]}
          />
          {showAccentLights && (
            <pointLight
              ref={grindLightRef}
              position={[0.14, 0.04, 0.38]}
              intensity={0}
              distance={0.01}
              decay={2}
              color="#ffb764"
            />
          )}
        </group>
        <group ref={catRef} position={[0, 0.2, 0]}>
          <primitive
            ref={catModelRef}
            object={catWithToon}
            scale={CAT_MODEL_SCALE}
            rotation={[catRotX, catRotY, catRotZ]}
          />
          <group ref={stackRigRef}>
            {stackedCatsWithToon.map((stackedCatWithToon, index) => (
              <group
                key={index}
                ref={(node) => {
                  extraCatRefs.current[index] = node
                }}
                visible={false}
                position={[
                  STACK_CAT_DEFAULT_POSITIONS[index].x,
                  STACK_CAT_DEFAULT_POSITIONS[index].y,
                  STACK_CAT_DEFAULT_POSITIONS[index].z,
                ]}
                rotation={EXTRA_CAT_REST_ROTATION.toArray()}
                scale={EXTRA_CAT_SCALE}
              >
                <primitive
                  object={stackedCatWithToon}
                  scale={1}
                  rotation={[catRotX, catRotY, catRotZ]}
                />
              </group>
            ))}
          </group>
        </group>
        <group ref={trailTargetRef} position={[0, 0.2, 1.5]} />
        {showAccentLights && (
          <pointLight
            position={[0.3, 0.8, 0.3]}
            intensity={3}
            distance={1.2}
            decay={2}
            color="#ffe8cc"
          />
        )}
      </group>
    </>
  )
}

useGLTF.preload('/models/skateboard.glb')
useGLTF.preload('/models/cat/scene.gltf')
