import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import * as THREE from 'three'

const MAX_BLADES = 8000
const SEGMENT_LENGTH = 20
const SEGMENT_WIDTH = 12
const ROAD_HALF = 1.5 // slight encroachment onto road edges

function createBladeGeometry() {
  const geo = new THREE.BufferGeometry()
  // Wider blade shape — quad-like with tapered tip
  const vertices = new Float32Array([
    -0.5, 0,   0,
     0.5, 0,   0,
     0.3, 0.5, 0,
    -0.3, 0.5, 0,
     0,   1,   0,
  ])
  const uvs = new Float32Array([
    0, 0,
    1, 0,
    0.8, 0.5,
    0.2, 0.5,
    0.5, 1,
  ])
  const indices = [0, 1, 2, 0, 2, 3, 3, 2, 4]
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  return geo
}

const grassVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uWindSpeed;
  uniform float uWindStrength;
  uniform float uThickness;
  uniform int uVisibleCount;
  varying vec2 vUv;
  flat varying int vInstanceId;
  void main() {
    vUv = uv;
    vInstanceId = gl_InstanceID;
    vec3 pos = position;
    // Scale X by thickness
    pos.x *= uThickness;
    float sway = sin(uTime * uWindSpeed + instanceMatrix[3][0] * 0.5 + instanceMatrix[3][2] * 0.3) * uWindStrength * uv.y;
    pos.x += sway;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const grassFragmentShader = /* glsl */ `
  uniform vec3 uColorBase;
  uniform vec3 uColorTip;
  uniform vec3 uColorDry;
  uniform int uVisibleCount;
  varying vec2 vUv;
  flat varying int vInstanceId;
  void main() {
    if (vInstanceId >= uVisibleCount) discard;
    // Mix some dry/yellow blades based on instance ID
    float dryMix = fract(sin(float(vInstanceId) * 43758.5453) * 2.0);
    dryMix = smoothstep(0.6, 1.0, dryMix); // ~40% of blades get some dry color
    vec3 baseColor = mix(uColorBase, uColorDry, dryMix * 0.7);
    vec3 tipColor = mix(uColorTip, uColorDry, dryMix * 0.4);
    vec3 color = mix(baseColor, tipColor, vUv.y);
    gl_FragColor = vec4(color, 1.0);
  }
`

export default function Grass() {
  const meshRef = useRef()

  const { colorBase, colorTip, colorDry, windSpeed, windStrength, bladeMinHeight, bladeMaxHeight, bladeCount, thickness } = useControls('Grass', {
    colorBase: '#3D8B37',
    colorTip: '#7EC850',
    colorDry: '#C4B454',
    bladeCount: { value: 6000, min: 100, max: MAX_BLADES, step: 100 },
    thickness: { value: 0.08, min: 0.005, max: 0.2, step: 0.005 },
    windSpeed: { value: 2.0, min: 0, max: 10, step: 0.1 },
    windStrength: { value: 0.12, min: 0, max: 0.5, step: 0.01 },
    bladeMinHeight: { value: 0.3, min: 0.01, max: 1.0, step: 0.01 },
    bladeMaxHeight: { value: 0.8, min: 0.1, max: 2.0, step: 0.01 },
  })

  const uniformsRef = useRef({
    uTime: { value: 0 },
    uWindSpeed: { value: 2.0 },
    uWindStrength: { value: 0.12 },
    uThickness: { value: 0.08 },
    uVisibleCount: { value: 6000 },
    uColorBase: { value: new THREE.Color('#3D8B37') },
    uColorTip: { value: new THREE.Color('#7EC850') },
    uColorDry: { value: new THREE.Color('#C4B454') },
  })

  const geometry = useMemo(() => createBladeGeometry(), [])

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: uniformsRef.current,
      vertexShader: grassVertexShader,
      fragmentShader: grassFragmentShader,
      side: THREE.DoubleSide,
    })
  }, [])

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const seedData = useMemo(() => {
    // Store random seeds so height can be remapped
    const data = []
    for (let i = 0; i < MAX_BLADES; i++) {
      let x
      if (Math.random() < 0.5) {
        x = -ROAD_HALF - Math.random() * (SEGMENT_WIDTH / 2 - ROAD_HALF)
      } else {
        x = ROAD_HALF + Math.random() * (SEGMENT_WIDTH / 2 - ROAD_HALF)
      }
      data.push({
        x,
        z: (Math.random() - 0.5) * SEGMENT_LENGTH,
        heightRand: Math.random(),
        rotY: Math.random() * Math.PI,
      })
    }
    return data
  }, [])

  useFrame((_, delta) => {
    const u = uniformsRef.current
    u.uTime.value += delta
    u.uWindSpeed.value = windSpeed
    u.uWindStrength.value = windStrength
    u.uThickness.value = thickness
    u.uVisibleCount.value = bladeCount
    u.uColorBase.value.set(colorBase)
    u.uColorTip.value.set(colorTip)
    u.uColorDry.value.set(colorDry)

    if (meshRef.current) {
      for (let i = 0; i < MAX_BLADES; i++) {
        const s = seedData[i]
        const h = bladeMinHeight + s.heightRand * (bladeMaxHeight - bladeMinHeight)
        dummy.position.set(s.x, 0, s.z)
        dummy.rotation.set(0, s.rotY, 0)
        dummy.scale.set(1, h, 1)
        dummy.updateMatrix()
        meshRef.current.setMatrixAt(i, dummy.matrix)
      }
      meshRef.current.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <instancedMesh
      ref={(el) => {
        meshRef.current = el
        if (el) {
          for (let i = 0; i < MAX_BLADES; i++) {
            const s = seedData[i]
            dummy.position.set(s.x, 0, s.z)
            dummy.rotation.set(0, s.rotY, 0)
            dummy.scale.set(1, 0.1 + s.heightRand * 0.2, 1)
            dummy.updateMatrix()
            el.setMatrixAt(i, dummy.matrix)
          }
          el.instanceMatrix.needsUpdate = true
        }
      }}
      args={[geometry, material, MAX_BLADES]}
      frustumCulled={false}
    />
  )
}
