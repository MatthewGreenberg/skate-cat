import { useRef, useMemo, useEffect, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import { folder } from 'leva'
import * as THREE from 'three'
import { gameState, getNightFactor, getSunsetFactor, getSunriseFactor, lerpDayNightColor } from '../store'
import { useOptionalControls } from '../lib/debugControls'

const MAX_BLADES = 8000
const SEGMENT_LENGTH = 20
const SEGMENT_WIDTH = 12
const ROAD_HALF = 1.5
const ROAD_HALF_CAM_SIDE = 1.8 // push grass back on camera-facing side
const CAM_SIDE_MAX = 3.5 // don't waste instances off-screen on camera side

function createBladeGeometry() {
  const geo = new THREE.BufferGeometry()
  // Simple triangle blade — 3 verts, 1 tri, double density for same perf budget
  const vertices = new Float32Array([
    -0.5, 0, 0,
    0.5, 0, 0,
    0, 1, 0,
  ])
  const uvs = new Float32Array([
    0, 0,
    1, 0,
    0.5, 1,
  ])
  const indices = [0, 1, 2]
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  return geo
}

const grassVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uWindSpeed;
  uniform float uWindStrength;
  uniform float uThickness;
  uniform int uVisibleCount;
  uniform float uCullDistance;
  varying vec2 vUv;
  varying float vPatchNoise;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying float vInstanceId;
  void main() {
    vUv = uv;
    vInstanceId = float(gl_InstanceID);
    vec3 pos = position;

    // Early world position for culling
    vec4 earlyWorldPos = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float distToCamera = length((viewMatrix * earlyWorldPos).xyz);

    // Cull distant blades by collapsing to zero
    if (distToCamera > uCullDistance) {
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      vPatchNoise = 0.0;
      vWorldPos = vec3(0.0);
      vWorldNormal = vec3(0.0, 1.0, 0.0);
      return;
    }

    vPatchNoise = fract(sin(dot(vec2(instanceMatrix[3][0], instanceMatrix[3][2]), vec2(12.9898, 78.233))) * 43758.5453);
    // Scale X by thickness
    pos.x *= uThickness;
    // Multi-directional wind: sway in X and Z
    float windPhase = uTime * uWindSpeed + instanceMatrix[3][0] * 0.5 + instanceMatrix[3][2] * 0.3;
    float swayX = sin(windPhase) * uWindStrength * uv.y;
    float swayZ = cos(windPhase * 0.7 + 1.3) * uWindStrength * 0.5 * uv.y;
    pos.x += swayX;
    pos.z += swayZ;
    vec4 worldPos = modelMatrix * instanceMatrix * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;
    // Approximate normal: grass blade faces camera-ish, but tip bends with wind
    vec3 bladeNormal = normalize(vec3(-swayX * 2.0, 1.0, -swayZ * 2.0));
    vWorldNormal = normalize((modelMatrix * instanceMatrix * vec4(bladeNormal, 0.0)).xyz);
    vec4 mvPosition = viewMatrix * worldPos;
    gl_Position = projectionMatrix * mvPosition;
  }
`

const grassFragmentShader = /* glsl */ `
  uniform vec3 uColorBase;
  uniform vec3 uColorTip;
  uniform vec3 uColorDry;
  uniform int uVisibleCount;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform float uAmbientStrength;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uToonSteps;
  uniform float uShadowBrightness;
  varying vec2 vUv;
  varying float vPatchNoise;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying float vInstanceId;
  void main() {
    if (int(vInstanceId + 0.5) >= uVisibleCount) discard;

    // Mix some color variety based on instance ID
    float dryMix = fract(sin(vInstanceId * 43758.5453) * 2.0);
    dryMix = smoothstep(0.6, 1.0, dryMix);
    vec3 baseColor = mix(uColorBase, uColorDry, dryMix * 0.5);
    vec3 tipColor = mix(uColorTip, uColorDry, dryMix * 0.3);
    vec3 color = mix(baseColor, tipColor, vUv.y);

    // Toon-style stepped lighting (matches cat shader)
    vec3 normal = normalize(vWorldNormal);
    float NdotL = dot(normal, normalize(uSunDirection));
    float lightVal = NdotL * 0.5 + 0.5;
    float stepped = floor(lightVal * uToonSteps) / uToonSteps;
    float lightIntensity = mix(uShadowBrightness, 1.0, stepped);

    color *= lightIntensity;

    // Slight color boost at tips for a vibrant anime look
    float tip = smoothstep(0.6, 1.0, vUv.y);
    color += tipColor * tip * 0.15;

    // Patch variation for visual interest
    color *= mix(0.92, 1.08, vPatchNoise);

    // Fog
    float depth = gl_FragCoord.z / gl_FragCoord.w;
    float fogFactor = smoothstep(uFogNear, uFogFar, depth);
    color = mix(color, uFogColor, fogFactor);

    gl_FragColor = vec4(color, 1.0);
  }
`

export default function Grass({ quality = 'auto' }) {
  const meshRef = useRef()

  const { windEnabled, windSpeed, windStrength, bladeMinHeight, bladeMaxHeight, bladeCount, thickness } = useOptionalControls('Game', {
    Grass: folder({
      bladeCount: { value: 8000, min: 100, max: MAX_BLADES, step: 100 },
      thickness: { value: 0.10, min: 0.005, max: 0.2, step: 0.005 },
      windEnabled: true,
      windSpeed: { value: 3.8, min: 0, max: 10, step: 0.1 },
      windStrength: { value: 0.29, min: 0, max: 0.5, step: 0.01 },
      bladeMinHeight: { value: 0.3, min: 0.01, max: 1.0, step: 0.01 },
      bladeMaxHeight: { value: 0.58, min: 0.1, max: 2.0, step: 0.01 },
    }, { collapsed: true }),
  }, [])
  const {
    dayColorBase,
    dayColorTip,
    dayColorDry,
    dayAmbientStrength,
    dayShadowBrightness,
    sunsetColorBase,
    sunsetColorTip,
    sunsetColorDry,
  } = useOptionalControls('Game', {
    'Grass Day': folder({
      dayColorBase: '#2E9E3A',
      dayColorTip: '#8EE85A',
      dayColorDry: '#D4CC44',
      dayAmbientStrength: { value: 0.7, min: 0, max: 1.5, step: 0.01 },
      dayShadowBrightness: { value: 1, min: 0, max: 1, step: 0.01 },
      sunsetColorBase: '#4a5a30',
      sunsetColorTip: '#7a8a50',
      sunsetColorDry: '#8a7a44',
    }, { collapsed: true }),
  }, [])
  const resolvedBladeCount = Math.min(
    bladeCount,
    quality === 'high' ? 6000 : quality === 'quiet' ? 2800 : 4400
  )
  const {
    nightColorBase,
    nightColorTip,
    nightColorDry,
    nightAmbientStrength,
    nightShadowBrightness,
    nightLightColor,
  } = useOptionalControls('Game', {
    'Grass Night': folder({
      nightColorBase: '#000000',
      nightColorTip: '#1a3a15',
      nightColorDry: '#3a3510',
      nightAmbientStrength: { value: 0.25, min: 0, max: 1.5, step: 0.01 },
      nightShadowBrightness: { value: 0.2, min: 0, max: 1, step: 0.01 },
      nightLightColor: '#334466',
    }, { collapsed: true }),
  }, [])

  const uniformsRef = useRef({
    uTime: { value: 0 },
    uWindSpeed: { value: 2.0 },
    uWindStrength: { value: 0.12 },
    uThickness: { value: 0.08 },
    uVisibleCount: { value: 6000 },
    uColorBase: { value: new THREE.Color('#2E9E3A') },
    uColorTip: { value: new THREE.Color('#8EE85A') },
    uColorDry: { value: new THREE.Color('#D4CC44') },
    uSunDirection: { value: new THREE.Vector3(5, 10, 3).normalize() },
    uSunColor: { value: new THREE.Color('#ffe6bf') },
    uAmbientStrength: { value: 0.7 },
    uFogColor: { value: new THREE.Color('#c8d8c0') },
    uFogNear: { value: 40 },
    uFogFar: { value: 140 },
    uToonSteps: { value: 4.0 },
    uShadowBrightness: { value: 0.55 },
    uCullDistance: { value: 30.0 },
  })

  const geometry = useMemo(() => createBladeGeometry(), [])

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: uniformsRef.current,
      vertexShader: grassVertexShader,
      fragmentShader: grassFragmentShader,
      side: THREE.DoubleSide,
    })
  }, [])

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const seedData = useMemo(() => {
    // Store random seeds so height can be remapped
    const data = []
    for (let i = 0; i < MAX_BLADES; i++) {
      let x
      if (Math.random() < 0.5) {
        x = -ROAD_HALF - Math.random() * (SEGMENT_WIDTH / 2 - ROAD_HALF)
      } else {
        x = ROAD_HALF_CAM_SIDE + Math.random() * (CAM_SIDE_MAX - ROAD_HALF_CAM_SIDE)
      }
      data.push({
        x,
        z: (Math.random() - 0.5) * SEGMENT_LENGTH,
        heightRand: Math.random(),
        widthRand: 0.8 + Math.random() * 0.4,
        leanX: (Math.random() - 0.5) * 0.24,
        leanZ: (Math.random() - 0.5) * 0.24,
        rotY: Math.random() * Math.PI,
      })
    }
    return data
  }, [])

  const updateInstanceMatrices = useCallback((mesh, minHeight, maxHeight) => {
    if (!mesh) return
    for (let i = 0; i < MAX_BLADES; i++) {
      const s = seedData[i]
      const h = minHeight + s.heightRand * (maxHeight - minHeight)
      dummy.position.set(s.x, 0, s.z)
      dummy.rotation.set(s.leanX, s.rotY, s.leanZ)
      dummy.scale.set(s.widthRand, h, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    mesh.computeBoundingBox()
  }, [seedData, dummy])

  useEffect(() => {
    updateInstanceMatrices(meshRef.current, bladeMinHeight, bladeMaxHeight)
  }, [bladeMinHeight, bladeMaxHeight, updateInstanceMatrices])

  useFrame((_, delta) => {
    if (!meshRef.current || meshRef.current.parent?.visible === false) return

    const u = uniformsRef.current
    const t = gameState.timeOfDay.current
    const nightFactor = getNightFactor(t)
    const sunsetFactor = getSunsetFactor(t)
    const sunriseFactor = getSunriseFactor(t)
    const warmFactor = sunriseFactor > 0 ? sunriseFactor : sunsetFactor

    if (windEnabled) u.uTime.value += delta
    u.uWindSpeed.value = windSpeed
    u.uWindStrength.value = windEnabled ? windStrength : 0
    u.uThickness.value = thickness
    u.uVisibleCount.value = resolvedBladeCount
    meshRef.current.count = resolvedBladeCount

    // Lerp grass colors — warm hazy tint during sunset/sunrise
    lerpDayNightColor(u.uColorBase.value, dayColorBase, nightColorBase, nightFactor, sunsetColorBase, warmFactor)
    lerpDayNightColor(u.uColorTip.value, dayColorTip, nightColorTip, nightFactor, sunsetColorTip, warmFactor)
    lerpDayNightColor(u.uColorDry.value, dayColorDry, nightColorDry, nightFactor, sunsetColorDry, warmFactor)

    // Dim grass lighting at night to match scene
    u.uAmbientStrength.value = THREE.MathUtils.lerp(dayAmbientStrength, nightAmbientStrength, nightFactor)
    u.uShadowBrightness.value = THREE.MathUtils.lerp(dayShadowBrightness, nightShadowBrightness, nightFactor)
    lerpDayNightColor(u.uSunColor.value, '#ffe6bf', nightLightColor, nightFactor)

    // Match fog color to scene
    lerpDayNightColor(u.uFogColor.value, '#c8d8c0', '#1a2233', nightFactor, '#9a7a60', warmFactor)
  })

  return (
    <instancedMesh
      ref={(el) => {
        meshRef.current = el
        if (el) {
          el.count = resolvedBladeCount
          el.userData.cannotReceiveAO = true
          updateInstanceMatrices(el, bladeMinHeight, bladeMaxHeight)
        }
      }}
      args={[geometry, material, MAX_BLADES]}
    />
  )
}
