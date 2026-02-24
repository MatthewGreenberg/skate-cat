import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'

const CAMERA_OFFSET = new THREE.Vector3(2.5, 0.8, 3)
const LOOK_AT = new THREE.Vector3(0, 0.3, -2)

export default function CameraRig() {
  const { camera } = useThree()
  const initialized = useRef(false)

  useFrame(() => {
    if (!initialized.current) {
      camera.position.copy(CAMERA_OFFSET)
      camera.lookAt(LOOK_AT)
      initialized.current = true
    }
    camera.lookAt(LOOK_AT)
  })

  return null
}
