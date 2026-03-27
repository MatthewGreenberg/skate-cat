import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { gameState, getNightFactor } from '../store'

// Build a single merged "puff" geometry from several low-poly icosahedrons
function buildCloudGeometry() {
  const puffs = [
    { pos: [0, 0, 0], scale: 1.0 },
    { pos: [1.1, 0.2, 0.3], scale: 0.85 },
    { pos: [-1.0, 0.15, -0.2], scale: 0.75 },
    { pos: [0.5, 0.4, -0.4], scale: 0.65 },
    { pos: [-0.5, -0.1, 0.5], scale: 0.7 },
  ]

  const tempGeo = new THREE.IcosahedronGeometry(1, 1).toNonIndexed()

  const geos = puffs.map((puff) => {
    const g = tempGeo.clone()
    const m = new THREE.Matrix4()
    m.compose(
      new THREE.Vector3(...puff.pos),
      new THREE.Quaternion(),
      new THREE.Vector3(puff.scale, puff.scale * 0.7, puff.scale)
    )
    g.applyMatrix4(m)
    return g
  })

  const merged = mergeGeometries(geos)
  merged.computeBoundingSphere()

  tempGeo.dispose()
  geos.forEach((g) => g.dispose())

  return merged
}

function seededRandom(seed) {
  const value = Math.sin(seed * 127.1) * 43758.5453123
  return value - Math.floor(value)
}

const CLOUD_COUNT = 18
const SPREAD_X = 54
const SPREAD_Z = 180
const MIN_Y = 8
const MAX_Y = 18
const MIN_SIDE_DIST = 12
const RECYCLE_BEHIND = 60

function randomCloudPos(camZ = 0) {
  const side = Math.random() < 0.5 ? -1 : 1
  return {
    x: side * (MIN_SIDE_DIST + Math.random() * (SPREAD_X / 2)),
    y: MIN_Y + Math.random() * (MAX_Y - MIN_Y),
    z: camZ - 20 - Math.random() * SPREAD_Z, // always ahead of camera (in -z)
  }
}

export default function Sky({ active = true }) {
  const meshRef = useRef()
  const initialized = useRef(false)
  const { camera } = useThree()

  const { geometry, material, cloudScales } = useMemo(() => {
    const geo = buildCloudGeometry()
    const mat = new THREE.MeshLambertMaterial({
      color: '#fffaf4',
      emissive: '#dbe6ff',
      emissiveIntensity: 0.16,
      transparent: true,
      opacity: 0.32,
      flatShading: true,
      depthWrite: false,
    })

    const scales = []
    for (let i = 0; i < CLOUD_COUNT; i++) {
      scales.push(3.4 + seededRandom(i + 1) * 4.2)
    }

    return { geometry: geo, material: mat, cloudScales: scales }
  }, [])

  const cloudColorDay = useMemo(() => new THREE.Color('#fffaf4'), [])
  const cloudColorNight = useMemo(() => new THREE.Color('#334466'), [])
  const cloudEmissiveDay = useMemo(() => new THREE.Color('#dbe6ff'), [])
  const cloudEmissiveNight = useMemo(() => new THREE.Color('#112244'), [])

  const dummyRef = useRef(new THREE.Object3D())
  const tempMatrixRef = useRef(new THREE.Matrix4())
  const tempPosRef = useRef(new THREE.Vector3())
  const tempScaleRef = useRef(new THREE.Vector3())
  const tempQuatRef = useRef(new THREE.Quaternion())

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh) return

    const dummy = dummyRef.current
    const tempMatrix = tempMatrixRef.current
    const tempPos = tempPosRef.current
    const tempScale = tempScaleRef.current
    const tempQuat = tempQuatRef.current
    const cloudMaterial = mesh.material

    // One-time initialization (ref is now attached)
    if (!initialized.current) {
      initialized.current = true
      for (let i = 0; i < CLOUD_COUNT; i++) {
        const p = randomCloudPos(camera.position.z)
        const s = cloudScales[i]
        dummy.position.set(p.x, p.y, p.z)
        dummy.scale.set(s, s * 0.55, s * 0.85)
        dummy.rotation.set(0, Math.random() * Math.PI * 2, 0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
      return
    }

    const speed = active && !gameState.gameOver ? gameState.speed.current || 0 : 0
    const drift = (0.3 + speed * 0.1) * delta

    const nightFactor = getNightFactor(gameState.timeOfDay.current)

    // Lerp cloud color/emissive for day/night
    cloudMaterial.color.copy(cloudColorDay).lerp(cloudColorNight, nightFactor)
    cloudMaterial.emissive.copy(cloudEmissiveDay).lerp(cloudEmissiveNight, nightFactor)

    const nightOpacityTarget = 0.6 * (1 - nightFactor * 0.75)
    cloudMaterial.opacity = THREE.MathUtils.lerp(cloudMaterial.opacity, nightOpacityTarget, delta * 2)
    const nightEmissiveTarget = 0.3 * (1 - nightFactor * 0.85)
    cloudMaterial.emissiveIntensity = THREE.MathUtils.lerp(cloudMaterial.emissiveIntensity, nightEmissiveTarget, delta * 2)

    for (let i = 0; i < CLOUD_COUNT; i++) {
      mesh.getMatrixAt(i, tempMatrix)
      tempMatrix.decompose(tempPos, tempQuat, tempScale)

      tempPos.set(tempPos.x, tempPos.y, tempPos.z + drift)

      if (tempPos.z > camera.position.z + RECYCLE_BEHIND) {
        const p = randomCloudPos(camera.position.z)
        tempPos.set(p.x, p.y, p.z)
      }

      dummy.position.copy(tempPos)
      dummy.quaternion.copy(tempQuat)
      dummy.scale.copy(tempScale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, CLOUD_COUNT]}
      frustumCulled={false}
    />
  )
}
