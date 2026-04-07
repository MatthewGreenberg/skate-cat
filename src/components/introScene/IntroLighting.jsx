/**
 * Intro room atmosphere: background color, fog, and the full light rig (TV glow, hero/sweep spots, lamp, fills, rim).
 */

import { folder } from 'leva'
import { useOptionalControls } from '../../lib/debugControls'
import { ROOM_BACKGROUND, SCREEN_CYAN, WALL_EDGE_COOL } from './constants'

export function IntroLighting({
  tvGlowRef,
  accentLightRef,
  heroSpotlightRef,
  sweepSpotlightRef,
  sweepSpotlightTargetRef,
  boardGlowRef,
  shadowTargetRef,
  screenWorld,
  tvForward,
  tvPanelCenterY,
  backWallZ,
  catHeroTarget,
  catPosition,
  floorY,
  boardAnchor,
  lampCtrl,
  motionFxCtrl,
  bootVisualMix = 1,
}) {
  const wallEdgeCoolLight = useOptionalControls('Intro', {
    'Wall edge cool': folder({
      x: { value: 0.04, min: -5, max: 8, step: 0.01 },
      y: { value: 1.19, min: -2, max: 6, step: 0.01 },
      z: { value: 0.43, min: -6, max: 6, step: 0.01 },
      intensity: { value: 3.3, min: 0, max: 24, step: 0.05 },
      distance: { value: 12.0, min: 0, max: 20, step: 0.1 },
      decay: { value: 1.97, min: 0, max: 3, step: 0.01 },
    }),
  })
  const roomPower = 0.14 + bootVisualMix * 0.86
  const ambientPower = 0.25 + bootVisualMix * 0.75

  return (
    <>
      {/* Scene backdrop + depth cue */}
      <color attach="background" args={[ROOM_BACKGROUND]} />

      <ambientLight intensity={75.16 * ambientPower} color="#251922" />
      {/* <hemisphereLight args={['#8e7464', '#08070b', 1.15]} /> */}
      {/* Spotlight targets (updated in IntroScene useFrame) */}
      <object3D ref={shadowTargetRef} position={[catPosition.x, floorY, catPosition.z]} />
      <object3D ref={sweepSpotlightTargetRef} position={screenWorld.toArray()} />

      {/* TV: primary glow + warm bounce under the cabinet */}
      <pointLight
        ref={accentLightRef}
        position={[screenWorld.x + tvForward.x * 0.85, floorY + 0.28, screenWorld.z + tvForward.z * 0.9]}
        intensity={6.4 * roomPower}
        distance={7.8}
        decay={1.85}
        color="#fff"
      />

      {/* Cat hero key + room sweep (intensities/positions animated in parent) */}
      <spotLight
        ref={heroSpotlightRef}
        position={[catHeroTarget.x + 0.95, catHeroTarget.y + motionFxCtrl.heroHeight, catHeroTarget.z + 1.75]}
        intensity={motionFxCtrl.heroSpotIntensity}
        angle={motionFxCtrl.heroSpotAngle}
        penumbra={0.78}
        distance={motionFxCtrl.heroSpotDistance}
        decay={1.65}
        color={motionFxCtrl.heroColor}
        castShadow={false}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.1}
        shadow-camera-far={20}
        shadow-bias={-0.00035}
        shadow-normalBias={0.025}
      />

      {/* Skateboard rim highlight */}
      <pointLight
        ref={boardGlowRef}
        position={[boardAnchor.x, boardAnchor.y + 0.18, boardAnchor.z + 0.02]}
        intensity={motionFxCtrl.boardGlowIntensity * roomPower}
        distance={2.6}
        decay={2}
        color={motionFxCtrl.boardGlowColor}
      />

      {/* TV fill + wall wash + lamp (three point lights) + cool corner accent */}
      <spotLight
        ref={sweepSpotlightRef}
        position={[screenWorld.x + tvForward.x * 0.2, screenWorld.y + 0.15, screenWorld.z + tvForward.z * 0.15]}
        intensity={20 * roomPower}
        angle={0.78}
        penumbra={0.8}
        distance={12}
        decay={1}
        color="#ffd6a0"
        castShadow={false}
      />
      <pointLight
        ref={tvGlowRef}
        position={[screenWorld.x, tvPanelCenterY + 0.7, backWallZ + 0.95]}
        intensity={3.8 * roomPower}
        distance={6.4}
        decay={2}
        color="#ffcf96"
      />
      <pointLight
        position={[lampCtrl.lampPosX - 0.2 * lampCtrl.lampScale, lampCtrl.lampPosY + 2.2 * lampCtrl.lampScale, lampCtrl.lampPosZ + 0.1 * lampCtrl.lampScale]}
        intensity={5.2 * roomPower}
        distance={7.8}
        decay={1.9}
        color="#ffd4a8"
      />

      <pointLight
        position={[-wallEdgeCoolLight.x, wallEdgeCoolLight.y, wallEdgeCoolLight.z]}
        intensity={wallEdgeCoolLight.intensity * roomPower}
        distance={wallEdgeCoolLight.distance}
        decay={wallEdgeCoolLight.decay}
        color={'pink'}
      />

      {/* <pointLight position={[lampCtrl.lampPosX, lampCtrl.lampPosY + 1.66 * lampCtrl.lampScale, lampCtrl.lampPosZ]} intensity={4.6} distance={6.4} decay={1.7} color="#ffd8ac" /> */}
      {/* Fill / rim / key on the cat (static positions) */}
      {/* <spotLight position={[0.7, 2.6, 3.2]} intensity={0.6} color="#ffd9b4" distance={6.4} decay={2} castShadow={false} />

      <pointLight position={[0.2, 1.7, -3.1]} intensity={1.35} distance={4.8} decay={2} color="#7e5f79" />

      <pointLight position={[1.85, 0.72, 0.72]} intensity={2.4} distance={4.1} decay={1.95} color="#ffc996" /> */}
    </>
  )
}
