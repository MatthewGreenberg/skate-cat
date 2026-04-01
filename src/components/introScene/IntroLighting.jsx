/**
 * Intro room atmosphere: background color, fog, and the full light rig (TV glow, hero/sweep spots, lamp, fills, rim).
 */

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
}) {
  return (
    <>
      {/* Scene backdrop + depth cue */}
      <color attach="background" args={[ROOM_BACKGROUND]} />
      <fog attach="fog" args={[ROOM_BACKGROUND, 4, 13]} />

      <ambientLight intensity={0.16} color="#251922" />
      <hemisphereLight args={['#8e7464', '#08070b', 0.15]} />
      {/* Spotlight targets (updated in IntroScene useFrame) */}
      <object3D ref={shadowTargetRef} position={[catPosition.x, floorY, catPosition.z]} />
      <object3D ref={sweepSpotlightTargetRef} position={screenWorld.toArray()} />

      {/* TV: primary glow + warm bounce under the cabinet */}
      <pointLight
        ref={tvGlowRef}
        position={[screenWorld.x + tvForward.x * 0.5, screenWorld.y, screenWorld.z + tvForward.z * 0.5]}
        intensity={21.5}
        distance={11.5}
        decay={1.7}
        color={SCREEN_CYAN}
      />
      <pointLight
        ref={accentLightRef}
        position={[screenWorld.x + tvForward.x * 0.85, floorY + 0.28, screenWorld.z + tvForward.z * 0.9]}
        intensity={6.4}
        distance={7.8}
        decay={1.85}
        color="#ff9f68"
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
        castShadow={true}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.1}
        shadow-camera-far={20}
        shadow-bias={-0.00035}
        shadow-normalBias={0.025}
      />
      <spotLight
        ref={sweepSpotlightRef}
        position={[screenWorld.x - 2.4, catHeroTarget.y + 1.95, screenWorld.z + 1.85]}
        intensity={motionFxCtrl.sweepSpotIntensity}
        angle={motionFxCtrl.sweepSpotAngle}
        penumbra={0.85}
        distance={motionFxCtrl.sweepSpotDistance}
        decay={1.75}
        color={motionFxCtrl.sweepColor}
        castShadow={false}
      />

      {/* Skateboard rim highlight */}
      <pointLight
        ref={boardGlowRef}
        position={[boardAnchor.x, boardAnchor.y + 0.18, boardAnchor.z + 0.02]}
        intensity={motionFxCtrl.boardGlowIntensity}
        distance={2.6}
        decay={2}
        color={motionFxCtrl.boardGlowColor}
      />

      {/* TV fill + wall wash + lamp (three point lights) + cool corner accent */}
      <spotLight
        position={[screenWorld.x + tvForward.x * 0.2, screenWorld.y + 0.15, screenWorld.z + tvForward.z * 0.15]}
        intensity={20}
        angle={0.78}
        penumbra={0.8}
        distance={12}
        decay={1.7}
        color="#ffd6a0"
        castShadow={false}
      />
      <pointLight
        position={[screenWorld.x, tvPanelCenterY + 0.7, backWallZ + 0.95]}
        intensity={3.8}
        distance={6.4}
        decay={2}
        color="#ffcf96"
      />
      <pointLight
        position={[lampCtrl.lampPosX - 0.2 * lampCtrl.lampScale, lampCtrl.lampPosY + 2.2 * lampCtrl.lampScale, lampCtrl.lampPosZ + 0.1 * lampCtrl.lampScale]}
        intensity={5.2}
        distance={7.8}
        decay={1.9}
        color="#ffd4a8"
      />
      <pointLight
        position={[3.55, 2.45, -2.0]}
        intensity={2.6}
        distance={6.8}
        decay={2}
        color={WALL_EDGE_COOL}
      />
      <pointLight position={[lampCtrl.lampPosX, lampCtrl.lampPosY + 1.66 * lampCtrl.lampScale, lampCtrl.lampPosZ]} intensity={4.6} distance={6.4} decay={1.7} color="#ffd8ac" />

      {/* Fill / rim / key on the cat (static positions) */}
      <spotLight position={[0.7, 2.6, 3.2]} intensity={0.6} color="#ffd9b4" distance={6.4} decay={2} castShadow={false} />

      <pointLight position={[0.2, 1.7, -3.1]} intensity={1.35} distance={4.8} decay={2} color="#7e5f79" />

      <pointLight position={[1.85, 0.72, 0.72]} intensity={2.4} distance={4.1} decay={1.95} color="#ffc996" />
    </>
  )
}
