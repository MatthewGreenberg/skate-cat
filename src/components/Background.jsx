import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { folder } from 'leva'
import * as THREE from 'three'
import { gameState, getGameDelta, getNightFactor, getSunsetFactor, getSunriseFactor, lerpDayNightColor, isSafari } from '../store'
import { useOptionalControls } from '../lib/debugControls'

const BACKGROUND_DISTANCE = 145
const BACKGROUND_HEIGHT = 28

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
  uniform float uParallaxStrength;
  uniform float uLayerSeparation;
  uniform float uHazeStrength;
  uniform float uCloudStreakStrength;
  uniform float uStarVisibility;
  uniform float uNightFactor;
  uniform float uSkyOffset;
  uniform float uFarOffset;
  uniform float uMidOffset;
  uniform float uNearOffset;
  uniform vec3 uSkyTop;
  uniform vec3 uSkyMid;
  uniform vec3 uHorizon;
  uniform vec3 uBelowHorizon;
  uniform vec3 uFarColor;
  uniform vec3 uMidColor;
  uniform vec3 uNearColor;
  uniform vec3 uCloudColor;
  uniform vec3 uHazeColor;
  uniform vec3 uSunColor;
  uniform vec3 uMoonColor;
  uniform vec3 uStarColor;

  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
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

  uniform int uFbmOctaves;
  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      if (i >= uFbmOctaves) break;
      value += noise(p) * amplitude;
      p *= 2.03;
      amplitude *= 0.5;
    }
    return value;
  }

  float ridge(vec2 p) {
    float n = fbm(p);
    return 1.0 - abs(n * 2.0 - 1.0);
  }

  float layerMask(float y, float height, float feather) {
    return 1.0 - smoothstep(height - feather, height + feather, y);
  }

  vec3 adjustSaturation(vec3 color, float saturation) {
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    return mix(vec3(luma), color, saturation);
  }

  float starField(vec2 uv) {
    vec2 starUv = vec2(uv.x + uSkyOffset * 0.08, uv.y) * vec2(110.0, 68.0);
    vec2 cell = floor(starUv);
    vec2 local = fract(starUv) - 0.5;
    float seed = hash(cell);
    float star = 0.0;

    if (seed > 0.985) {
      vec2 offset = vec2(hash(cell + 4.1), hash(cell + 8.7)) - 0.5;
      float dist = length(local - offset * 0.55);
      float radius = mix(0.03, 0.12, hash(cell + 2.3));
      float sparkle = 0.72 + 0.28 * sin(uTime * (1.4 + hash(cell + 5.2) * 2.4) + seed * 50.0);
      star = (1.0 - smoothstep(radius * 0.35, radius, dist)) * sparkle;
    }

    return star;
  }

  void main() {
    vec2 uv = vUv;
    float horizonLine = 0.18;

    vec3 color;
    if (uv.y > horizonLine) {
      float t = (uv.y - horizonLine) / (1.0 - horizonLine);
      vec3 skyBlend = mix(uSkyMid, uSkyTop, smoothstep(0.12, 1.0, t));
      color = mix(uHorizon, skyBlend, smoothstep(0.0, 0.24, t));
    } else {
      float t = (horizonLine - uv.y) / horizonLine;
      color = mix(uHorizon, uBelowHorizon, smoothstep(0.0, 0.95, t));
    }

    float sunNightBlend = smoothstep(0.25, 0.75, uNightFactor);
    vec2 sunPos = vec2(0.7 - uSkyOffset * 0.025, horizonLine + 0.11);
    vec2 moonPos = vec2(0.74 - uSkyOffset * 0.012, 0.7);
    float sunDist = length(vec2(uv.x - sunPos.x, (uv.y - sunPos.y) * 1.35));
    float moonDist = length(vec2(uv.x - moonPos.x, (uv.y - moonPos.y) * 1.15));
    float sunDisc = 1.0 - smoothstep(0.045, 0.058, sunDist);
    float moonDisc = 1.0 - smoothstep(0.055, 0.07, moonDist);
    float sunGlow = exp(-sunDist * 8.5) * 0.24;
    float moonGlow = exp(-moonDist * 7.5) * 0.22;
    color += uSunColor * (sunGlow + sunDisc * 0.5) * (1.0 - sunNightBlend);
    color += uMoonColor * (moonGlow + moonDisc * 0.7) * sunNightBlend;

    float streak1 = fbm(vec2((uv.x + uSkyOffset * 0.22) * 4.2, uv.y * 10.0 + 1.7));
    float streak2 = ridge(vec2((uv.x + uSkyOffset * 0.32) * 6.8 + 4.0, uv.y * 13.0 + 0.8));
    float cloudBand = max(streak1, streak2 * 0.85);
    float cloudMask = smoothstep(0.56, 0.76, cloudBand);
    cloudMask *= smoothstep(0.34, 0.62, uv.y) * smoothstep(0.94, 0.68, uv.y);
    color = mix(color, uCloudColor, cloudMask * uCloudStreakStrength);

    float stars = starField(uv);
    stars *= smoothstep(horizonLine + 0.08, 0.68, uv.y) * uStarVisibility;
    color += uStarColor * stars;

    float sep = uLayerSeparation;

    float farX = uv.x * 2.2 + uFarOffset * (0.35 + uParallaxStrength * 0.55);
    float farPeaks = ridge(vec2(farX + 1.8, 0.9));
    float farDetail = ridge(vec2(farX * 1.7 + 6.4, 2.6));
    float farHeight = 0.295 + (farPeaks * 0.08 + farDetail * 0.04 - 0.05) * sep;
    float farMask = layerMask(uv.y, farHeight, 0.016);

    float midX = uv.x * 3.05 + uMidOffset * (0.6 + uParallaxStrength * 0.85);
    float midRoll = fbm(vec2(midX + 3.2, 4.2));
    float midRidge = ridge(vec2(midX * 1.55 + 7.6, 5.1));
    float midHeight = 0.232 + (midRoll * 0.08 + midRidge * 0.05 - 0.035) * sep;
    float midMask = layerMask(uv.y, midHeight, 0.012);

    float nearX = uv.x * 4.4 + uNearOffset * (1.05 + uParallaxStrength * 1.15);
    float nearMass = fbm(vec2(nearX + 1.2, 8.6));
    float nearCliff = ridge(vec2(nearX * 1.35 + 5.4, 10.7));
    float steppedCliff = floor((nearMass * 0.7 + nearCliff * 0.7) * 4.0) / 4.0;
    float nearHeight = 0.17 + (steppedCliff * 0.065 + nearCliff * 0.03 - 0.02) * sep;
    float nearMask = layerMask(uv.y, nearHeight, 0.01);

    float farAtmos = exp(-abs(uv.y - farHeight) * 34.0) * 0.14 * uHazeStrength;
    float midAtmos = exp(-abs(uv.y - midHeight) * 30.0) * 0.12 * uHazeStrength;
    float valleyMist = exp(-abs(uv.y - (horizonLine + 0.01)) * 18.0) * 0.18 * uHazeStrength;

    color = mix(color, uFarColor, farMask * 0.88);
    color = mix(color, uMidColor, midMask * 0.92);
    color = mix(color, uNearColor, nearMask * 0.96);
    color = mix(color, uHazeColor, farAtmos + midAtmos + valleyMist);

    color = adjustSaturation(color, uSaturation);
    color *= uBrightness;

    gl_FragColor = vec4(color, 1.0);
  }
`

export default function Background({ active = true, renderProfile = {} }) {
  const meshRef = useRef()
  const motionTime = useRef(0)
  const scrollOffset = useRef(0)
  const { camera } = useThree()
  const dir = useMemo(() => new THREE.Vector3(), [])

  const {
    brightness,
    saturation,
    parallaxStrength,
    layerSeparation,
    hazeStrength,
    cloudStreakStrength,
  } = useOptionalControls('Game', {
    Background: folder({
      brightness: { value: 0.9, min: 0.4, max: 1.6, step: 0.01 },
      saturation: { value: 0.82, min: 0, max: 1.6, step: 0.01 },
      parallaxStrength: { value: 0.48, min: 0, max: 1.5, step: 0.01 },
      layerSeparation: { value: 0.82, min: 0.5, max: 1.8, step: 0.01 },
      hazeStrength: { value: 0.14, min: 0, max: 1.4, step: 0.01 },
      cloudStreakStrength: { value: 0.08, min: 0, max: 1.5, step: 0.01 },
    }, { collapsed: true }),
  }, [])
  const {
    daySkyTop,
    daySkyMid,
    dayHorizon,
    dayBelowHorizon,
    dayFarColor,
    dayMidColor,
    dayNearColor,
    dayCloudColor,
  } = useOptionalControls('Game', {
    'Background Day': folder({
      daySkyTop: '#88b6e8',
      daySkyMid: '#c7def0',
      dayHorizon: '#f4e3c8',
      dayBelowHorizon: '#b7c0a1',
      dayFarColor: '#92a9bf',
      dayMidColor: '#75867f',
      dayNearColor: '#4f5b62',
      dayCloudColor: '#f5efe6',
    }, { collapsed: true }),
  }, [])
  const {
    nightSkyTop,
    nightSkyMid,
    nightHorizon,
    nightBelowHorizon,
    nightFarColor,
    nightMidColor,
    nightNearColor,
    moonColor,
    starColor,
  } = useOptionalControls('Game', {
    'Background Night': folder({
      nightSkyTop: '#09112b',
      nightSkyMid: '#1a2950',
      nightHorizon: '#25305a',
      nightBelowHorizon: '#10182a',
      nightFarColor: '#1a2241',
      nightMidColor: '#151b32',
      nightNearColor: '#0d1020',
      moonColor: '#d9e6ff',
      starColor: '#9ed3ff',
    }, { collapsed: true }),
  }, [])

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uBrightness: { value: 0.9 },
    uSaturation: { value: 0.82 },
    uParallaxStrength: { value: 0.48 },
    uLayerSeparation: { value: 0.82 },
    uHazeStrength: { value: 0.14 },
    uCloudStreakStrength: { value: 0.08 },
    uStarVisibility: { value: 0 },
    uNightFactor: { value: 0 },
    uSkyOffset: { value: 0 },
    uFarOffset: { value: 0 },
    uMidOffset: { value: 0 },
    uNearOffset: { value: 0 },
    uSkyTop: { value: new THREE.Color('#88b6e8') },
    uSkyMid: { value: new THREE.Color('#c7def0') },
    uHorizon: { value: new THREE.Color('#f4e3c8') },
    uBelowHorizon: { value: new THREE.Color('#b7c0a1') },
    uFarColor: { value: new THREE.Color('#92a9bf') },
    uMidColor: { value: new THREE.Color('#75867f') },
    uNearColor: { value: new THREE.Color('#4f5b62') },
    uCloudColor: { value: new THREE.Color('#f5efe6') },
    uHazeColor: { value: new THREE.Color('#e6ddd0') },
    uSunColor: { value: new THREE.Color('#ffd17a') },
    uMoonColor: { value: new THREE.Color('#d9e6ff') },
    uStarColor: { value: new THREE.Color('#9ed3ff') },
    uFbmOctaves: { value: (renderProfile.backgroundLowCost || isSafari) ? 2 : 4 },
  }), [renderProfile.backgroundLowCost])

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms,
    vertexShader: bgVertexShader,
    fragmentShader: bgFragmentShader,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), [uniforms])

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    if (!active) return

    const gameDelta = getGameDelta(delta)
    motionTime.current += gameDelta

    const t = gameState.timeOfDay.current
    const nightFactor = getNightFactor(t)
    const sunsetFactor = getSunsetFactor(t)
    const sunriseFactor = getSunriseFactor(t)
    const warmFactor = sunriseFactor > 0 ? sunriseFactor : sunsetFactor
    const isSunrise = sunriseFactor > 0
    const speed = !gameState.gameOver ? gameState.speed.current || 0 : 0
    const speedFactor = Math.min(speed / Math.max(gameState.baseSpeed, 0.001), 1.45)
    const motionScale = renderProfile.backgroundLowCost ? 0.6 : 1
    const parallaxScale = renderProfile.backgroundLowCost ? 0.72 : 1
    scrollOffset.current += speed * gameDelta * 0.009 * motionScale
    const lateralOffset = camera.position.x * 0.14
    const depthOffset = camera.position.z * 0.05
    const sharedOffset = lateralOffset + depthOffset + scrollOffset.current

    uniforms.uTime.value = motionTime.current
    uniforms.uBrightness.value = THREE.MathUtils.lerp(brightness, 0.42, nightFactor)
    uniforms.uSaturation.value = THREE.MathUtils.lerp(saturation, saturation * 0.88, nightFactor)
    uniforms.uParallaxStrength.value = parallaxStrength * parallaxScale
    uniforms.uLayerSeparation.value = renderProfile.backgroundLowCost ? layerSeparation * 0.85 : layerSeparation
    uniforms.uHazeStrength.value = THREE.MathUtils.lerp(hazeStrength + speedFactor * 0.03, hazeStrength * 0.75, nightFactor)
    uniforms.uCloudStreakStrength.value = THREE.MathUtils.lerp(
      (renderProfile.backgroundLowCost ? cloudStreakStrength * 0.35 : cloudStreakStrength) + speedFactor * 0.03 * motionScale,
      cloudStreakStrength * 0.42,
      nightFactor
    )
    uniforms.uStarVisibility.value = Math.max(0, (nightFactor - 0.34) / 0.66)
    uniforms.uNightFactor.value = nightFactor
    uniforms.uSkyOffset.value = sharedOffset * (0.04 + parallaxStrength * 0.02) * parallaxScale
    uniforms.uFarOffset.value = sharedOffset * (0.11 + parallaxStrength * 0.06) * parallaxScale
    uniforms.uMidOffset.value = sharedOffset * (0.2 + parallaxStrength * 0.11) * parallaxScale
    uniforms.uNearOffset.value = sharedOffset * (0.34 + parallaxStrength * 0.17) * parallaxScale

    lerpDayNightColor(uniforms.uSkyTop.value, daySkyTop, nightSkyTop, nightFactor, isSunrise ? '#f3a15f' : '#6e5db6', warmFactor)
    lerpDayNightColor(uniforms.uSkyMid.value, daySkyMid, nightSkyMid, nightFactor, isSunrise ? '#ffb070' : '#d188ac', warmFactor)
    lerpDayNightColor(uniforms.uHorizon.value, dayHorizon, nightHorizon, nightFactor, isSunrise ? '#ff8b3d' : '#ff9b62', warmFactor)
    lerpDayNightColor(uniforms.uBelowHorizon.value, dayBelowHorizon, nightBelowHorizon, nightFactor, isSunrise ? '#a46a3f' : '#7f5c42', warmFactor)
    lerpDayNightColor(uniforms.uFarColor.value, dayFarColor, nightFarColor, nightFactor, isSunrise ? '#c18c65' : '#9f88a8', warmFactor)
    lerpDayNightColor(uniforms.uMidColor.value, dayMidColor, nightMidColor, nightFactor, isSunrise ? '#9c7255' : '#735f74', warmFactor)
    lerpDayNightColor(uniforms.uNearColor.value, dayNearColor, nightNearColor, nightFactor, isSunrise ? '#6b503f' : '#3f2f3d', warmFactor)
    lerpDayNightColor(uniforms.uCloudColor.value, dayCloudColor, '#31456e', nightFactor, '#f3ba8f', warmFactor)
    lerpDayNightColor(uniforms.uHazeColor.value, dayHorizon, nightHorizon, nightFactor, '#ffab73', warmFactor)
    lerpDayNightColor(uniforms.uSunColor.value, '#ffd17a', '#89a6ff', nightFactor, '#ff9f6a', warmFactor)
    uniforms.uMoonColor.value.set(moonColor)
    uniforms.uStarColor.value.set(starColor)

    camera.getWorldDirection(dir)
    dir.y = 0
    dir.normalize()

    mesh.position.copy(camera.position).addScaledVector(dir, BACKGROUND_DISTANCE)
    mesh.position.y = BACKGROUND_HEIGHT
    mesh.rotation.set(0, Math.atan2(camera.position.x - mesh.position.x, camera.position.z - mesh.position.z), 0)

    const vFov = THREE.MathUtils.degToRad(camera.fov)
    const height = 2 * BACKGROUND_DISTANCE * Math.tan(vFov / 2)
    const width = height * camera.aspect
    mesh.scale.set(width * 1.2, height * 1.15, 1)
  })

  return (
    <mesh ref={meshRef} material={material} frustumCulled={false} renderOrder={-1000}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  )
}
