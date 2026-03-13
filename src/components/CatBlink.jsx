import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import * as THREE from 'three'

const BLINK_DURATION = 0.12
const MIN_INTERVAL = 2.5
const MAX_INTERVAL = 6.0

export default function CatBlink() {
  const leftRef = useRef()
  const rightRef = useRef()

  const {
    eyeColor, lidWidth, lidHeight,
    leftX, leftY, leftZ,
    rightX, rightY, rightZ,
    rotX, rotY, rotZ,
    positioning,
  } = useControls('Cat Blink', {
    eyeColor: '#ff0000',
    lidWidth: { value: 3.0, min: 0.5, max: 8, step: 0.1 },
    lidHeight: { value: 2.5, min: 0.5, max: 8, step: 0.1 },
    leftX: { value: -4.8, min: -15, max: 15, step: 0.1 },
    leftY: { value: 3.2, min: -15, max: 15, step: 0.1 },
    leftZ: { value: 8.6, min: -15, max: 15, step: 0.1 },
    rightX: { value: 4.8, min: -15, max: 15, step: 0.1 },
    rightY: { value: 3.2, min: -15, max: 15, step: 0.1 },
    rightZ: { value: 8.6, min: -15, max: 15, step: 0.1 },
    rotX: { value: 0, min: -Math.PI, max: Math.PI, step: 0.05 },
    rotY: { value: 0, min: -Math.PI, max: Math.PI, step: 0.05 },
    rotZ: { value: 0, min: -Math.PI, max: Math.PI, step: 0.05 },
    positioning: true,
  })

  const state = useRef({
    timer: 3,
    blinking: false,
    blinkTime: 0,
  })

  useFrame((_, delta) => {
    if (positioning) return

    const s = state.current
    if (!s.blinking) {
      s.timer -= delta
      if (s.timer <= 0) {
        s.blinking = true
        s.blinkTime = 0
      }
    } else {
      s.blinkTime += delta
      if (s.blinkTime >= BLINK_DURATION) {
        s.blinking = false
        s.timer = MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL)
      }
    }

    const t = s.blinkTime / BLINK_DURATION
    const lidAmount = s.blinking ? Math.sin(t * Math.PI) : 0

    if (leftRef.current) leftRef.current.scale.y = Math.max(lidAmount, 0.001)
    if (rightRef.current) rightRef.current.scale.y = Math.max(lidAmount, 0.001)
  })

  return (
    <group>
      <mesh ref={leftRef} position={[leftX, leftY, leftZ]} rotation={[rotX, rotY, rotZ]}>
        <planeGeometry args={[lidWidth, lidHeight]} />
        <meshBasicMaterial color={eyeColor} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={rightRef} position={[rightX, rightY, rightZ]} rotation={[rotX, rotY, rotZ]}>
        <planeGeometry args={[lidWidth, lidHeight]} />
        <meshBasicMaterial color={eyeColor} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}
