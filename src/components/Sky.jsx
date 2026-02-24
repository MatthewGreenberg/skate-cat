import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useEffect } from 'react'

export default function Sky() {
  const { scene } = useThree()

  useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    const gradient = ctx.createLinearGradient(0, 0, 0, 256)
    gradient.addColorStop(0, '#4A90D9')
    gradient.addColorStop(0.6, '#87CEEB')
    gradient.addColorStop(1, '#E8F4F8')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 1, 256)
    const texture = new THREE.CanvasTexture(canvas)
    texture.mapping = THREE.EquirectangularReflectionMapping
    scene.background = texture
    return () => { texture.dispose() }
  }, [scene])

  return null
}
