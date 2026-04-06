/**
 * Procedural room shell: wood floor layers, rug, contact shadows, back/side walls, ceiling, floor lamp, wall art.
 */

import * as THREE from 'three'
import { RUG_COLOR } from './constants'

/** Vertical night sky gradient for the faux window (shared texture, one canvas). */
const NIGHT_WINDOW_MAP = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, '#060a14')
  g.addColorStop(0.22, '#0c1424')
  g.addColorStop(0.48, '#141a2e')
  g.addColorStop(0.62, '#1a1f32')
  g.addColorStop(0.82, '#0f121c')
  g.addColorStop(1, '#05070c')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 256)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
})()

function getFinite(value, fallback) {
  return Number.isFinite(value) ? value : fallback
}

export function IntroRoom({
  floorY,
  woodDiffuse,
  woodNormal,
  wallTexture,
  posterTexture,
  posterAspect = 0.72,
  posterVisible = true,
  posterPosition = [-2.05, 0.58, 0.065],
  posterRotationZ = -0.03,
  posterScale = 1,
  posterMaxWidth = 1.08,
  posterMaxHeight = 1.48,
  screenWorld,
  tvPanelCenterY,
  backWallZ,
}) {
  const safePosterAspect = Math.max(0.01, getFinite(posterAspect, 0.72))
  const safePosterScale = Math.max(0.01, getFinite(posterScale, 1))
  const safePosterMaxWidthValue = Math.max(0.01, getFinite(posterMaxWidth, 1.08))
  const safePosterMaxHeightValue = Math.max(0.01, getFinite(posterMaxHeight, 1.48))
  const safePosterPosX = getFinite(posterPosition?.[0], -2.05)
  const safePosterPosY = getFinite(posterPosition?.[1], 0.58)
  const safePosterPosZBase = getFinite(posterPosition?.[2], 0.065)
  const safePosterRotationZ = getFinite(posterRotationZ, -0.03)
  const safeWallLocalScreenX = getFinite(screenWorld?.x, 0.5) - 0.5
  const scaledPosterMaxWidth = safePosterMaxWidthValue * safePosterScale
  const scaledPosterMaxHeight = safePosterMaxHeightValue * safePosterScale
  let posterWidth = scaledPosterMaxWidth
  let posterHeight = posterWidth / safePosterAspect
  if (posterHeight > scaledPosterMaxHeight) {
    posterHeight = scaledPosterMaxHeight
    posterWidth = posterHeight * safePosterAspect
  }
  const framePadding = 0.05
  const mountWidth = posterWidth + framePadding * 2
  const mountHeight = posterHeight + framePadding * 2
  const wallHalfWidth = 10.95 * 0.5
  const tvPanelHalfWidth = 4.22 * 0.5
  const posterMargin = 0.16
  const posterHalfWidth = mountWidth * 0.5
  const posterHalfHeight = mountHeight * 0.5
  const tvSafeHalfWidth = tvPanelHalfWidth + posterHalfWidth + posterMargin
  const maxPosterX = Math.max(0, wallHalfWidth - posterHalfWidth - posterMargin)
  const minPosterY = -0.82 + posterHalfHeight
  const maxPosterY = 2.16 - posterHalfHeight - 0.16
  const safePosterCenterY = minPosterY > maxPosterY ? (minPosterY + maxPosterY) * 0.5 : THREE.MathUtils.clamp(safePosterPosY, minPosterY, maxPosterY)
  const preferredPosterSide = safePosterPosX >= safeWallLocalScreenX ? 1 : -1
  const unclampedPosterX = Math.abs(safePosterPosX - safeWallLocalScreenX) < tvSafeHalfWidth
    ? safeWallLocalScreenX + preferredPosterSide * tvSafeHalfWidth
    : safePosterPosX
  const safePosterX = THREE.MathUtils.clamp(unclampedPosterX, -maxPosterX, maxPosterX)
  const safePosterZ = Math.max(safePosterPosZBase, 0.07)
  const safePosterPosition = [safePosterX, safePosterCenterY, safePosterZ]
  const matteWidth = posterWidth + 0.05
  const matteHeight = posterHeight + 0.05
  const canRenderPoster = posterVisible && posterWidth > 0 && posterHeight > 0 && mountWidth > 0 && mountHeight > 0 && matteWidth > 0 && matteHeight > 0

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
        <mesh position={[0, 0, 0.01]}>
          <planeGeometry args={[10.95, 4.5]} />
          <meshStandardMaterial color="#18131c" roughness={0.92} emissive="#1a1020" emissiveIntensity={0.05} map={wallTexture} />
        </mesh>
        <mesh position={[0, 2.16, 0.055]} receiveShadow>
          <boxGeometry args={[11.0, 0.1, 0.08]} />
          <meshStandardMaterial color="#1a1018" roughness={0.82} />
        </mesh>
        <mesh position={[0, -2.09, 0.06]}>
          <boxGeometry args={[11.05, 0.16, 0.09]} />
          <meshStandardMaterial color="#24161f" roughness={0.72} />
        </mesh>
        {canRenderPoster && (
          <group position={safePosterPosition} rotation={[0, 0, safePosterRotationZ]}>
            <mesh position={[0, 0, 0.002]}>
              <planeGeometry args={[posterWidth, posterHeight]} />
              <meshStandardMaterial
                key={posterTexture?.uuid ?? 'poster-placeholder'}
                color={posterTexture ? '#ffffff' : '#d9c6a3'}
                map={posterTexture ?? null}
                roughness={0.9}
                metalness={0}
                envMapIntensity={0.12}
              />
            </mesh>
            <mesh position={[0.02, 0.03, 0.006]}>
              <planeGeometry args={[posterWidth * 0.96, posterHeight * 0.18]} />
              <meshBasicMaterial
                color="#fff8ea"
                transparent
                opacity={0.06}
                depthWrite={false}
              />
            </mesh>
          </group>
        )}
      </group>

      {/* TV wall niche: flat panel + trim frame around where the CRT sits */}
      <group scale={[0.9, 0.9, 1.0]} >
        {/* Night sky gradient — in front of back wall (~backWallZ+0.01) so it is not occluded */}
        <mesh position={[screenWorld.x, tvPanelCenterY, backWallZ + 0.022]}>
          <planeGeometry args={[4.0, 2.85]} />
          <meshBasicMaterial map={NIGHT_WINDOW_MAP} />
        </mesh>
        {/* Window glass */}
        <mesh scale={1} position={[screenWorld.x, tvPanelCenterY, backWallZ + 0.04]}>
          <planeGeometry args={[4.0, 2.85]} />
          <meshBasicMaterial
            color="#1a2030"
            transparent
            opacity={0.14}
            depthWrite={false}
          />
        </mesh>
        {/* Window frame */}
        <mesh scale={1} position={[screenWorld.x, tvPanelCenterY + 1.46, backWallZ + 0.065]} receiveShadow>
          <boxGeometry args={[4.22, 0.08, 0.08]} />
          <meshStandardMaterial color="#2a1823" roughness={0.76} />
        </mesh>
        <mesh scale={1} position={[screenWorld.x, tvPanelCenterY - 1.46, backWallZ + 0.065]} receiveShadow>
          <boxGeometry args={[4.22, 0.08, 0.08]} />
          <meshStandardMaterial color="#2a1823" roughness={0.76} />
        </mesh>
        <mesh scale={1} position={[screenWorld.x - 2.07, tvPanelCenterY, backWallZ + 0.065]} receiveShadow>
          <boxGeometry args={[0.08, 2.92, 0.08]} />
          <meshStandardMaterial color="#2a1823" roughness={0.76} />
        </mesh>
        <mesh scale={1} position={[screenWorld.x + 2.07, tvPanelCenterY, backWallZ + 0.065]} receiveShadow>
          <boxGeometry args={[0.08, 2.92, 0.08]} />
          <meshStandardMaterial color="#2a1823" roughness={0.76} />
        </mesh>
      </group>
    </>
  )
}
