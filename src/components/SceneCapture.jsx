import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

export default function SceneCapture({ shouldCapture, snapshotTextureRef, onCaptured, renderPriority = 2 }) {
  const { gl } = useThree()
  const capturedRef = useRef(false)
  const copyOrigin = useRef(new THREE.Vector2())
  const drawingBufferSize = useRef(new THREE.Vector2())

  useEffect(() => () => {
    snapshotTextureRef.current?.dispose()
    snapshotTextureRef.current = null
  }, [snapshotTextureRef])

  useFrame(() => {
    if (!shouldCapture.current) {
      capturedRef.current = false
      return
    }
    if (capturedRef.current) return
    capturedRef.current = true

    gl.getDrawingBufferSize(drawingBufferSize.current)
    const width = Math.max(1, Math.floor(drawingBufferSize.current.x))
    const height = Math.max(1, Math.floor(drawingBufferSize.current.y))
    const currentTexture = snapshotTextureRef.current

    if (!currentTexture || currentTexture.image.width !== width || currentTexture.image.height !== height) {
      currentTexture?.dispose()
      const nextTexture = new THREE.FramebufferTexture(width, height)
      nextTexture.colorSpace = THREE.SRGBColorSpace
      nextTexture.flipY = false
      nextTexture.minFilter = THREE.LinearFilter
      nextTexture.magFilter = THREE.LinearFilter
      snapshotTextureRef.current = nextTexture
    }

    gl.setRenderTarget(null)
    gl.copyFramebufferToTexture(snapshotTextureRef.current, copyOrigin.current)
    shouldCapture.current = false

    onCaptured()
  }, renderPriority)

  return null
}
