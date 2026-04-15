import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { folder } from 'leva'
import * as THREE from 'three'
import Grass from './Grass'
import Pebbles from './Pebbles'
import Wildflowers from './Wildflowers'
import { gameState, getGameDelta, getNightFactor, getSunsetFactor, getSunriseFactor, lerpDayNightColor } from '../store'
import { useOptionalControls } from '../lib/debugControls'

const SEGMENT_COUNT = 8
const SEGMENT_LENGTH = 20
const SEGMENT_WIDTH = 12
const MOBILE_GRASS_PRELOAD_SEGMENTS = 1

const roadVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`

const roadFragmentShader = /* glsl */ `
  uniform vec3 uBaseColor;
  uniform vec3 uDetailColor;
  uniform vec3 uLightDirection;
  uniform float uToonSteps;
  uniform float uShadowBrightness;
  uniform vec3 uEdgeColor;
  uniform float uGrainAmount;
  uniform float uGrainScale;
  uniform float uGradientStrength;
  uniform float uEdgeLineWidth;
  uniform float uCenterLineOpacity;
  uniform float uVignetteStrength;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  // Simple hash for hand-painted noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec2 uv = vUv;

    // Warm-to-cool gradient across road width (anime BG style)
    float xGrad = uv.x;
    vec3 warmSide = uBaseColor * (1.0 + uGradientStrength);
    vec3 coolSide = uBaseColor * (1.0 - uGradientStrength) + vec3(-0.02, 0.0, 0.03) * uGradientStrength;
    vec3 color = mix(warmSide, coolSide, xGrad);

    // Hand-painted noise — subtle color variation
    float grain = hash(floor(uv * uGrainScale)) * uGrainAmount - uGrainAmount * 0.5;
    color += grain;

    // Toon lighting
    vec3 normal = normalize(vNormal);
    float NdotL = dot(normal, normalize(uLightDirection));
    float lightVal = NdotL * 0.5 + 0.5;
    float stepped = floor(lightVal * uToonSteps) / uToonSteps;
    float lightIntensity = mix(uShadowBrightness, 1.0, stepped);
    color *= lightIntensity;

    // Bold edge stripes with inner shadow for depth
    float edgeDist = abs(uv.x - 0.5) * 2.0;
    float edgeStart = 1.0 - uEdgeLineWidth;
    float edgeLine = smoothstep(edgeStart, edgeStart + 0.03, edgeDist);
    color = mix(color, uEdgeColor, edgeLine * 0.9);

    // Inner shadow just inside the edge lines
    float innerShadow = smoothstep(edgeStart - 0.07, edgeStart, edgeDist);
    color = mix(color, uBaseColor * 0.7, innerShadow * (1.0 - edgeLine) * 0.4);

    // Subtle center dashed line
    float centerLine = smoothstep(0.015, 0.01, abs(uv.x - 0.5));
    float dash = step(0.5, fract(uv.y * 8.0));
    color = mix(color, uEdgeColor, centerLine * dash * uCenterLineOpacity);

    // Slight vignette darkening at road edges for depth
    float vignette = smoothstep(0.0, 0.5, 1.0 - edgeDist);
    color *= mix(1.0 - uVignetteStrength, 1.0, vignette);

    gl_FragColor = vec4(color, 1.0);
  }
`

export default function Ground({
  active = true,
  foliageSegmentCount = 2,
  quality = 'auto',
  shadowMode = 'map',
  renderProfile = {},
}) {
  const {
    baseSpeed, roadColor, roadDetail, edgeColor,
    toonSteps, shadowBrightness, grainAmount, grainScale,
    gradientStrength, edgeLineWidth, centerLineOpacity, vignetteStrength,
  } = useOptionalControls('Game', {
    Road: folder({
      baseSpeed: { value: 10, min: 0, max: 30, step: 0.5 },
      roadColor: '#c49468',
      roadDetail: '#8B6B4A',
      edgeColor: '#F5E6D0',
      toonSteps: { value: 2, min: 1, max: 6, step: 1 },
      shadowBrightness: { value: 0.55, min: 0, max: 1, step: 0.05 },
      grainAmount: { value: 0.03, min: 0, max: 0.15, step: 0.005 },
      grainScale: { value: 400, min: 50, max: 1000, step: 10 },
      gradientStrength: { value: 0.08, min: 0, max: 0.3, step: 0.01 },
      edgeLineWidth: { value: 0.15, min: 0, max: 0.3, step: 0.01 },
      centerLineOpacity: { value: 0.3, min: 0, max: 1, step: 0.05 },
      vignetteStrength: { value: 0.27, min: 0, max: 0.3, step: 0.01 },
    }, { collapsed: true }),
  }, [])
  const useShadowMap = shadowMode === 'map' || shadowMode === 'hybrid'

  const roadMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uBaseColor: { value: new THREE.Color('#c49468') },
        uDetailColor: { value: new THREE.Color('#8B6B4A') },
        uLightDirection: { value: new THREE.Vector3(5, 10, 3).normalize() },
        uToonSteps: { value: 2.0 },
        uShadowBrightness: { value: 0.55 },
        uEdgeColor: { value: new THREE.Color('#F5E6D0') },
        uGrainAmount: { value: 0.03 },
        uGrainScale: { value: 400.0 },
        uGradientStrength: { value: 0.08 },
        uEdgeLineWidth: { value: 0.15 },
        uCenterLineOpacity: { value: 0.3 },
        uVignetteStrength: { value: 0.27 },
      },
      vertexShader: roadVertexShader,
      fragmentShader: roadFragmentShader,
    })
  }, [])
  // Sync leva base speed to game state
  gameState.baseSpeed = baseSpeed
  if (gameState.speed.current > 0 && gameState.speed.current < baseSpeed) gameState.speed.current = baseSpeed
  const groundMaterial = useMemo(() => new THREE.MeshToonMaterial({ color: '#4CB944' }), [])
  const groupRefs = useRef([])
  const grassRefs = useRef([])
  const wildflowerRefs = useRef([])
  const totalLength = SEGMENT_COUNT * SEGMENT_LENGTH
  const scrollOffset = useRef(0)

  useFrame((_, delta) => {
    if (!active || gameState.gameOver) return

    const gameDelta = getGameDelta(delta)
    const t = gameState.timeOfDay.current
    const nightFactor = getNightFactor(t)
    const sunsetFactor = getSunsetFactor(t)
    const sunriseFactor = getSunriseFactor(t)
    const warmFactor = sunriseFactor > 0 ? sunriseFactor : sunsetFactor

    if (roadMaterial) {
      lerpDayNightColor(roadMaterial.uniforms.uBaseColor.value, roadColor, '#5a3a28', nightFactor, '#c47840', warmFactor)
      lerpDayNightColor(roadMaterial.uniforms.uDetailColor.value, roadDetail, '#3a2518', nightFactor, '#9a5a30', warmFactor)
      lerpDayNightColor(roadMaterial.uniforms.uEdgeColor.value, edgeColor, '#6a5a48', nightFactor, '#ffcc88', warmFactor)
      roadMaterial.uniforms.uToonSteps.value = toonSteps
      roadMaterial.uniforms.uShadowBrightness.value = THREE.MathUtils.lerp(shadowBrightness, 0.3, nightFactor)
      roadMaterial.uniforms.uGrainAmount.value = THREE.MathUtils.lerp(grainAmount, 0.01, nightFactor)
      roadMaterial.uniforms.uGrainScale.value = grainScale
      roadMaterial.uniforms.uGradientStrength.value = gradientStrength
      roadMaterial.uniforms.uEdgeLineWidth.value = edgeLineWidth
      roadMaterial.uniforms.uCenterLineOpacity.value = centerLineOpacity
      roadMaterial.uniforms.uVignetteStrength.value = vignetteStrength
    }

    // Lerp ground green color — warm tint at sunset/sunrise
    lerpDayNightColor(groundMaterial.color, '#4CB944', '#1a3318', nightFactor, '#7a8a30', warmFactor)

    scrollOffset.current += gameState.speed.current * gameDelta
    const grassVisibleSegmentCount = foliageSegmentCount + (renderProfile.isMobileDevice ? MOBILE_GRASS_PRELOAD_SEGMENTS : 0)
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      // Each segment has a fixed slot; we wrap the scroll offset modularly
      const pos = i * SEGMENT_LENGTH - (scrollOffset.current % totalLength)
      // Wrap into range [-SEGMENT_LENGTH, totalLength - SEGMENT_LENGTH)
      const wrapped = ((pos + SEGMENT_LENGTH) % totalLength + totalLength) % totalLength - SEGMENT_LENGTH
      if (groupRefs.current[i]) {
        groupRefs.current[i].position.z = -wrapped
      }
      if (grassRefs.current[i]) {
        grassRefs.current[i].visible =
          wrapped >= -SEGMENT_LENGTH &&
          wrapped < SEGMENT_LENGTH * grassVisibleSegmentCount
      }
      if (wildflowerRefs.current[i]) {
        wildflowerRefs.current[i].visible =
          wrapped >= -SEGMENT_LENGTH &&
          wrapped < SEGMENT_LENGTH * foliageSegmentCount
      }
    }
  })

  return (
    <group>
      {Array.from({ length: SEGMENT_COUNT }, (_, i) => (
        <group
          key={i}
          ref={(el) => (groupRefs.current[i] = el)}
          position={[0, 0, -(i * SEGMENT_LENGTH)]}
        >
          {/* Green ground — toon flat */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} material={groundMaterial} receiveShadow>
            <planeGeometry args={[SEGMENT_WIDTH, SEGMENT_LENGTH]} />
          </mesh>
          {/* Textured road strip */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} material={roadMaterial} receiveShadow>
            <planeGeometry args={[3, SEGMENT_LENGTH]} />
          </mesh>
          {useShadowMap && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow renderOrder={10}>
              <planeGeometry args={[3, SEGMENT_LENGTH]} />
              <shadowMaterial transparent opacity={0.35} depthWrite={false} />
            </mesh>
          )}
          <Pebbles segmentSeed={i} />
          <group ref={(el) => (grassRefs.current[i] = el)}>
            <Grass quality={quality} renderProfile={renderProfile} />
          </group>
          <group ref={(el) => (wildflowerRefs.current[i] = el)}>
            {!renderProfile.disableWildflowers && <Wildflowers />}
          </group>
        </group>
      ))}
    </group>
  )
}
