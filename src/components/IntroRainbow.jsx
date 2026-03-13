import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import * as THREE from 'three'

const RAINBOW_COLORS = [
  '#ff6b6b', '#ffb347', '#fff176', '#81c784', '#64b5f6', '#b39ddb',
]
const ARC_SEGMENTS = 64
const RADIUS = 10
const BAND_WIDTH = 0.35
const BAND_GAP = 0.05
const BASE_OPACITY = 0.25

export default function IntroRainbow({ visible = true }) {
  const groupRef = useRef()
  const fadeRef = useRef(visible ? 1 : 0)

  const {
    posX, posY, posZ, rotY, scaleX, scaleY, opacity,
  } = useControls('Intro Rainbow', {
    posX: { value: -0.8, min: -10, max: 10, step: 0.1 },
    posY: { value: -1.6, min: -10, max: 10, step: 0.1 },
    posZ: { value: -11, min: -20, max: 5, step: 0.1 },
    rotY: { value: 0.52, min: -Math.PI, max: Math.PI, step: 0.05 },
    scaleX: { value: 0.5, min: 0.5, max: 4, step: 0.1 },
    scaleY: { value: 0.40, min: 0.1, max: 2, step: 0.05 },
    opacity: { value: 0.07, min: 0.01, max: 1, step: 0.01 },
  })

  const bands = useMemo(() => {
    return RAINBOW_COLORS.map((color, i) => {
      const r = RADIUS + i * (BAND_WIDTH + BAND_GAP)
      const points = []
      for (let j = 0; j <= ARC_SEGMENTS; j++) {
        const angle = (j / ARC_SEGMENTS) * Math.PI
        points.push(new THREE.Vector3(
          Math.cos(angle) * r,
          Math.sin(angle) * r,
          0,
        ))
      }
      const curve = new THREE.CatmullRomCurve3(points)
      const geometry = new THREE.TubeGeometry(curve, ARC_SEGMENTS, BAND_WIDTH / 2, 8, false)
      return { geometry, color }
    })
  }, [])

  useFrame((_, delta) => {
    const target = visible ? 1 : 0
    fadeRef.current = THREE.MathUtils.lerp(fadeRef.current, target, delta * 2)
    if (groupRef.current) {
      groupRef.current.visible = fadeRef.current > 0.01
      groupRef.current.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.opacity = fadeRef.current * opacity
        }
      })
    }
  })

  return (
    <group ref={groupRef} position={[posX, posY, posZ]} rotation={[0, rotY, 0]} scale={[scaleX, scaleY, 1]}>
      {bands.map(({ geometry, color }, i) => (
        <mesh key={i} geometry={geometry}>
          <meshBasicMaterial
            color={color}
            transparent
            opacity={BASE_OPACITY}
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  )
}
