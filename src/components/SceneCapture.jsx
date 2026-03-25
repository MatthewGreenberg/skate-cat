import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

export default function SceneCapture({ shouldCapture, renderTarget, onCaptured }) {
  const { gl, scene, camera } = useThree()
  const capturedRef = useRef(false)

  useFrame(() => {
    if (!shouldCapture.current || !renderTarget) {
      capturedRef.current = false
      return
    }
    if (capturedRef.current) return
    capturedRef.current = true

    gl.setRenderTarget(renderTarget)
    gl.render(scene, camera)
    gl.setRenderTarget(null)

    onCaptured()
  })

  return null
}
