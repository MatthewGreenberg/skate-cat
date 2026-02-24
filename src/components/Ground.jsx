import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import Grass from './Grass'
import { gameState } from '../store'

const SEGMENT_COUNT = 8
const SEGMENT_LENGTH = 20
const SEGMENT_WIDTH = 12

export default function Ground() {
  const { baseSpeed } = useControls('Road', {
    baseSpeed: { value: 5, min: 0, max: 30, step: 0.5 },
  })
  // Sync leva base speed to game state
  gameState.baseSpeed = baseSpeed
  if (gameState.speed.current < baseSpeed) gameState.speed.current = baseSpeed
  const groupRefs = useRef([])
  const offsets = useRef(
    Array.from({ length: SEGMENT_COUNT }, (_, i) => i * SEGMENT_LENGTH)
  )

  useFrame((_, delta) => {
    if (gameState.gameOver) return
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      offsets.current[i] -= gameState.speed.current * delta

      if (offsets.current[i] < -SEGMENT_LENGTH) {
        const maxZ = Math.max(...offsets.current)
        offsets.current[i] = maxZ + SEGMENT_LENGTH
      }

      if (groupRefs.current[i]) {
        groupRefs.current[i].position.z = -offsets.current[i]
      }
    }
  })

  return (
    <group>
      {Array.from({ length: SEGMENT_COUNT }, (_, i) => (
        <group
          key={i}
          ref={(el) => (groupRefs.current[i] = el)}
          position={[0, 0, -offsets.current[i]]}
        >
          {/* Green ground */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
            <planeGeometry args={[SEGMENT_WIDTH, SEGMENT_LENGTH]} />
            <meshStandardMaterial color="#7EC850" />
          </mesh>
          {/* Tan road strip */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
            <planeGeometry args={[3, SEGMENT_LENGTH]} />
            <meshStandardMaterial color="#D4A574" />
          </mesh>
          <Grass />
        </group>
      ))}
    </group>
  )
}
