import { useRef, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, useTexture } from '@react-three/drei'
import { useControls } from 'leva'
import * as THREE from 'three'
import { gameState } from '../store'
import { getSignedOffsetFromTargetBeat } from '../rhythm'

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
const KICKFLIP_ROTATIONS = 1
const SPIN_DURATION = 0.32
const PERFECT_WINDOW_SECONDS = 0.15
const INPUT_TIMING_COMPENSATION_SECONDS = 0.08

// Death animation params
const DEATH_HOP_HEIGHT = 0.6
const DEATH_HOP_DURATION = 0.4
const DEATH_WALK_SPEED = 1.2
const DEATH_WALK_BOB_SPEED = 8
const DEATH_WALK_BOB_HEIGHT = 0.06

export default function SkateCat({ trailTargetRef, controlsEnabled = true, musicRef, onJumpTiming, onJumpSfx }) {
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

  const blinkState = useRef({ timer: 3, blinking: false, blinkTime: 0, amount: 0, blinksLeft: 0 })

  const groupRef = useRef()
  const boardRef = useRef()
  const catRef = useRef()
  const skateboard = useGLTF('/skateboard.glb')
  const { scene: catScene } = useGLTF('/maxwell_the_cat_dingus/scene.gltf')
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

  // Cache mesh references to avoid traverse() every frame
  const cachedMeshes = useMemo(() => {
    const toonMeshes = []
    const outlineMeshes = []
    catWithToon.traverse((child) => {
      if (!child.isMesh || !child.material?.isShaderMaterial) return
      if (child.userData.__toonOutline) {
        outlineMeshes.push(child)
      } else if (child.material.uniforms?.uLightDirection) {
        toonMeshes.push(child)
      }
    })
    return { toonMeshes, outlineMeshes }
  }, [catWithToon])

  const jumpState = useRef({
    active: false,
    time: 0,
    direction: 1,
  })
  const squashState = useRef({ active: false, time: 0 })
  const SQUASH_DURATION = 0.4

  const deathState = useRef({
    active: false,
    time: 0,
  })
  const spinState = useRef({
    active: false,
    time: 0,
  })

  const wasGameOver = useRef(false)

  const resetPoseToBoard = () => {
    deathState.current.active = false
    deathState.current.time = 0
    jumpState.current.active = false
    jumpState.current.time = 0
    spinState.current.active = false
    spinState.current.time = 0
    squashState.current.active = false
    squashState.current.time = 0
    if (groupRef.current) {
      groupRef.current.position.set(0, 0.05, 0)
      groupRef.current.rotation.set(0, 0, 0)
    }
    if (catRef.current) {
      catRef.current.position.set(0, 0.2, 0)
      catRef.current.rotation.set(0, 0, 0)
      catRef.current.scale.set(1, 1, 1)
    }
    if (boardRef.current) boardRef.current.rotation.z = 0
  }

  useEffect(() => {
    const onKeyDown = (e) => {
      if (!controlsEnabled) return
      if (gameState.gameOver) return
      if (e.key === 'ArrowUp' && !jumpState.current.active) {
        jumpState.current.active = true
        jumpState.current.time = 0
        jumpState.current.direction = Math.random() < 0.5 ? 1 : -1
        if (onJumpSfx) onJumpSfx()

        const wp = new THREE.Vector3()
        if (groupRef.current) {
          groupRef.current.getWorldPosition(wp)
        }
        gameState.kickflip.current = { triggered: true, position: [wp.x, wp.y, wp.z] }

        const musicTime = musicRef?.current?.currentTime
        if (typeof musicTime === 'number' && Number.isFinite(musicTime)) {
          const signedOffsetFromBeat = getSignedOffsetFromTargetBeat(
            musicTime + INPUT_TIMING_COMPENSATION_SECONDS
          )
          const timingLabel = Math.abs(signedOffsetFromBeat) <= PERFECT_WINDOW_SECONDS
            ? 'Perfect'
            : signedOffsetFromBeat < 0
              ? 'Early'
              : 'Late'
          if (timingLabel === 'Perfect') {
            gameState.streak.current++
          } else {
            gameState.streak.current = 0
          }
          if (onJumpTiming) onJumpTiming(timingLabel)
        }
      }

      if (e.key === 'ArrowDown' && !spinState.current.active && !jumpState.current.active) {
        spinState.current.active = true
        spinState.current.time = 0
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [controlsEnabled, musicRef, onJumpTiming, onJumpSfx])

  // Sync toon controls + blink in one pass using cached mesh refs
  useFrame((_, delta) => {
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
        s.timer -= delta
        if (s.timer <= 0) {
          s.blinking = true
          s.blinkTime = 0
          const r = Math.random()
          s.blinksLeft = r < 0.1 ? 2 : r < 0.4 ? 1 : 0
        }
      } else {
        s.blinkTime += delta
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

    // Update toon + blink uniforms on cached meshes (no traverse)
    for (const child of cachedMeshes.toonMeshes) {
      const u = child.material.uniforms
      u.uLightDirection.value.set(toonControls.lightX, toonControls.lightY, toonControls.lightZ)
      u.uGlossiness.value = toonControls.glossiness
      u.uRimAmount.value = toonControls.rimAmount
      u.uRimThreshold.value = toonControls.rimThreshold
      u.uRimColor.value.set(toonControls.rimColor)
      u.uSteps.value = toonControls.steps
      u.uShadowBrightness.value = toonControls.shadowBrightness
      u.uBrightness.value = toonControls.brightness
      u.uLeftEyeCenter.value.set(blinkControls.leftEyeX, blinkControls.leftEyeY)
      u.uRightEyeCenter.value.set(blinkControls.rightEyeX, blinkControls.rightEyeY)
      u.uEyeRadius.value.set(blinkControls.eyeRadiusX, blinkControls.eyeRadiusY)
      u.uLidColor.value.set(blinkControls.lidColor)
      u.uBlinkAmount.value = s.amount
    }
    for (const child of cachedMeshes.outlineMeshes) {
      child.material.uniforms.uThickness.value = toonControls.outlineThickness
      child.material.uniforms.uOutlineColor.value.set(toonControls.outlineColor)
    }
  })

  useFrame((state, delta) => {
    if (!groupRef.current || !catRef.current) return

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

      if (!deathState.current.active) {
        deathState.current.active = true
        deathState.current.time = 0
      }

      deathState.current.time += delta
      const elapsed = deathState.current.time

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

      return
    }

    const targetSpeed = gameState.baseSpeed + (
      gameState.speedBoostActive ? gameState.postMilestoneSpeedBoost : 0
    )
    gameState.speed.current = THREE.MathUtils.lerp(gameState.speed.current, targetSpeed, delta * 4)

    const jump = jumpState.current
    gameState.jumping = jump.active
    const spin = spinState.current

    if (spin.active) {
      spin.time += delta
      const spinT = Math.min(spin.time / SPIN_DURATION, 1)
      catRef.current.rotation.y = spinT * Math.PI * 2
      if (spinT >= 1) {
        spin.active = false
        spin.time = 0
        catRef.current.rotation.y = 0
      }
    } else {
      catRef.current.rotation.y = 0
    }

    if (jump.active) {
      jump.time += delta
      const t = jump.time / JUMP_DURATION

      if (t >= 1) {
        jump.active = false
        jump.time = 0
        groupRef.current.position.y = 0.05
        if (boardRef.current) boardRef.current.rotation.z = 0
        // Trigger landing effects
        gameState.screenShake.current = 0.3
        const wp = new THREE.Vector3()
        groupRef.current.getWorldPosition(wp)
        gameState.landed.current = { triggered: true, position: [wp.x, wp.y, wp.z] }
        // Trigger squash on landing
        squashState.current.active = true
        squashState.current.time = 0
        // Trigger a blink on landing
        const bs = blinkState.current
        if (!bs.blinking) {
          bs.blinking = true
          bs.blinkTime = 0
          bs.blinksLeft = 0
        }
      } else {
        const height = 4 * JUMP_HEIGHT * t * (1 - t)
        groupRef.current.position.y = 0.05 + height

        if (boardRef.current) {
          boardRef.current.rotation.z = t * Math.PI * 2 * KICKFLIP_ROTATIONS * jump.direction
        }
      }
    } else {
      groupRef.current.position.y = 0.05 + Math.sin(state.clock.elapsedTime * 4) * 0.04
      groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 1.5) * 0.03
      groupRef.current.rotation.x = -0.05 + Math.sin(state.clock.elapsedTime * 2.5) * 0.02

      if (boardRef.current) boardRef.current.rotation.z = 0
    }

    // Squash-and-stretch on landing
    const sq = squashState.current
    if (sq.active) {
      sq.time += delta
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
      </group>
      <group ref={catRef} position={[0, 0.2, 0]}>
        <primitive
          object={catWithToon}
          scale={0.03}
          rotation={[catRotX, catRotY, catRotZ]}
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
