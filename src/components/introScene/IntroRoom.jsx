/**
 * Procedural room shell: wood floor layers, rug, contact shadows, back/side walls, ceiling, floor lamp, wall art.
 */

import * as THREE from 'three'
import { RUG_COLOR } from './constants'

export function IntroRoom({
  floorY,
  woodDiffuse,
  woodNormal,
  wallTexture,
  screenWorld,
  tvPanelCenterY,
  backWallZ,
}) {
  return (
    <>
      {/* Wood floor: large plane + slightly smaller inset (layered boards) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.5, floorY - 0.01, -1.0]} receiveShadow>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial
          map={woodDiffuse}
          normalMap={woodNormal}
          roughness={0.8}
          metalness={0.0}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.5, floorY - 0.004, -1.0]} receiveShadow>
        <planeGeometry args={[10.6, 10.6]} />
        <meshStandardMaterial
          map={woodDiffuse}
          normalMap={woodNormal}
          roughness={0.8}
          metalness={0.0}
        />
      </mesh>

      {/* Area rug: circular flat color plane on top of wood, centered toward the room */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.5, floorY + 0.008, -0.8]} receiveShadow>
        <circleGeometry args={[2.0, 32]} />
        <meshStandardMaterial
          color={RUG_COLOR}
          roughness={0.95}
          metalness={0.0}
          normalScale={new THREE.Vector2(0.3, 0.3)}
        />
      </mesh>
      {/* Rug border for depth */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.5, floorY + 0.006, -0.8]} receiveShadow>
        <ringGeometry args={[1.95, 2.05, 32]} />
        <meshStandardMaterial
          color={new THREE.Color(RUG_COLOR).multiplyScalar(0.7)}
          roughness={0.98}
          metalness={0.0}
        />
      </mesh>


      {/* Back wall: main surface, chair rail, crown, panels flanking the TV wall */}
      <group position={[0.5, floorY + 2.15, backWallZ]}>
        <mesh position={[0, 0, -0.12]} receiveShadow>
          <boxGeometry args={[11.2, 4.7, 0.24]} />
          <meshStandardMaterial color="#0d0a0f" roughness={0.97} />
        </mesh>
        <mesh position={[0, 0, 0.01]} receiveShadow>
          <planeGeometry args={[10.95, 4.5]} />
          <meshStandardMaterial color="#18131c" roughness={0.92} emissive="#1a1020" emissiveIntensity={0.05} map={wallTexture} />
        </mesh>
        <mesh position={[0, -1.45, 0.025]} receiveShadow>
          <planeGeometry args={[10.95, 1.2]} />
          <meshStandardMaterial color="#120d13" roughness={0.95} />
        </mesh>
        <mesh position={[0, -0.82, 0.05]} receiveShadow>
          <boxGeometry args={[11.0, 0.08, 0.08]} />
          <meshStandardMaterial color="#281922" roughness={0.78} />
        </mesh>
        <mesh position={[0, 2.16, 0.055]} receiveShadow>
          <boxGeometry args={[11.0, 0.1, 0.08]} />
          <meshStandardMaterial color="#1a1018" roughness={0.82} />
        </mesh>
        <mesh position={[0, -2.09, 0.06]} receiveShadow>
          <boxGeometry args={[11.05, 0.16, 0.09]} />
          <meshStandardMaterial color="#24161f" roughness={0.72} />
        </mesh>
        <mesh position={[-3.25, 0.08, 0.04]} receiveShadow>
          <boxGeometry args={[0.09, 4.18, 0.07]} />
          <meshStandardMaterial color="#21141d" roughness={0.82} />
        </mesh>
        <mesh position={[3.25, 0.08, 0.04]} receiveShadow>
          <boxGeometry args={[0.09, 4.18, 0.07]} />
          <meshStandardMaterial color="#21141d" roughness={0.82} />
        </mesh>
        {[-4.18, 4.18].map((x) => (
          <group key={x} position={[x, 0.18, 0.035]}>
            <mesh receiveShadow>
              <planeGeometry args={[1.85, 2.45]} />
              <meshStandardMaterial color="#241923" roughness={0.87} emissive="#1e1320" emissiveIntensity={0.05} map={wallTexture} />
            </mesh>
            <mesh position={[0, 0, 0.012]} receiveShadow>
              <boxGeometry args={[2.02, 2.62, 0.04]} />
              <meshStandardMaterial color="#2b1822" roughness={0.76} />
            </mesh>
          </group>
        ))}
      </group>

      {/* TV wall niche: flat panel + trim frame around where the CRT sits */}
      <mesh position={[screenWorld.x, tvPanelCenterY, backWallZ + 0.04]} receiveShadow>
        <planeGeometry args={[4.0, 2.85]} />
        <meshStandardMaterial color="#221722" roughness={0.84} emissive="#341f2a" emissiveIntensity={0.08} />
      </mesh>
      <mesh position={[screenWorld.x, tvPanelCenterY + 1.46, backWallZ + 0.065]} receiveShadow>
        <boxGeometry args={[4.22, 0.08, 0.08]} />
        <meshStandardMaterial color="#2a1823" roughness={0.76} />
      </mesh>
      <mesh position={[screenWorld.x, tvPanelCenterY - 1.46, backWallZ + 0.065]} receiveShadow>
        <boxGeometry args={[4.22, 0.08, 0.08]} />
        <meshStandardMaterial color="#2a1823" roughness={0.76} />
      </mesh>
      <mesh position={[screenWorld.x - 2.07, tvPanelCenterY, backWallZ + 0.065]} receiveShadow>
        <boxGeometry args={[0.08, 2.92, 0.08]} />
        <meshStandardMaterial color="#2a1823" roughness={0.76} />
      </mesh>
      <mesh position={[screenWorld.x + 2.07, tvPanelCenterY, backWallZ + 0.065]} receiveShadow>
        <boxGeometry args={[0.08, 2.92, 0.08]} />
        <meshStandardMaterial color="#2a1823" roughness={0.76} />
      </mesh>

    </>
  )
}
