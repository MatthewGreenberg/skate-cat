import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import * as THREE from 'three'
import { gameState, getNightFactor } from '../store'

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uSlots;
  uniform float uLineWidth;
  uniform float uScrollSpeed;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;

  float hash(float n) {
    return fract(sin(n) * 43758.5453);
  }

  void main() {
    if (uIntensity < 0.01) discard;

    float slot = floor(vUv.x * uSlots);
    float slotRand = hash(slot);

    float density = uIntensity * 0.6;
    if (slotRand > density) discard;

    float speed = uScrollSpeed + slotRand * 1.8;
    float scrollY = fract(vUv.y * (2.0 + slotRand * 3.0) + uTime * speed);

    float lw = uLineWidth + slotRand * uLineWidth;
    float line = smoothstep(0.0, lw, scrollY) * (1.0 - smoothstep(lw, lw * 2.0, scrollY));

    float edgeFade = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);

    float alpha = line * edgeFade * uIntensity * uOpacity;
    if (alpha < 0.01) discard;

    vec3 color = mix(uColor, uColor * 0.8, slotRand);
    gl_FragColor = vec4(color, alpha);
  }
`

export default function SpeedLines() {
  const meshRef = useRef()
  const energyRef = useRef(1)

  const { color, slots, lineWidth, scrollSpeed, opacity, height } = useControls('Speed Lines', {
    color: '#ffffff',
    slots: { value: 38, min: 5, max: 100, step: 1 },
    lineWidth: { value: 0.11, min: 0.01, max: 0.3, step: 0.01 },
    scrollSpeed: { value: 1.4, min: 0.2, max: 8, step: 0.1 },
    opacity: { value: 0.2, min: 0, max: 1, step: 0.05 },
    height: { value: 0.56, min: 0, max: 1, step: 0.01 },
  })

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uIntensity: { value: 0 },
    uSlots: { value: 40 },
    uLineWidth: { value: 0.08 },
    uScrollSpeed: { value: 1.4 },
    uColor: { value: new THREE.Color('#ffffff') },
    uOpacity: { value: 0.7 },
  }), [])

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [uniforms])

  useFrame((_, delta) => {
    const nightFactor = getNightFactor(gameState.timeOfDay.current)
    gameState.comboEnergy.current = Math.min(1, gameState.comboEnergy.current + delta * 1.1)
    energyRef.current = THREE.MathUtils.lerp(energyRef.current, gameState.comboEnergy.current, delta * 4)

    uniforms.uTime.value += delta
    uniforms.uSlots.value = slots
    uniforms.uLineWidth.value = lineWidth
    uniforms.uScrollSpeed.value = scrollSpeed
    uniforms.uColor.value.set(color)
    uniforms.uOpacity.value = THREE.MathUtils.lerp(opacity, 0.05, nightFactor) * THREE.MathUtils.lerp(0.35, 1, energyRef.current)

    const target = gameState.speedLinesOn ? 1 : 0
    uniforms.uIntensity.value = THREE.MathUtils.lerp(uniforms.uIntensity.value, target, delta * 6)
  })

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, height, -40]}
      material={material}
    >
      <planeGeometry args={[3, 100]} />
    </mesh>
  )
}
