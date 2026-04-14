import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

export default function SceneCapture({
  shouldCaptureRef,
  snapshotTextureRef,
  onCaptured,
  renderPriority = 2,
  skipCapture = false,
}) {
  const { gl } = useThree()
  const capturedRef = useRef(false)
  const copyOrigin = useRef(new THREE.Vector2())
  const drawingBufferSize = useRef(new THREE.Vector2())

  useEffect(() => () => {
    snapshotTextureRef.current?.dispose()
    snapshotTextureRef.current = null
  }, [snapshotTextureRef])

  useFrame(() => {
    if (!shouldCaptureRef.current) {
      capturedRef.current = false
      return
    }
    if (capturedRef.current) return
    capturedRef.current = true

    if (skipCapture) {
      shouldCaptureRef.current = false
      onCaptured(null)
      return
    }

    gl.getDrawingBufferSize(drawingBufferSize.current)
    const width = Math.max(1, Math.floor(drawingBufferSize.current.x))
    const height = Math.max(1, Math.floor(drawingBufferSize.current.y))
    const currentTexture = snapshotTextureRef.current

    if (!currentTexture || currentTexture.image.width !== width || currentTexture.image.height !== height) {
      currentTexture?.dispose()
      const nextTexture = new THREE.FramebufferTexture(width, height)
      nextTexture.flipY = false
      nextTexture.minFilter = THREE.LinearFilter
      nextTexture.magFilter = THREE.LinearFilter
      snapshotTextureRef.current = nextTexture
    }

    gl.setRenderTarget(null)
    gl.copyFramebufferToTexture(snapshotTextureRef.current, copyOrigin.current)
    shouldCaptureRef.current = false

    onCaptured(snapshotTextureRef.current)
  }, renderPriority)

  return null
}
