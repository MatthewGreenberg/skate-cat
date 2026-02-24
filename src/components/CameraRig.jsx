import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import * as THREE from 'three'
import { gameState } from '../store'

export default function CameraRig() {
  const { camera } = useThree()
  const currentZoom = useRef(0)
  const jumpZoom = useRef(0)

  const { posX, posY, posZ, lookX, lookY, lookZ, kickflipZoom, kickflipLerp, kickflipAngleX, kickflipAngleY } = useControls('Camera', {
    posX: { value: 1.9, min: -10, max: 10, step: 0.1 },
    posY: { value: 1.8, min: 0, max: 10, step: 0.1 },
    posZ: { value: -0.7, min: -10, max: 15, step: 0.1 },
    lookX: { value: -3.9, min: -10, max: 10, step: 0.1 },
    lookY: { value: -2.9, min: -5, max: 5, step: 0.1 },
    lookZ: { value: -2.5, min: -20, max: 10, step: 0.1 },
    kickflipZoom: { value: 2.0, min: 0, max: 2, step: 0.05 },
    kickflipLerp: { value: 3.0, min: 1, max: 20, step: 0.5 },
    kickflipAngleX: { value: 0.45, min: -1, max: 1, step: 0.05 },
    kickflipAngleY: { value: 0.25, min: -1, max: 1, step: 0.05 },
  })

  useFrame((_, delta) => {
    // Calculate zoom-out based on speed above base
    const speedExtra = Math.max(0, gameState.speed.current - gameState.baseSpeed)
    const targetZoom = speedExtra * 0.08 // pull back proportionally
    currentZoom.current = THREE.MathUtils.lerp(currentZoom.current, targetZoom, delta * 5)

    // Jump zoom-out
    const jumpTarget = gameState.jumping ? kickflipZoom : 0
    jumpZoom.current = THREE.MathUtils.lerp(jumpZoom.current, jumpTarget, delta * kickflipLerp)

    const z = currentZoom.current + jumpZoom.current
    camera.position.set(posX + jumpZoom.current * kickflipAngleX, posY + jumpZoom.current * kickflipAngleY, posZ + z)
    camera.lookAt(lookX, lookY, lookZ)
  })

  return null
}
