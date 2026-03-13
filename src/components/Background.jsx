import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import * as THREE from 'three'
import { gameState, getNightFactor, getSunsetFactor, getSunriseFactor, lerpDayNightColor } from '../store'

const bgVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const bgFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uBrightness;
  uniform float uSaturation;
  uniform float uSunGlowStrength;
  uniform float uCloudStrength;
  uniform float uHazeStrength;
  uniform vec3 uSkyTop;
  uniform vec3 uSkyMid;
  uniform vec3 uHorizon;
  uniform vec3 uBelowHorizon;
  uniform vec3 uMtColor1;
  uniform vec3 uMtColor2;
  uniform vec3 uMtColor3;
  uniform float uStarVisibility;
  varying vec2 vUv;

  // Simple noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm2(vec2 p) {
    float v = 0.5 * noise(p);
    p *= 2.0;
    v += 0.25 * noise(p);
    return v;
  }

  float fbm3(vec2 p) {
    float v = 0.5 * noise(p);
    p *= 2.0;
    v += 0.25 * noise(p);
    p *= 2.0;
    v += 0.125 * noise(p);
    return v;
  }

  vec3 adjustSaturation(vec3 color, float saturation) {
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    return mix(vec3(luma), color, saturation);
  }

  void main() {
    vec2 uv = vUv;

    // Sky gradient: warm horizon to blue sky
    float horizonLine = 0.25;
    vec3 sky;
    if (uv.y > horizonLine) {
      float t = (uv.y - horizonLine) / (1.0 - horizonLine);
      sky = mix(uHorizon, mix(uSkyMid, uSkyTop, t), smoothstep(0.0, 0.35, t));
    } else {
      float t = (horizonLine - uv.y) / horizonLine;
      sky = mix(uHorizon, uBelowHorizon, smoothstep(0.0, 0.3, t));
    }

    // Sun glow near horizon
    float sunX = 0.65;
    float sunDist = length(vec2(uv.x - sunX, (uv.y - horizonLine - 0.06) * 2.5));
    float sunGlow = exp(-sunDist * 3.5) * 0.5;
    sky += vec3(1.0, 0.85, 0.5) * sunGlow * uSunGlowStrength;

    // Stars (hash-based dots, only above horizon)
    if (uStarVisibility > 0.01 && uv.y > horizonLine + 0.05) {
      vec2 starUv = uv * 120.0;
      vec2 starCell = floor(starUv);
      float starVal = hash(starCell);
      float starBright = step(0.97, starVal) * hash(starCell + vec2(7.0, 13.0));
      float twinkle = 0.7 + 0.3 * sin(uTime * 2.0 + starVal * 50.0);
      sky += vec3(0.9, 0.92, 1.0) * starBright * uStarVisibility * twinkle;
    }

    // Distant mountains (layer 1 - far, blue-ish, tall peaks)
    float mt1 = fbm2(vec2(uv.x * 2.5 + 1.5, 0.0)) * 0.15 + 0.34;
    float mountain1 = smoothstep(mt1, mt1 + 0.01, uv.y);
    sky = mix(uMtColor1, sky, mountain1);

    // Closer hills (layer 2 - green rolling hills)
    float mt2 = fbm2(vec2(uv.x * 4.0 + 3.0, 0.5)) * 0.1 + 0.28;
    float mountain2 = smoothstep(mt2, mt2 + 0.006, uv.y);
    sky = mix(uMtColor2, sky, mountain2);

    // Nearest hills (layer 3 - darker green, matches ground)
    float mt3 = fbm2(vec2(uv.x * 7.0 + 7.0, 1.0)) * 0.07 + 0.22;
    float mountain3 = smoothstep(mt3, mt3 + 0.004, uv.y);
    sky = mix(uMtColor3, sky, mountain3);

    // Clouds - fluffy cumulus shapes
    float cloud1 = fbm3(vec2(uv.x * 3.0 + uTime * 0.015, uv.y * 4.0 + 1.0));
    float cloud2 = fbm3(vec2(uv.x * 5.0 + uTime * 0.01 + 3.0, uv.y * 3.0 + 2.0));
    float cloudShape = max(cloud1, cloud2 * 0.8);
    float cloudMask = smoothstep(0.48, 0.72, cloudShape) * smoothstep(0.12, 0.30, uv.y) * smoothstep(0.76, 0.58, uv.y) * 0.55;
    sky = mix(sky, vec3(1.0, 0.98, 0.95), cloudMask * uCloudStrength);

    // Atmospheric haze near horizon
    float haze = exp(-abs(uv.y - horizonLine) * 6.0) * 0.2;
    sky = mix(sky, uHorizon, haze * uHazeStrength);

    sky = adjustSaturation(sky, uSaturation);
    sky *= uBrightness;

    gl_FragColor = vec4(sky, 1.0);
  }
`

export default function Background() {
  const meshRef = useRef()
  const { camera } = useThree()
  const dir = useMemo(() => new THREE.Vector3(), [])
  const {
    brightness,
    saturation,
    sunGlowStrength,
    cloudStrength,
    hazeStrength,
    skyTop,
    skyMid,
    horizon,
    belowHorizon,
  } = useControls('Background', {
    brightness: { value: 0.65, min: 0.4, max: 1.4, step: 0.01 },
    saturation: { value: 1.5, min: 0, max: 1.5, step: 0.01 },
    sunGlowStrength: { value: 0.45, min: 0, max: 1.5, step: 0.01 },
    cloudStrength: { value: 0.22, min: 0, max: 1.5, step: 0.01 },
    hazeStrength: { value: 0.12, min: 0, max: 1.5, step: 0.01 },
    skyTop: '#4d8cff',
    skyMid: '#73b3ff',
    horizon: '#ffe0a6',
    belowHorizon: '#66994d',
  })

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBrightness: { value: 0.65 },
      uSaturation: { value: 1.5 },
      uSunGlowStrength: { value: 0.45 },
      uCloudStrength: { value: 0.22 },
      uHazeStrength: { value: 0.12 },
      uSkyTop: { value: new THREE.Color('#4d8cff') },
      uSkyMid: { value: new THREE.Color('#73b3ff') },
      uHorizon: { value: new THREE.Color('#ffe0a6') },
      uBelowHorizon: { value: new THREE.Color('#66994d') },
      uMtColor1: { value: new THREE.Color(0.5, 0.6, 0.75) },
      uMtColor2: { value: new THREE.Color(0.38, 0.58, 0.32) },
      uMtColor3: { value: new THREE.Color(0.28, 0.45, 0.22) },
      uStarVisibility: { value: 0 },
    },
    vertexShader: bgVertexShader,
    fragmentShader: bgFragmentShader,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), [])

  useFrame((state, delta) => {
    const mesh = meshRef.current
    if (!mesh) return

    const t = gameState.timeOfDay.current
    const nightFactor = getNightFactor(t)
    const sunsetFactor = getSunsetFactor(t)
    const sunriseFactor = getSunriseFactor(t)
    const warmFactor = Math.max(sunsetFactor, sunriseFactor)

    const speed = gameState.gameOver ? 0 : gameState.speed.current || 0
    const speedFactor = Math.min(speed / gameState.baseSpeed, 1.35)
    const targetCloudStrength = cloudStrength + speedFactor * 0.1
    const targetHazeStrength = hazeStrength + speedFactor * 0.04

    material.uniforms.uTime.value = state.clock.elapsedTime
    material.uniforms.uBrightness.value = THREE.MathUtils.lerp(brightness, 0.25, nightFactor)
    material.uniforms.uSaturation.value = saturation
    material.uniforms.uSunGlowStrength.value = THREE.MathUtils.lerp(
      sunGlowStrength + warmFactor * 0.3, 0.0, nightFactor
    )
    material.uniforms.uCloudStrength.value = THREE.MathUtils.lerp(
      material.uniforms.uCloudStrength.value,
      targetCloudStrength,
      delta * 2
    )
    material.uniforms.uHazeStrength.value = THREE.MathUtils.lerp(
      material.uniforms.uHazeStrength.value,
      targetHazeStrength,
      delta * 2
    )

    // Lerp sky colors — use sunrise or sunset warm tint (they never overlap)
    const activeWarmFactor = sunriseFactor > 0 ? sunriseFactor : sunsetFactor
    const warmTop = sunriseFactor > 0 ? '#3d2a5a' : '#2a1a4d'
    const warmMid = sunriseFactor > 0 ? '#dd7799' : '#cc4488'
    const warmHorizon = sunriseFactor > 0 ? '#ffaa66' : '#ff6633'

    lerpDayNightColor(material.uniforms.uSkyTop.value, skyTop, '#0a0e2a', nightFactor, warmTop, activeWarmFactor)
    lerpDayNightColor(material.uniforms.uSkyMid.value, skyMid, '#121833', nightFactor, warmMid, activeWarmFactor)
    lerpDayNightColor(material.uniforms.uHorizon.value, horizon, '#1a1530', nightFactor, warmHorizon, activeWarmFactor)
    lerpDayNightColor(material.uniforms.uBelowHorizon.value, belowHorizon, '#1a2a15', nightFactor)

    // Mountain colors — at night, blend into surrounding sky so they don't create visible bands
    lerpDayNightColor(material.uniforms.uMtColor1.value, '#8099bf', '#101628', nightFactor)
    lerpDayNightColor(material.uniforms.uMtColor2.value, '#619452', '#12162a', nightFactor)
    lerpDayNightColor(material.uniforms.uMtColor3.value, '#477338', '#151428', nightFactor)

    // Stars fade in when nightFactor > 0.5
    material.uniforms.uStarVisibility.value = Math.max(0, (nightFactor - 0.5) * 2)

    const distance = 139
    const skyHeight = 28

    camera.getWorldDirection(dir)
    dir.y = 0
    dir.normalize()

    mesh.position.copy(camera.position).addScaledVector(dir, distance)
    mesh.position.y = skyHeight

    mesh.rotation.set(0, Math.atan2(camera.position.x - mesh.position.x, camera.position.z - mesh.position.z), 0)

    const vFov = THREE.MathUtils.degToRad(camera.fov)
    const height = 2 * distance * Math.tan(vFov / 2)
    const width = height * camera.aspect
    mesh.scale.set(width * 1.2, height * 1.2, 1)
  })

  return (
    <mesh ref={meshRef} material={material}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  )
}
