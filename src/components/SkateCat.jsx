import { useRef, useEffect, useMemo, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, useTexture } from '@react-three/drei'
import { useControls } from 'leva'
import * as THREE from 'three'
import { createIdleGrindSparkState, createIdleGrindState, gameState, getGameDelta } from '../store'
import { getNearestScheduledTarget, getPerceivedMusicTime, getTimingGradeFromOffset } from '../rhythm'

const toonVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;
  void main() {
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-viewPosition.xyz);
    vUv = uv;
    gl_Position = projectionMatrix * viewPosition;
  }
`

const toonFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uLightDirection;
  uniform float uGlossiness;
  uniform float uRimAmount;
  uniform float uRimThreshold;
  uniform float uSteps;
  uniform float uShadowBrightness;
  uniform float uBrightness;
  uniform vec3 uRimColor;
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform float uAlphaTest;
  uniform float uBlinkAmount;
  uniform vec2 uLeftEyeCenter;
  uniform vec2 uRightEyeCenter;
  uniform vec2 uEyeRadius;
  uniform vec3 uLidColor;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;
  void main() {
    vec4 texColor = vec4(1.0);
    if (uHasMap > 0.5) {
      texColor = texture2D(uMap, vUv);
    }
    if (texColor.a < uAlphaTest) discard;

    // Blink: cover eyes with lid color in UV space
    vec2 leftDist = (vUv - uLeftEyeCenter) / uEyeRadius;
    vec2 rightDist = (vUv - uRightEyeCenter) / uEyeRadius;
    float inLeftEye = 1.0 - smoothstep(0.8, 1.0, length(leftDist));
    float inRightEye = 1.0 - smoothstep(0.8, 1.0, length(rightDist));
    float eyeMask = max(inLeftEye, inRightEye);
    texColor.rgb = mix(texColor.rgb, uLidColor, eyeMask * uBlinkAmount);

    vec3 baseColor = uColor * pow(texColor.rgb, vec3(1.0 / uBrightness));
    float NdotL = dot(vNormal, normalize(uLightDirection));
    float lightVal = NdotL * 0.5 + 0.5;
    float stepped = floor(lightVal * uSteps) / uSteps;
    float lightIntensity = mix(uShadowBrightness, 1.0, stepped);
    vec3 halfVector = normalize(normalize(uLightDirection) + vViewDir);
    float NdotH = dot(vNormal, halfVector);
    float specularIntensity = pow(max(NdotH, 0.0) * max(NdotL, 0.0), 1000.0 / uGlossiness);
    float specular = smoothstep(0.05, 0.1, specularIntensity);
    float rimDot = 1.0 - dot(vViewDir, vNormal);
    float rimIntensity = rimDot * pow(max(NdotL, 0.0), uRimThreshold);
    rimIntensity = smoothstep(uRimAmount - 0.01, uRimAmount + 0.01, rimIntensity);
    vec3 finalColor = baseColor * lightIntensity + specular * vec3(0.06) + rimIntensity * uRimColor;
    gl_FragColor = vec4(finalColor, texColor.a);
  }
`

const outlineVertexShader = /* glsl */ `
  uniform float uThickness;
  void main() {
    vec3 pos = position + normal * uThickness;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

const outlineFragmentShader = /* glsl */ `
  uniform vec3 uOutlineColor;
  void main() {
    gl_FragColor = vec4(uOutlineColor, 1.0);
  }
`

function createToonMaterial() {
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

function createOutlineMaterial() {
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

const JUMP_HEIGHT = 1.2
const JUMP_DURATION = 0.34
const JUMP_TAKEOFF_HEADSTART = 1 / 120
const KICKFLIP_ROTATIONS = 1
const SPIN_DURATION = 0.29
const SPIN_INPUT_BUFFER_DURATION = 0.14
const GROUND_SPIN_POINTS = 1
const INPUT_TIMING_COMPENSATION_SECONDS = 0.08
const CAT_LATERAL_TRACKING = 0.32
const CAT_LATERAL_LIMIT = 0.14
const CAT_GROUNDED_LERP = 4.5
const RAIL_JUMP_HEIGHT = 1.65
const GRIND_GROUP_HEIGHT = 0.44
const GRIND_ALIGN_LERP = 10
const GRIND_BOB_HEIGHT = 0.012
const GRIND_LEAN_Z = -0.16
const GRIND_PITCH_X = -0.02
const GRIND_ENTRY_DURATION = 0.16
const GRIND_ENTRY_FLOAT = 0.04
const GRIND_CONTACT_FLASH_DECAY = 5.2
const GRIND_BALANCE_SWAY_Z = 0.045
const GRIND_BALANCE_PITCH_X = 0.018
const GRIND_BALANCE_BOB_Y = 0.014
const GRIND_CAT_BALANCE_X = 0.016
const GRIND_CAT_BALANCE_Y = 0.012
const GRIND_CAT_BALANCE_YAW = 0.05
const GRIND_CAT_BALANCE_LEAN = 0.07
const POWERSLIDE_ENTER_LERP = 9
const POWERSLIDE_BOARD_YAW = 0.82
const POWERSLIDE_GROUP_LEAN_Z = 0.18
const POWERSLIDE_GROUP_PITCH_X = 0.02
const POWERSLIDE_CAT_LEAN_Z = -0.22
const POWERSLIDE_CAT_TURN_Y = 0.18
const POWERSLIDE_CAT_OFFSET_X = 0.035
const POWERSLIDE_CAT_CROUCH = 0.045
const BOARD_LANDING_RECOIL_DURATION = 0.26
const BOARD_LANDING_DIP = 0.032
const BOARD_LANDING_PITCH = 0.12
const DEATH_IMPACT_RECOIL_Z = 0.28
const DEATH_IMPACT_RECOIL_PITCH = -0.2
const DEATH_IMPACT_RECOIL_ROLL = 0.06

// Death animation params
const DEATH_HOP_HEIGHT = 0.6
const DEATH_HOP_DURATION = 0.4
const DEATH_WALK_SPEED = 1.2
const DEATH_WALK_BOB_SPEED = 8
const DEATH_WALK_BOB_HEIGHT = 0.06
const _grindSparkLocal = new THREE.Vector3()
const _grindSparkWorld = new THREE.Vector3()

export default function SkateCat({ trailTargetRef, controlsEnabled = true, hasStartedGame = false, musicRef, onJumpTiming, onJumpSfx }) {
  const { catRotX, catRotY, catRotZ } = useControls('Cat', {
    catRotX: { value: 0, min: -Math.PI, max: Math.PI, step: 0.05 },
    catRotY: { value: 1.3, min: -Math.PI, max: Math.PI, step: 0.05 },
    catRotZ: { value: 0, min: -Math.PI, max: Math.PI, step: 0.05 },
  })

  const toonControls = useControls('Cat Toon Shader', {
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
  })

  const blinkControls = useControls('Cat Blink', {
    leftEyeX: { value: 0.84, min: 0, max: 1, step: 0.005 },
    leftEyeY: { value: 0.60, min: 0, max: 1, step: 0.005 },
    rightEyeX: { value: 0.66, min: 0, max: 1, step: 0.005 },
    rightEyeY: { value: 0.57, min: 0, max: 1, step: 0.005 },
    eyeRadiusX: { value: 0.08, min: 0.005, max: 0.15, step: 0.005 },
    eyeRadiusY: { value: 0.05, min: 0.005, max: 0.15, step: 0.005 },
    lidColor: '#1a1a2e',
    forceClose: false,
  })

  const introControls = useControls('Cat Intro', {
    introX: { value: 0.70, min: -3, max: 3, step: 0.05 },
    introY: { value: 0.15, min: -1, max: 2, step: 0.05 },
    introZ: { value: 0.50, min: -3, max: 3, step: 0.05 },
    introRotX: { value: -0.1, min: -Math.PI, max: Math.PI, step: 0.05 },
    introRotY: { value: -1.5, min: -Math.PI, max: Math.PI, step: 0.05 },
    introRotZ: { value: 0.60, min: -Math.PI, max: Math.PI, step: 0.05 },
    introScale: { value: 0.025, min: 0.01, max: 0.05, step: 0.001 },
  })

  const boxControls = useControls('Intro Box', {
    boxX: { value: 0.35, min: -3, max: 3, step: 0.05 },
    boxY: { value: 0, min: -2, max: 2, step: 0.05 },
    boxZ: { value: 0.20, min: -3, max: 3, step: 0.05 },
    boxScale: { value: 6, min: 1, max: 50, step: 1 },
    boxRotY: { value: 0.30, min: -Math.PI, max: Math.PI, step: 0.05 },
  })

  const blinkState = useRef({ timer: 3, blinking: false, blinkTime: 0, amount: 0, blinksLeft: 0 })

  const groupRef = useRef()
  const boardRef = useRef()
  const catRef = useRef()
  const grindLightRef = useRef()
  const skateboard = useGLTF('/skateboard.glb')
  const { scene: catScene } = useGLTF('/maxwell_the_cat_dingus/scene.gltf')
  const { scene: boxScene } = useGLTF('/empty_cardboard_box/scene.gltf')
  const boxRef = useRef()
  const catModelRef = useRef()
  const paintedBodyMapSource = useTexture('/maxwell_the_cat_dingus/textures/dingus_baseColor_painted-2.jpg')
  const paintedBodyMap = useMemo(() => {
    const map = paintedBodyMapSource.clone()
    map.flipY = false
    map.colorSpace = THREE.SRGBColorSpace
    map.wrapS = THREE.RepeatWrapping
    map.wrapT = THREE.RepeatWrapping
    map.needsUpdate = true
    return map
  }, [paintedBodyMapSource])
  const skateClone = useMemo(() => {
    const clone = skateboard.scene.clone()
    clone.traverse((child) => { if (child.isMesh) child.castShadow = true })
    return clone
  }, [skateboard])

  // Apply toon shading to a clone of the cat model
  const catWithToon = useMemo(() => {
    const clone = catScene.clone(true)

    // Capture original materials before replacing
    const originals = new Map()
    clone.traverse((child) => {
      if (child.isMesh) originals.set(child, child.material.clone())
    })

    // Apply toon shader materials
    clone.traverse((child) => {
      if (!child.isMesh) return
      const oldMat = originals.get(child)
      if (!oldMat) return

      const mat = createToonMaterial()
      const map = oldMat.name === 'dingus' ? paintedBodyMap : oldMat.map
      if (map) { mat.uniforms.uMap.value = map; mat.uniforms.uHasMap.value = 1.0 }
      if (oldMat.transparent) { mat.transparent = true; mat.uniforms.uAlphaTest.value = 0.5; mat.depthWrite = false }
      if (oldMat.side === THREE.DoubleSide) mat.side = THREE.DoubleSide
      child.material = mat
      child.castShadow = true

      // Add outline mesh for non-transparent meshes
      if (!oldMat.transparent && child.geometry) {
        const outlineMat = createOutlineMaterial()
        const outlineMesh = new THREE.Mesh(child.geometry, outlineMat)
        outlineMesh.matrixAutoUpdate = false
        outlineMesh.userData.__toonOutline = true
        child.add(outlineMesh)
      }
    })

    return clone
  }, [catScene, paintedBodyMap])

  // Apply toon shading to the box model
  const boxWithToon = useMemo(() => {
    const clone = boxScene.clone(true)
    const meshes = []
    clone.traverse((child) => { if (child.isMesh) meshes.push(child) })
    for (const child of meshes) {
      const oldMat = child.material
      const mat = createToonMaterial()
      if (oldMat.map) { mat.uniforms.uMap.value = oldMat.map; mat.uniforms.uHasMap.value = 1.0 }
      if (oldMat.transparent) { mat.transparent = true; mat.uniforms.uAlphaTest.value = 0.5; mat.depthWrite = false }
      if (oldMat.side === THREE.DoubleSide) mat.side = THREE.DoubleSide
      child.material = mat
      child.castShadow = true

      if (!oldMat.transparent && child.geometry) {
        const outlineMat = createOutlineMaterial()
        const outlineMesh = new THREE.Mesh(child.geometry, outlineMat)
        outlineMesh.matrixAutoUpdate = false
        outlineMesh.userData.__toonOutline = true
        child.add(outlineMesh)
      }
    }
    return clone
  }, [boxScene])

  // Cache mesh references to avoid traverse() every frame
  const toonMeshesRef = useRef([])
  const outlineMeshesRef = useRef([])
  useEffect(() => {
    const toonMeshes = []
    const outlineMeshes = []
    const sources = [catWithToon, boxWithToon]

    for (const root of sources) {
      root.traverse((child) => {
        if (!child.isMesh || !child.material?.isShaderMaterial) return
        if (child.userData.__toonOutline) {
          outlineMeshes.push(child)
        } else if (child.material.uniforms?.uLightDirection) {
          toonMeshes.push(child)
        }
      })
    }

    toonMeshesRef.current = toonMeshes
    outlineMeshesRef.current = outlineMeshes
  }, [catWithToon, boxWithToon])

  const jumpState = useRef({
    active: false,
    time: 0,
    direction: 1,
    startX: 0,
    targetX: 0,
    startY: 0.05,
    endY: 0.05,
    arcHeight: JUMP_HEIGHT,
    doesFlip: true,
    canSpinTrick: false,
    didSpinTrick: false,
  })
  const squashState = useRef({ active: false, time: 0 })
  const boardLandingState = useRef({ active: false, time: 0, roll: 0, strength: 1 })
  const SQUASH_DURATION = 0.4

  // Intro toon shader overrides (lerp to gameplay values on start)
  const INTRO_TOON = {
    lightX: 20.0, lightY: 13.0, lightZ: 2.0,
    rimAmount: 0.45, shadowBrightness: 0.05,
    brightness: 2.05, outlineThickness: 0.0,
  }
  const introLerp = useRef(0) // 0 = intro, 1 = gameplay

  // Intro hop-on state
  const introState = useRef({
    phase: 'idle', // 'idle' | 'hopping' | 'done'
    time: 0,
  })
  const HOP_ON_DURATION = 0.4
  const HOP_ON_HEIGHT = 0.8
  const CAT_INTRO_OFFSET_X = 1.2 // cat starts to the side
  const CAT_INTRO_Y = 0.0 // cat starts on the ground

  const deathState = useRef({
    active: false,
    time: 0,
  })
  const spinState = useRef({
    active: false,
    time: 0,
  })
  const spinInputBuffer = useRef(0)
  const powerslideState = useRef({
    amount: 0,
    direction: 1,
  })
  const grindContactState = useRef({
    flash: 0,
    motionTime: 0,
  })
  const grindEntryState = useRef({
    active: false,
    time: 0,
    obstacleId: 0,
    startX: 0,
    startY: 0.05,
    startRotX: 0,
    startRotZ: 0,
    startBoardYaw: 0,
    startBoardRoll: 0,
  })

  const wasGameOver = useRef(false)
  const wasGrinding = useRef(false)

  const getDesiredRoadOffset = (targetX = 0) => THREE.MathUtils.clamp(targetX * CAT_LATERAL_TRACKING, -CAT_LATERAL_LIMIT, CAT_LATERAL_LIMIT)
  const triggerCatSpin = useCallback(() => {
    spinState.current.active = true
    spinState.current.time = 0
  }, [])
  const triggerSpinTrick = useCallback(() => {
    if (jumpState.current.didSpinTrick) return false

    jumpState.current.didSpinTrick = true
    if (gameState.pendingJumpTiming.current) {
      gameState.pendingJumpTiming.current = {
        ...gameState.pendingJumpTiming.current,
        trickName: '360',
      }
    }
    triggerCatSpin()
    return true
  }, [triggerCatSpin])
  const triggerGroundSpin = useCallback(() => {
    gameState.score += GROUND_SPIN_POINTS
    gameState.lastScoringEvent.current = {
      id: performance.now(),
      points: GROUND_SPIN_POINTS,
      grade: 'Spin',
      multiplier: gameState.scoreMultiplier.current,
      isRail: false,
      trickName: '360',
    }
    triggerCatSpin()
  }, [triggerCatSpin])

  const setGrindSparkInactive = useCallback(() => {
    if (!gameState.grindSpark.current) {
      gameState.grindSpark.current = createIdleGrindSparkState()
      return
    }
    gameState.grindSpark.current.active = false
    gameState.grindSpark.current.intensity = 0
  }, [])

  const updateGrindSpark = useCallback((direction) => {
    if (!boardRef.current) {
      setGrindSparkInactive()
      return
    }

    const grindSpark = gameState.grindSpark.current || createIdleGrindSparkState()
    gameState.grindSpark.current = grindSpark
    _grindSparkLocal.set(direction * 0.08, -0.06, 0.44)
    boardRef.current.updateWorldMatrix(true, false)
    _grindSparkWorld.copy(_grindSparkLocal)
    boardRef.current.localToWorld(_grindSparkWorld)
    grindSpark.active = true
    grindSpark.position[0] = _grindSparkWorld.x
    grindSpark.position[1] = _grindSparkWorld.y
    grindSpark.position[2] = _grindSparkWorld.z
    grindSpark.direction = direction
    const speedRatio = Math.min(1.35, gameState.speed.current / Math.max(gameState.baseSpeed, 0.001))
    grindSpark.intensity = 0.7 + speedRatio * 0.45
  }, [setGrindSparkInactive])

  const triggerGrindImpact = useCallback((direction) => {
    updateGrindSpark(direction)
    const grindSpark = gameState.grindSpark.current || createIdleGrindSparkState()
    gameState.grindSpark.current = grindSpark
    grindSpark.impactId += 1
    grindSpark.intensity = Math.max(grindSpark.intensity, 1.15)
    grindContactState.current.flash = 1
    if (grindLightRef.current) {
      grindLightRef.current.intensity = 6.2
      grindLightRef.current.distance = 1.35
    }
    gameState.screenShake.current = Math.max(gameState.screenShake.current || 0, 0.24)
  }, [updateGrindSpark])

  const resetContactEffects = () => {
    grindContactState.current.flash = 0
    grindContactState.current.motionTime = 0
  }

  const resetPoseToBoard = () => {
    resetContactEffects()
    deathState.current.active = false
    deathState.current.time = 0
    jumpState.current.active = false
    jumpState.current.time = 0
    spinState.current.active = false
    spinState.current.time = 0
    powerslideState.current.amount = 0
    powerslideState.current.direction = 1
    grindEntryState.current.active = false
    grindEntryState.current.time = 0
    grindEntryState.current.obstacleId = 0
    squashState.current.active = false
    squashState.current.time = 0
    boardLandingState.current.active = false
    boardLandingState.current.time = 0
    boardLandingState.current.roll = 0
    boardLandingState.current.strength = 1
    spinInputBuffer.current = 0
    wasGrinding.current = false
    introState.current.phase = 'done'
    introState.current.time = 0
    if (groupRef.current) {
      groupRef.current.position.set(0, 0.05, 0)
      groupRef.current.rotation.set(0, 0, 0)
    }
    gameState.grindSpark.current = createIdleGrindSparkState()
    gameState.catHeight.current = 0.05
    if (catRef.current) {
      catRef.current.position.set(0, 0.2, 0)
      catRef.current.rotation.set(0, 0, 0)
      catRef.current.scale.set(1, 1, 1)
    }
    if (boardRef.current) {
      boardRef.current.position.y = 0
      boardRef.current.rotation.x = 0
      boardRef.current.rotation.y = 0
      boardRef.current.rotation.z = 0
    }
  }

  const preparePoseForDeath = () => {
    resetContactEffects()
    jumpState.current.active = false
    jumpState.current.time = 0
    spinState.current.active = false
    spinState.current.time = 0
    powerslideState.current.amount = 0
    powerslideState.current.direction = 1
    grindEntryState.current.active = false
    grindEntryState.current.time = 0
    grindEntryState.current.obstacleId = 0
    boardLandingState.current.active = false
    boardLandingState.current.time = 0
    boardLandingState.current.roll = 0
    boardLandingState.current.strength = 1
    spinInputBuffer.current = 0
    wasGrinding.current = false

    if (groupRef.current) {
      groupRef.current.position.y = 0.05
      groupRef.current.position.z = DEATH_IMPACT_RECOIL_Z
      groupRef.current.rotation.set(0, 0, 0)
    }
    if (catRef.current) {
      catRef.current.position.set(0, 0.2, 0)
      catRef.current.rotation.set(0, 0, 0)
      catRef.current.scale.set(1, 1, 1)
    }
    if (boardRef.current) {
      boardRef.current.position.y = 0
      boardRef.current.rotation.x = DEATH_IMPACT_RECOIL_PITCH
      boardRef.current.rotation.y = 0
      boardRef.current.rotation.z = DEATH_IMPACT_RECOIL_ROLL
    }

    gameState.catHeight.current = 0.05
  }

  const beginGrindEntry = useCallback((activeGrind) => {
    if (!groupRef.current) return

    grindEntryState.current.active = true
    grindEntryState.current.time = 0
    grindEntryState.current.obstacleId = activeGrind.obstacleId
    grindEntryState.current.startX = groupRef.current.position.x
    grindEntryState.current.startY = groupRef.current.position.y
    grindEntryState.current.startRotX = groupRef.current.rotation.x
    grindEntryState.current.startRotZ = groupRef.current.rotation.z
    grindEntryState.current.startBoardYaw = boardRef.current?.rotation.y || 0
    grindEntryState.current.startBoardRoll = boardRef.current?.rotation.z || 0

    gameState.screenShake.current = Math.max(gameState.screenShake.current || 0, 0.12)
    triggerGrindImpact(activeGrind.x < 0 ? -1 : 1)
  }, [triggerGrindImpact])

  const triggerBoardLandingRecoil = useCallback(({ fromGrind = false, direction = 1 } = {}) => {
    const currentBoardRoll = boardRef.current?.rotation.z || 0
    const grindExitRoll = fromGrind ? direction * 0.035 : 0
    boardLandingState.current.active = true
    boardLandingState.current.time = 0
    boardLandingState.current.roll = THREE.MathUtils.clamp(
      Math.abs(currentBoardRoll) > Math.abs(grindExitRoll) ? currentBoardRoll * 0.45 : grindExitRoll,
      -0.05,
      0.05
    )
    boardLandingState.current.strength = fromGrind ? 1.15 : 1
  }, [])

  const triggerCatLandingJiggle = useCallback(() => {
    squashState.current.active = true
    squashState.current.time = 0
  }, [])

  const triggerLandingEffects = useCallback(({ fromGrind = false, direction = 1 } = {}) => {
    if (!groupRef.current) return

    gameState.screenShake.current = 0.3
    const wp = new THREE.Vector3()
    groupRef.current.getWorldPosition(wp)
    gameState.landed.current = { triggered: true, position: [wp.x, wp.y, wp.z] }
    triggerCatLandingJiggle()
    triggerBoardLandingRecoil({ fromGrind, direction })

    const bs = blinkState.current
    if (!bs.blinking) {
      bs.blinking = true
      bs.blinkTime = 0
      bs.blinksLeft = 0
    }
  }, [triggerBoardLandingRecoil, triggerCatLandingJiggle])

  const triggerKickflipEffect = useCallback(() => {
    if (!groupRef.current) return

    const wp = new THREE.Vector3()
    groupRef.current.getWorldPosition(wp)
    gameState.kickflip.current = { triggered: true, position: [wp.x, wp.y, wp.z] }
  }, [])
  const primeJumpTakeoffPose = useCallback(() => {
    if (!groupRef.current) return

    const jump = jumpState.current
    jump.time = JUMP_TAKEOFF_HEADSTART
    const t = jump.time / JUMP_DURATION
    const height = 4 * jump.arcHeight * t * (1 - t)
    const travelT = THREE.MathUtils.smootherstep(t, 0, 1)
    groupRef.current.position.y = THREE.MathUtils.lerp(jump.startY, jump.endY, travelT) + height
    groupRef.current.position.x = THREE.MathUtils.lerp(jump.startX, jump.targetX, travelT)

    if (boardRef.current) {
      boardRef.current.rotation.y = THREE.MathUtils.lerp(boardRef.current.rotation.y, 0, t * 12)
      boardRef.current.rotation.z = jump.doesFlip
        ? t * Math.PI * 2 * KICKFLIP_ROTATIONS * jump.direction
        : THREE.MathUtils.lerp(boardRef.current.rotation.z, 0, t * 12)
    }
  }, [])

  const getJumpPlan = useCallback((musicTime, { fromGrind = false, blockedObstacleId = 0 } = {}) => {
    const adjustedMusicTime = getPerceivedMusicTime(musicTime) + INPUT_TIMING_COMPENSATION_SECONDS
    const availableTargets = blockedObstacleId
      ? gameState.obstacleTargets.current.filter((target) => target.id !== blockedObstacleId)
      : gameState.obstacleTargets.current
    const nearestTarget = getNearestScheduledTarget(adjustedMusicTime, availableTargets)
    const timingLabel = nearestTarget ? getTimingGradeFromOffset(nearestTarget.offset) : 'Sloppy'
    const coveredObstacleIds = nearestTarget
      ? availableTargets
        .filter((target) => target.clusterId === nearestTarget.clusterId)
        .map((target) => target.id)
      : []
    const nextLandingTarget = nearestTarget
      ? availableTargets.find((target) =>
        target.clusterId !== nearestTarget.clusterId && target.targetTime > nearestTarget.targetTime + 0.01
      ) || nearestTarget
      : null
    const landingTarget = nearestTarget?.isVertical ? nearestTarget : nextLandingTarget

    return {
      coveredObstacleIds,
      nearestTarget,
      targetX: getDesiredRoadOffset(landingTarget?.x || 0),
      timingLabel,
      isRailJump: fromGrind || Boolean(nearestTarget?.isVertical),
      shouldKickflip: !fromGrind && !nearestTarget?.isVertical,
    }
  }, [])

  const startJump = useCallback(({ fromGrind = false } = {}) => {
    const releasedGrindId = fromGrind ? gameState.activeGrind.current.obstacleId : 0
    const grindDirection = gameState.activeGrind.current?.x < 0 ? -1 : 1
    if (fromGrind && releasedGrindId) {
      gameState.grindCooldownObstacleId.current = releasedGrindId
      triggerCatLandingJiggle()
      triggerBoardLandingRecoil({ fromGrind: true, direction: grindDirection })
      gameState.activeGrind.current = createIdleGrindState()
    }

    jumpState.current.active = true
    jumpState.current.time = 0
    jumpState.current.direction = Math.random() < 0.5 ? 1 : -1
    jumpState.current.startX = groupRef.current?.position.x || 0
    jumpState.current.targetX = jumpState.current.startX
    jumpState.current.startY = groupRef.current?.position.y || 0.05
    jumpState.current.endY = 0.05
    jumpState.current.arcHeight = fromGrind ? RAIL_JUMP_HEIGHT : JUMP_HEIGHT
    jumpState.current.doesFlip = false
    jumpState.current.canSpinTrick = !fromGrind
    jumpState.current.didSpinTrick = false

    if (onJumpSfx) onJumpSfx()

    const musicTime = musicRef?.current?.currentTime
    if (typeof musicTime === 'number' && Number.isFinite(musicTime)) {
      const jumpPlan = getJumpPlan(musicTime, { fromGrind, blockedObstacleId: releasedGrindId })
      jumpState.current.targetX = jumpPlan.targetX
      jumpState.current.arcHeight = jumpPlan.isRailJump ? RAIL_JUMP_HEIGHT : JUMP_HEIGHT
      jumpState.current.doesFlip = jumpPlan.shouldKickflip
      jumpState.current.canSpinTrick = !jumpPlan.isRailJump
      gameState.pendingJumpTiming.current = {
        obstacleIds: jumpPlan.coveredObstacleIds,
        primaryObstacleId: jumpPlan.nearestTarget?.id ?? null,
        grade: jumpPlan.timingLabel,
        offset: jumpPlan.nearestTarget?.offset ?? null,
        timestamp: getPerceivedMusicTime(musicTime),
        trickName: '',
        trickAwarded: false,
        isRailTarget: jumpPlan.isRailJump,
      }
      if (jumpPlan.shouldKickflip) {
        triggerKickflipEffect()
      }
      primeJumpTakeoffPose()
      if (onJumpTiming) onJumpTiming(jumpPlan.timingLabel)
      return
    }

    if (!fromGrind) {
      jumpState.current.doesFlip = true
      triggerKickflipEffect()
    }
    primeJumpTakeoffPose()
  }, [getJumpPlan, musicRef, onJumpSfx, onJumpTiming, primeJumpTakeoffPose, triggerBoardLandingRecoil, triggerCatLandingJiggle, triggerKickflipEffect])

  // Trigger hop-on when game starts
  const prevStarted = useRef(false)
  useEffect(() => {
    if (hasStartedGame && !prevStarted.current) {
      introState.current.phase = 'hopping'
      introState.current.time = 0
    }
    prevStarted.current = hasStartedGame
  }, [hasStartedGame])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (!controlsEnabled) return

      if (e.key === 'ArrowUp') {
        gameState.upArrowHeld.current = true
        if (e.repeat) return
      }

      if (gameState.gameOver) return
      if (e.key === 'ArrowUp' && !jumpState.current.active) {
        startJump({ fromGrind: Boolean(gameState.activeGrind.current.active) })
      }
      if (
        (e.key === 'ArrowLeft' || e.key === 'ArrowDown') &&
        !e.repeat
      ) {
        const canTriggerGroundSpin = (
          !jumpState.current.active &&
          !gameState.activeGrind.current.active &&
          !spinState.current.active
        )
        const canTriggerSpinTrick = (
          jumpState.current.active &&
          jumpState.current.canSpinTrick &&
          !jumpState.current.didSpinTrick &&
          !spinState.current.active
        )

        if (canTriggerGroundSpin) {
          triggerGroundSpin()
        } else if (canTriggerSpinTrick) {
          triggerSpinTrick()
        } else {
          spinInputBuffer.current = SPIN_INPUT_BUFFER_DURATION
        }
      }
    }

    const onKeyUp = (e) => {
      if (e.key === 'ArrowUp') {
        gameState.upArrowHeld.current = false
      }
    }

    const onBlur = () => {
      gameState.upArrowHeld.current = false
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      gameState.upArrowHeld.current = false
    }
  }, [controlsEnabled, startJump, triggerGroundSpin, triggerSpinTrick])

  // Sync toon controls + blink in one pass using cached mesh refs
  useFrame((_, delta) => {
    const gameDelta = getGameDelta(delta)
    // Blink animation
    const BLINK_DURATION = 0.35
    const PAUSE_BETWEEN = 0.08
    const MIN_INTERVAL = 1.5
    const MAX_INTERVAL = 4.0
    const s = blinkState.current

    if (blinkControls.forceClose) {
      s.amount = 1.0
    } else {
      if (!s.blinking) {
        s.timer -= gameDelta
        if (s.timer <= 0) {
          s.blinking = true
          s.blinkTime = 0
          const r = Math.random()
          s.blinksLeft = r < 0.1 ? 2 : r < 0.4 ? 1 : 0
        }
      } else {
        s.blinkTime += gameDelta
        if (s.blinkTime >= BLINK_DURATION) {
          if (s.blinksLeft > 0) {
            s.blinksLeft--
            s.blinkTime = -PAUSE_BETWEEN
          } else {
            s.blinking = false
            s.timer = MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL)
          }
        }
      }
      if (s.blinking && s.blinkTime >= 0) {
        s.amount = Math.sin((s.blinkTime / BLINK_DURATION) * Math.PI)
      } else {
        s.amount = 0
      }
    }

    // Lerp intro -> gameplay
    const targetLerp = introState.current.phase === 'idle' ? 0 : 1
    introLerp.current = THREE.MathUtils.lerp(introLerp.current, targetLerp, gameDelta * 3)
    const il = introLerp.current
    const mix = (intro, gameplay) => intro + (gameplay - intro) * il

    // Update toon + blink uniforms on cached meshes (no traverse)
    /* eslint-disable react-hooks/immutability */
    for (const child of toonMeshesRef.current) {
      const u = child.material.uniforms
      u.uLightDirection.value.set(
        mix(INTRO_TOON.lightX, toonControls.lightX),
        mix(INTRO_TOON.lightY, toonControls.lightY),
        mix(INTRO_TOON.lightZ, toonControls.lightZ),
      )
      u.uGlossiness.value = toonControls.glossiness
      u.uRimAmount.value = mix(INTRO_TOON.rimAmount, toonControls.rimAmount)
      u.uRimThreshold.value = toonControls.rimThreshold
      u.uRimColor.value.set(toonControls.rimColor)
      u.uSteps.value = toonControls.steps
      u.uShadowBrightness.value = mix(INTRO_TOON.shadowBrightness, toonControls.shadowBrightness)
      u.uBrightness.value = mix(INTRO_TOON.brightness, toonControls.brightness)
      u.uLeftEyeCenter.value.set(blinkControls.leftEyeX, blinkControls.leftEyeY)
      u.uRightEyeCenter.value.set(blinkControls.rightEyeX, blinkControls.rightEyeY)
      u.uEyeRadius.value.set(blinkControls.eyeRadiusX, blinkControls.eyeRadiusY)
      u.uLidColor.value.set(blinkControls.lidColor)
      u.uBlinkAmount.value = s.amount
    }
    for (const child of outlineMeshesRef.current) {
      child.material.uniforms.uThickness.value = mix(INTRO_TOON.outlineThickness, toonControls.outlineThickness)
      child.material.uniforms.uOutlineColor.value.set(toonControls.outlineColor)
    }
    /* eslint-enable react-hooks/immutability */
  })

  useFrame((state, delta) => {
    if (!groupRef.current || !catRef.current) return
    const gameDelta = getGameDelta(delta)

    // Intro: cat sits beside the board, then hops on
    const intro = introState.current
    if (intro.phase === 'idle') {
      setGrindSparkInactive()
      gameState.catHeight.current = introControls.introY
      // Cat on ground, facing camera, no board
      catRef.current.position.set(introControls.introX, introControls.introY, introControls.introZ)
      catRef.current.rotation.set(0, introControls.introRotY, 0)
      if (boardRef.current) boardRef.current.visible = false
      if (boxRef.current) boxRef.current.visible = true
      // Intro scale + rotation + breathing effect
      if (catModelRef.current) {
        catModelRef.current.scale.setScalar(introControls.introScale)
        catModelRef.current.rotation.set(introControls.introRotX, introControls.introRotY, introControls.introRotZ)
      }
      const breath = Math.sin(state.clock.elapsedTime * 1.8) * 0.03
      catRef.current.scale.set(1, 1 + breath, 1)
      return
    }
    if (intro.phase === 'hopping') {
      setGrindSparkInactive()
      if (boardRef.current) boardRef.current.visible = true
      if (boxRef.current) boxRef.current.visible = false
      intro.time += delta
      const t = Math.min(intro.time / HOP_ON_DURATION, 1)
      if (catModelRef.current) {
        const s = THREE.MathUtils.lerp(introControls.introScale, 0.03, t)
        catModelRef.current.scale.setScalar(s)
        catModelRef.current.rotation.x = THREE.MathUtils.lerp(introControls.introRotX, catRotX, t)
        catModelRef.current.rotation.y = THREE.MathUtils.lerp(introControls.introRotY, catRotY, t)
        catModelRef.current.rotation.z = THREE.MathUtils.lerp(introControls.introRotZ, catRotZ, t)
      }
      // Arc from intro position to on-board
      const hopHeight = 4 * HOP_ON_HEIGHT * t * (1 - t)
      const x = introControls.introX * (1 - t)
      const z = introControls.introZ * (1 - t)
      const y = introControls.introY + hopHeight + 0.2 * t
      gameState.catHeight.current = y
      catRef.current.position.set(x, y, z)
      // Rotate from facing camera to facing forward
      catRef.current.rotation.set(0, introControls.introRotY * (1 - t), 0)
      if (t >= 1) {
        intro.phase = 'done'
        catRef.current.position.set(0, 0.2, 0)
        catRef.current.rotation.set(0, 0, 0)
        // Landing squash
        squashState.current.active = true
        squashState.current.time = 0
      }
      return
    }

    // Reset on restart
    if (wasGameOver.current && !gameState.gameOver) {
      wasGameOver.current = false
      resetPoseToBoard()
      return
    }

    // Safety reset: if death animation was active but game is now running, force a clean pose.
    if (!gameState.gameOver && deathState.current.active) {
      resetPoseToBoard()
    }

    // Death animation — cat hops off board then walks away
    if (gameState.gameOver) {
      wasGameOver.current = true
      resetContactEffects()
      setGrindSparkInactive()

      if (!deathState.current.active) {
        preparePoseForDeath()
        deathState.current.active = true
        deathState.current.time = 0
      }

      deathState.current.time += delta
      const elapsed = deathState.current.time

      if (groupRef.current) {
        groupRef.current.position.y = 0.05
        groupRef.current.position.z = DEATH_IMPACT_RECOIL_Z
      }
      if (boardRef.current) {
        boardRef.current.position.y = 0
        boardRef.current.rotation.x = DEATH_IMPACT_RECOIL_PITCH
        boardRef.current.rotation.y = 0
        boardRef.current.rotation.z = DEATH_IMPACT_RECOIL_ROLL
      }

      if (elapsed < DEATH_HOP_DURATION) {
        // Phase 1: hop off the skateboard
        const t = elapsed / DEATH_HOP_DURATION
        const hopHeight = 4 * DEATH_HOP_HEIGHT * t * (1 - t)
        catRef.current.position.x = t * 0.8
        catRef.current.position.y = 0.2 + hopHeight
        // Slight lean as cat hops off
        catRef.current.rotation.z = Math.sin(t * Math.PI) * 0.3
      } else {
        // Phase 2: walk away casually
        const walkTime = elapsed - DEATH_HOP_DURATION
        const walkDist = walkTime * DEATH_WALK_SPEED
        const bob = Math.abs(Math.sin(walkTime * DEATH_WALK_BOB_SPEED)) * DEATH_WALK_BOB_HEIGHT
        catRef.current.position.x = 0.8 + walkDist
        catRef.current.position.y = 0.2 + bob
        catRef.current.rotation.z = Math.sin(walkTime * DEATH_WALK_BOB_SPEED) * 0.05
        // Turn cat to face walking direction
        catRef.current.rotation.y = Math.PI * 0.5
      }

      gameState.catHeight.current = groupRef.current.position.y
      return
    }

    const targetSpeed = gameState.baseSpeed + (
      gameState.speedBoostActive ? gameState.postMilestoneSpeedBoost : 0
    )
    gameState.speed.current = THREE.MathUtils.lerp(gameState.speed.current, targetSpeed, gameDelta * 4)
    const musicTime = getPerceivedMusicTime(musicRef?.current?.currentTime || 0)
    const upcomingTarget = gameState.obstacleTargets.current.find((target) => target.targetTime >= musicTime - 0.02)
    const groundedTargetX = getDesiredRoadOffset(upcomingTarget?.x || 0)

    const jump = jumpState.current
    const activeGrind = gameState.activeGrind.current
    const isGrinding = Boolean(activeGrind?.active)
    gameState.jumping = jump.active || isGrinding
    const spin = spinState.current
    const powerslide = powerslideState.current
    const grindEntry = grindEntryState.current
    const speedRatio = Math.min(1.2, gameState.speed.current / Math.max(gameState.baseSpeed, 0.001))

    if (spinInputBuffer.current > 0) {
      spinInputBuffer.current = Math.max(0, spinInputBuffer.current - gameDelta)
      if (
        jump.active &&
        jump.canSpinTrick &&
        !jump.didSpinTrick &&
        !spin.active &&
        !isGrinding &&
        !deathState.current.active
      ) {
        triggerSpinTrick()
        spinInputBuffer.current = 0
      }
    }

    grindContactState.current.flash = Math.max(0, grindContactState.current.flash - gameDelta * GRIND_CONTACT_FLASH_DECAY)
    if (isGrinding) {
      grindContactState.current.motionTime += gameDelta * (2.6 + speedRatio * 1.8)
    }
    const grindMotion = grindContactState.current.motionTime
    const grindBalanceWave = Math.sin(grindMotion * 1.4)
    const grindCounterWave = Math.sin(grindMotion * 0.72 + 0.9)

    if (isGrinding) {
      if (!wasGrinding.current) {
        powerslide.direction = activeGrind.x < 0 ? -1 : 1
        beginGrindEntry(activeGrind)
      }
      if (jump.active) {
        jump.active = false
        jump.time = 0
      }
      if (spin.active) {
        spin.active = false
        spin.time = 0
      }
      powerslide.direction = activeGrind.x < 0 ? -1 : 1
    } else if (wasGrinding.current && !jump.active) {
      triggerLandingEffects({ fromGrind: true, direction: powerslide.direction })
    }
    if (!isGrinding && grindEntry.active) {
      grindEntry.active = false
      grindEntry.time = 0
      grindEntry.obstacleId = 0
    }

    wasGrinding.current = isGrinding
    powerslide.amount = THREE.MathUtils.lerp(powerslide.amount, isGrinding ? 1 : 0, gameDelta * POWERSLIDE_ENTER_LERP)
    let catSpinRotationY = 0
    let catSpinJustFinished = false

    if (spin.active && !isGrinding) {
      spin.time += gameDelta
      const spinT = Math.min(spin.time / SPIN_DURATION, 1)
      catSpinRotationY = spinT * Math.PI * 2
      if (spinT >= 1) {
        spin.active = false
        spin.time = 0
        catSpinRotationY = 0
        catSpinJustFinished = true
      }
    }

    if (jump.active) {
      setGrindSparkInactive()
      jump.time += gameDelta
      const t = jump.time / JUMP_DURATION

      if (t >= 1) {
        jump.active = false
        jump.time = 0
        groupRef.current.position.y = jump.endY
        groupRef.current.position.x = jump.targetX
        if (boardRef.current) {
          boardRef.current.rotation.y = THREE.MathUtils.lerp(boardRef.current.rotation.y, 0, gameDelta * 12)
          boardRef.current.rotation.z = 0
        }
        triggerLandingEffects()
      } else {
        const height = 4 * jump.arcHeight * t * (1 - t)
        const travelT = THREE.MathUtils.smootherstep(t, 0, 1)
        groupRef.current.position.y = THREE.MathUtils.lerp(jump.startY, jump.endY, travelT) + height
        groupRef.current.position.x = THREE.MathUtils.lerp(jump.startX, jump.targetX, THREE.MathUtils.smootherstep(t, 0, 1))

        if (boardRef.current) {
          boardRef.current.rotation.y = THREE.MathUtils.lerp(boardRef.current.rotation.y, 0, gameDelta * 12)
          boardRef.current.rotation.z = jump.doesFlip
            ? t * Math.PI * 2 * KICKFLIP_ROTATIONS * jump.direction
            : THREE.MathUtils.lerp(boardRef.current.rotation.z, 0, gameDelta * 12)
        }
      }
    } else if (isGrinding) {
      const grindTargetX = getDesiredRoadOffset(activeGrind.x || 0)
      const grindBob = Math.sin(grindMotion * 3.2) * GRIND_BOB_HEIGHT + grindCounterWave * GRIND_BALANCE_BOB_Y * speedRatio
      const grindTargetRotZ = powerslide.direction * POWERSLIDE_GROUP_LEAN_Z + grindBalanceWave * GRIND_BALANCE_SWAY_Z * speedRatio
      const grindTargetRotX = GRIND_PITCH_X + POWERSLIDE_GROUP_PITCH_X + grindCounterWave * GRIND_BALANCE_PITCH_X * speedRatio
      const grindTargetBoardYaw = powerslide.direction * POWERSLIDE_BOARD_YAW + grindBalanceWave * 0.08 * speedRatio
      const grindTargetBoardRoll = -powerslide.direction * grindCounterWave * 0.045 * speedRatio

      if (grindEntry.active && grindEntry.obstacleId === activeGrind.obstacleId) {
        grindEntry.time += gameDelta
        const t = Math.min(grindEntry.time / GRIND_ENTRY_DURATION, 1)
        const ease = THREE.MathUtils.smootherstep(t, 0, 1)
        const float = Math.sin(t * Math.PI) * GRIND_ENTRY_FLOAT

        groupRef.current.position.x = THREE.MathUtils.lerp(grindEntry.startX, grindTargetX, ease)
        groupRef.current.position.y = THREE.MathUtils.lerp(grindEntry.startY, GRIND_GROUP_HEIGHT, ease) + float * (1 - ease * 0.5)
        groupRef.current.rotation.z = THREE.MathUtils.lerp(grindEntry.startRotZ, grindTargetRotZ, ease)
        groupRef.current.rotation.x = THREE.MathUtils.lerp(grindEntry.startRotX, grindTargetRotX, ease)

        if (boardRef.current) {
          boardRef.current.rotation.y = THREE.MathUtils.lerp(grindEntry.startBoardYaw, grindTargetBoardYaw, ease)
          boardRef.current.rotation.z = THREE.MathUtils.lerp(grindEntry.startBoardRoll, grindTargetBoardRoll, ease)
        }

        if (t >= 1) {
          grindEntry.active = false
          grindEntry.time = 0
          grindEntry.obstacleId = 0
        }
      } else {
        groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, grindTargetX, gameDelta * GRIND_ALIGN_LERP)
        groupRef.current.position.y = THREE.MathUtils.lerp(
          groupRef.current.position.y,
          GRIND_GROUP_HEIGHT + grindBob,
          gameDelta * GRIND_ALIGN_LERP
        )
        groupRef.current.rotation.z = THREE.MathUtils.lerp(
          groupRef.current.rotation.z,
          grindTargetRotZ,
          gameDelta * 8
        )
        groupRef.current.rotation.x = THREE.MathUtils.lerp(
          groupRef.current.rotation.x,
          grindTargetRotX,
          gameDelta * 8
        )

        if (boardRef.current) {
          boardRef.current.rotation.y = THREE.MathUtils.lerp(
            boardRef.current.rotation.y,
            grindTargetBoardYaw,
            gameDelta * 10
          )
          boardRef.current.rotation.z = THREE.MathUtils.lerp(boardRef.current.rotation.z, grindTargetBoardRoll, gameDelta * 10)
        }
      }
      updateGrindSpark(powerslide.direction)
    } else {
      setGrindSparkInactive()
      const baseRideY = 0.05 + Math.sin(state.clock.elapsedTime * 4) * 0.04
      const baseRideRoll = Math.sin(state.clock.elapsedTime * 1.5) * 0.03
      const baseRidePitch = -0.05 + Math.sin(state.clock.elapsedTime * 2.5) * 0.02

      groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, groundedTargetX, gameDelta * CAT_GROUNDED_LERP)
      groupRef.current.position.y = baseRideY
      groupRef.current.rotation.z = baseRideRoll
      groupRef.current.rotation.x = baseRidePitch

      if (boardRef.current) {
        boardRef.current.rotation.y = THREE.MathUtils.lerp(boardRef.current.rotation.y, 0, gameDelta * 12)
        boardRef.current.rotation.z = 0
      }
    }

    gameState.catHeight.current = groupRef.current.position.y

    const grindBodyShiftX = isGrinding ? grindBalanceWave * GRIND_CAT_BALANCE_X * speedRatio : 0
    const grindBodyBob = isGrinding ? grindCounterWave * GRIND_CAT_BALANCE_Y * speedRatio : 0
    const grindBodyYaw = isGrinding ? grindCounterWave * GRIND_CAT_BALANCE_YAW * speedRatio : 0
    const grindBodyLean = isGrinding ? grindBalanceWave * GRIND_CAT_BALANCE_LEAN * speedRatio : 0
    const catPoseAmount = jump.active ? 0 : powerslide.amount
    const catTargetX = POWERSLIDE_CAT_OFFSET_X * powerslide.direction * catPoseAmount + grindBodyShiftX * powerslide.direction
    const catTargetY = 0.2 - POWERSLIDE_CAT_CROUCH * catPoseAmount + grindBodyBob
    catRef.current.position.x = THREE.MathUtils.lerp(catRef.current.position.x, catTargetX, gameDelta * 12)
    catRef.current.position.y = THREE.MathUtils.lerp(catRef.current.position.y, catTargetY, gameDelta * 12)
    catRef.current.rotation.y = catSpinJustFinished
      ? 0
      : spin.active
      ? catSpinRotationY
      : THREE.MathUtils.lerp(catRef.current.rotation.y, POWERSLIDE_CAT_TURN_Y * powerslide.direction * catPoseAmount + grindBodyYaw * powerslide.direction, gameDelta * 10)
    catRef.current.rotation.z = THREE.MathUtils.lerp(catRef.current.rotation.z, POWERSLIDE_CAT_LEAN_Z * powerslide.direction * catPoseAmount + grindBodyLean * powerslide.direction, gameDelta * 10)

    if (grindLightRef.current) {
      grindLightRef.current.position.x = powerslide.direction * 0.14
      const contactBase = isGrinding ? 1.2 + speedRatio * 1.8 : 0
      const targetIntensity = contactBase + grindContactState.current.flash * 5.2
      const targetDistance = isGrinding ? 0.75 + speedRatio * 0.45 + grindContactState.current.flash * 0.18 : 0.01
      grindLightRef.current.intensity = THREE.MathUtils.lerp(grindLightRef.current.intensity, targetIntensity, gameDelta * 14)
      grindLightRef.current.distance = THREE.MathUtils.lerp(grindLightRef.current.distance, targetDistance, gameDelta * 10)
    }

    // Squash-and-stretch on landing
    const sq = squashState.current
    if (sq.active) {
      sq.time += gameDelta
      const t = Math.min(sq.time / SQUASH_DURATION, 1)
      // Bouncy spring with overshoot
      const bounce = Math.sin(t * Math.PI * 2.5) * Math.exp(-t * 3)
      const squash = 1 - 0.35 * bounce
      const stretch = 1 + 0.25 * bounce
      catRef.current.scale.set(stretch, squash, stretch)
      if (t >= 1) {
        sq.active = false
        catRef.current.scale.set(1, 1, 1)
      }
    } else if (!deathState.current.active) {
      catRef.current.scale.set(1, 1, 1)
    }

    if (boardRef.current) {
      const landingBoard = boardLandingState.current
      let recoilPitch = 0
      let recoilRoll = 0
      let recoilDrop = 0

      if (landingBoard.active) {
        landingBoard.time += gameDelta
        const t = Math.min(landingBoard.time / BOARD_LANDING_RECOIL_DURATION, 1)
        const bounce = Math.sin(t * Math.PI * 2.2) * Math.exp(-t * 3.4)
        recoilPitch = -bounce * BOARD_LANDING_PITCH
        recoilRoll = bounce * landingBoard.roll
        recoilDrop = -Math.sin(t * Math.PI) * BOARD_LANDING_DIP
        if (t >= 1) {
          landingBoard.active = false
          landingBoard.time = 0
          landingBoard.roll = 0
          landingBoard.strength = 1
        }
      }

      boardRef.current.position.y = recoilDrop * landingBoard.strength
      boardRef.current.rotation.x = recoilPitch * landingBoard.strength
      boardRef.current.rotation.z += recoilRoll
    }

  })

  return (
    <group ref={groupRef} position={[0, 0.05, 0]}>
      <group ref={boardRef}>
        <primitive
          object={skateClone}
          scale={2}
          rotation={[0, Math.PI / 2, 0]}
          position={[0, 0, 0]}
        />
        <pointLight
          ref={grindLightRef}
          position={[0.14, 0.04, 0.38]}
          intensity={0}
          distance={0.01}
          decay={2}
          color="#ffb764"
        />
      </group>
      <group ref={catRef} position={[0, 0.2, 0]}>
        <primitive
          ref={catModelRef}
          object={catWithToon}
          scale={0.03}
          rotation={[catRotX, catRotY, catRotZ]}
        />
      </group>
      <group ref={boxRef} position={[introControls.introX + boxControls.boxX, boxControls.boxY, introControls.introZ + boxControls.boxZ]}>
        <primitive
          object={boxWithToon}
          scale={boxControls.boxScale / 1000}
          rotation={[0, boxControls.boxRotY, 0]}
        />
      </group>
      <group ref={trailTargetRef} position={[0, 0.2, 1.5]} />
      <pointLight
        position={[0.3, 0.8, 0.3]}
        intensity={3}
        distance={1.2}
        decay={2}
        color="#ffe8cc"
      />
    </group>
  )
}

useGLTF.preload('/skateboard.glb')
useGLTF.preload('/maxwell_the_cat_dingus/scene.gltf')
useGLTF.preload('/empty_cardboard_box/scene.gltf')
