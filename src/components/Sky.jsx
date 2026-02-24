import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const skyVertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

const skyFragmentShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldPosition;

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

  float fbm(vec2 p) {
    float value = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amp * noise(p);
      p *= 2.0;
      amp *= 0.5;
    }
    return value;
  }

  float mountainLayer(vec2 p, float scale, float height, float sharpness) {
    float n = fbm(p * scale);
    n = n * height;
    return n;
  }

  void main() {
    vec3 dir = normalize(vWorldPosition);
    float h = dir.y;

    // --- Sky gradient ---
    vec3 zenith   = vec3(0.18, 0.32, 0.72);
    vec3 midHigh  = vec3(0.35, 0.55, 0.88);
    vec3 midLow   = vec3(0.65, 0.72, 0.90);
    vec3 horizonA = vec3(0.95, 0.75, 0.55);
    vec3 horizonB = vec3(1.0, 0.85, 0.60);

    vec3 sky;
    if (h > 0.5) {
      sky = mix(midHigh, zenith, smoothstep(0.5, 1.0, h));
    } else if (h > 0.15) {
      sky = mix(midLow, midHigh, smoothstep(0.15, 0.5, h));
    } else if (h > 0.0) {
      sky = mix(horizonA, midLow, smoothstep(0.0, 0.15, h));
    } else {
      sky = mix(horizonB, horizonA, smoothstep(-0.05, 0.0, h));
    }

    // --- Sun ---
    vec3 sunDir = normalize(vec3(-0.3, 0.28, -1.0));
    float sunDot = dot(dir, sunDir);
    float sunDisc = smoothstep(0.9975, 0.999, sunDot);
    float sunGlow = pow(max(sunDot, 0.0), 48.0) * 0.5;
    float sunHalo = pow(max(sunDot, 0.0), 8.0) * 0.2;
    float sunScatter = pow(max(sunDot, 0.0), 3.0) * 0.08;

    sky += vec3(1.0, 0.98, 0.92) * sunDisc * 2.0;
    sky += vec3(1.0, 0.85, 0.5) * sunGlow;
    sky += vec3(1.0, 0.7, 0.4) * sunHalo;
    sky += vec3(1.0, 0.6, 0.3) * sunScatter;

    // --- Clouds ---
    if (h > 0.0) {
      vec2 cloudUV = dir.xz / (h + 0.05) * 1.5;
      float drift = uTime * 0.015;

      float cloud1 = fbm(cloudUV * 1.0 + vec2(drift, drift * 0.3));
      cloud1 = smoothstep(0.42, 0.72, cloud1);

      float cloud2 = fbm(cloudUV * 0.6 + vec2(drift * 0.7 + 10.0, drift * 0.2 + 5.0));
      cloud2 = smoothstep(0.45, 0.75, cloud2);

      float cloud = max(cloud1, cloud2 * 0.7);

      float cloudFade = smoothstep(0.0, 0.12, h) * smoothstep(0.7, 0.35, h);
      cloud *= cloudFade;

      float cloudSunLight = pow(max(sunDot, 0.0), 4.0) * 0.3;
      vec3 cloudLit   = vec3(1.0, 0.97, 0.93) + cloudSunLight;
      vec3 cloudShade = vec3(0.65, 0.60, 0.72);
      float detail = fbm(cloudUV * 3.0 + drift * 0.5);
      vec3 cloudColor = mix(cloudShade, cloudLit, smoothstep(0.3, 0.7, detail));

      sky = mix(sky, cloudColor, cloud * 0.85);
    }

    // --- Mountains (3 layered ridges) ---
    float angle = atan(dir.x, dir.z);

    float m1 = mountainLayer(vec2(angle, 0.0), 3.0, 0.10, 1.0);
    float m2 = mountainLayer(vec2(angle + 5.0, 1.0), 5.0, 0.07, 1.0);
    float m3 = mountainLayer(vec2(angle + 10.0, 2.0), 4.0, 0.05, 1.0);

    vec3 mtnFar    = vec3(0.45, 0.40, 0.60);
    vec3 mtnMid    = vec3(0.35, 0.32, 0.52);
    vec3 mtnNear   = vec3(0.25, 0.25, 0.42);

    // Apply atmospheric haze to far mountains
    float sunInfluence = pow(max(dot(normalize(vec3(dir.x, 0.0, dir.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z))), 0.0), 3.0);
    mtnFar  = mix(mtnFar,  vec3(0.7, 0.55, 0.55), sunInfluence * 0.4);
    mtnMid  = mix(mtnMid,  vec3(0.6, 0.45, 0.50), sunInfluence * 0.3);
    mtnNear = mix(mtnNear, vec3(0.5, 0.35, 0.45), sunInfluence * 0.2);

    if (h < m1 + 0.02) {
      float blend = smoothstep(m1 - 0.005, m1 + 0.02, h);
      sky = mix(mix(mtnFar, sky, 0.3), sky, blend);
    }
    if (h < m2 + 0.01) {
      float blend = smoothstep(m2 - 0.005, m2 + 0.01, h);
      sky = mix(mix(mtnMid, sky, 0.15), sky, blend);
    }
    if (h < m3 + 0.005) {
      float blend = smoothstep(m3 - 0.005, m3 + 0.005, h);
      sky = mix(mtnNear, sky, blend);
    }

    gl_FragColor = vec4(sky, 1.0);
  }
`

export default function Sky() {
  const meshRef = useRef()
  const { scene } = useThree()

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
  }), [])

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
    })
  }, [uniforms])

  useFrame((_, delta) => {
    uniforms.uTime.value += delta
    if (meshRef.current) {
      meshRef.current.position.copy(scene.getObjectByProperty('isCamera', true).position)
    }
  })

  return (
    <mesh ref={meshRef} material={material} renderOrder={-1}>
      <sphereGeometry args={[500, 32, 32]} />
    </mesh>
  )
}
