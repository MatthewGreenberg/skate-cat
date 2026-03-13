import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import * as THREE from 'three'

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

    // Distant mountains (layer 1 - far, blue-ish, tall peaks)
    float mt1 = fbm2(vec2(uv.x * 2.5 + 1.5, 0.0)) * 0.15 + 0.34;
    float mountain1 = smoothstep(mt1, mt1 + 0.01, uv.y);
    vec3 mtColor1 = vec3(0.5, 0.6, 0.75);
    sky = mix(mtColor1, sky, mountain1);

    // Closer hills (layer 2 - green rolling hills)
    float mt2 = fbm2(vec2(uv.x * 4.0 + 3.0, 0.5)) * 0.1 + 0.28;
    float mountain2 = smoothstep(mt2, mt2 + 0.006, uv.y);
    vec3 mtColor2 = vec3(0.38, 0.58, 0.32);
    sky = mix(mtColor2, sky, mountain2);

    // Nearest hills (layer 3 - darker green, matches ground)
    float mt3 = fbm2(vec2(uv.x * 7.0 + 7.0, 1.0)) * 0.07 + 0.22;
    float mountain3 = smoothstep(mt3, mt3 + 0.004, uv.y);
    vec3 mtColor3 = vec3(0.28, 0.45, 0.22);
    sky = mix(mtColor3, sky, mountain3);

    // Clouds - fluffy cumulus shapes
    float cloud1 = fbm3(vec2(uv.x * 3.0 + uTime * 0.015, uv.y * 4.0 + 1.0));
    float cloud2 = fbm3(vec2(uv.x * 5.0 + uTime * 0.01 + 3.0, uv.y * 3.0 + 2.0));
    float cloudShape = max(cloud1, cloud2 * 0.8);
    float cloudMask = smoothstep(0.48, 0.72, cloudShape) * smoothstep(0.35, 0.55, uv.y) * smoothstep(0.95, 0.75, uv.y) * 0.35;
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
    cloudStrength: { value: 0.0, min: 0, max: 1.5, step: 0.01 },
    hazeStrength: { value: 0.0, min: 0, max: 1.5, step: 0.01 },
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
      uCloudStrength: { value: 0.0 },
      uHazeStrength: { value: 0.0 },
      uSkyTop: { value: new THREE.Color('#4d8cff') },
      uSkyMid: { value: new THREE.Color('#73b3ff') },
      uHorizon: { value: new THREE.Color('#ffe0a6') },
      uBelowHorizon: { value: new THREE.Color('#66994d') },
    },
    vertexShader: bgVertexShader,
    fragmentShader: bgFragmentShader,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), [])

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return

    material.uniforms.uTime.value = state.clock.elapsedTime
    material.uniforms.uBrightness.value = brightness
    material.uniforms.uSaturation.value = saturation
    material.uniforms.uSunGlowStrength.value = sunGlowStrength
    material.uniforms.uCloudStrength.value = cloudStrength
    material.uniforms.uHazeStrength.value = hazeStrength
    material.uniforms.uSkyTop.value.set(skyTop)
    material.uniforms.uSkyMid.value.set(skyMid)
    material.uniforms.uHorizon.value.set(horizon)
    material.uniforms.uBelowHorizon.value.set(belowHorizon)

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
