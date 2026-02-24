import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

function makeGradientTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 512)
  // 0 = zenith, 0.5 = horizon, 1 = nadir
  g.addColorStop(0, '#0f1e50')
  g.addColorStop(0.2, '#1e3a78')
  g.addColorStop(0.35, '#4a78b4')
  g.addColorStop(0.44, '#88b4d8')
  g.addColorStop(0.48, '#c8a87a')
  g.addColorStop(0.5, '#e8926a')
  g.addColorStop(0.53, '#f0b868')
  g.addColorStop(0.58, '#f0d898')
  g.addColorStop(0.7, '#d4c8b0')
  g.addColorStop(1, '#a09880')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 1, 512)
  const tex = new THREE.CanvasTexture(canvas)
  tex.mapping = THREE.EquirectangularReflectionMapping
  return tex
}

function CartoonCloud({ position, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      <mesh>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <mesh position={[1.1, 0.15, 0]}>
        <sphereGeometry args={[0.75, 12, 12]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <mesh position={[-1.0, 0.1, 0]}>
        <sphereGeometry args={[0.8, 12, 12]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <mesh position={[0.5, 0.5, 0]}>
        <sphereGeometry args={[0.7, 12, 12]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <mesh position={[-0.4, 0.45, 0.1]}>
        <sphereGeometry args={[0.65, 12, 12]} />
        <meshBasicMaterial color="#fff8f0" toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.2, 0.3]}>
        <sphereGeometry args={[0.85, 12, 12]} />
        <meshBasicMaterial color="#f8f4ff" toneMapped={false} />
      </mesh>
    </group>
  )
}

function Sun({ position }) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[2, 16, 16]} />
        <meshBasicMaterial color="#fffbe6" toneMapped={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[4.5, 16, 16]} />
        <meshBasicMaterial color="#ffe880" transparent opacity={0.22} toneMapped={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[9, 16, 16]} />
        <meshBasicMaterial color="#ffd060" transparent opacity={0.08} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Mountains() {
  const geo = useMemo(() => {
    const segments = 120
    const radius = 160
    const positions = []
    const colors = []
    const col = new THREE.Color('#6a5a88')

    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2
      const a1 = ((i + 1) / segments) * Math.PI * 2
      const x0 = Math.cos(a0) * radius
      const z0 = Math.sin(a0) * radius
      const x1 = Math.cos(a1) * radius
      const z1 = Math.sin(a1) * radius
      const h = 1.5
        + Math.sin(i * 0.4) * 1.2
        + Math.sin(i * 0.9 + 1.0) * 0.8
        + Math.cos(i * 0.15) * 1.5

      positions.push(x0, -1, z0, x1, -1, z1, (x0 + x1) / 2, h, (z0 + z1) / 2)

      const shade = 0.85 + Math.sin(i * 0.3) * 0.15
      for (let j = 0; j < 3; j++) {
        colors.push(col.r * shade, col.g * shade, col.b * shade)
      }
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    return g
  }, [])

  return (
    <mesh geometry={geo}>
      <meshBasicMaterial vertexColors side={THREE.DoubleSide} />
    </mesh>
  )
}

export default function Sky() {
  const { scene } = useThree()
  const cloudsRef = useRef()

  useMemo(() => {
    const tex = makeGradientTexture()
    scene.background = tex
    return () => tex.dispose()
  }, [scene])

  useFrame((_, delta) => {
    if (cloudsRef.current) {
      cloudsRef.current.children.forEach((cloud) => {
        cloud.position.x += delta * 0.15
        if (cloud.position.x > 60) cloud.position.x = -60
      })
    }
  })

  return (
    <>
      <Sun position={[-12, 5, -20]} />
      <Mountains />
      <group ref={cloudsRef}>
        <CartoonCloud position={[-8, 5, -25]} scale={1.5} />
        <CartoonCloud position={[5, 6, -35]} scale={1.8} />
        <CartoonCloud position={[-20, 4.5, -20]} scale={1.2} />
        <CartoonCloud position={[14, 5.5, -42]} scale={1.7} />
        <CartoonCloud position={[-28, 6, -30]} scale={1.4} />
        <CartoonCloud position={[8, 7, -50]} scale={2.0} />
        <CartoonCloud position={[-14, 5.5, -40]} scale={1.6} />
        <CartoonCloud position={[20, 4, -28]} scale={1.3} />
      </group>
    </>
  )
}
