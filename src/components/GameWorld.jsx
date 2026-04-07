import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import Ground from './Ground'
import SkateCat from './SkateCat'
import SpeedLines from './SpeedLines'
import Obstacles from './Obstacles'
import KickflipSparks from './KickflipSparks'
import DustTrail from './DustTrail'
import AmbientParticles from './AmbientParticles'
import Background from './Background'
import Sky from './Sky'
import DayNightController from './DayNightController'

export function GameWorldWarmup({ active, onComplete }) {
  const warmedFrames = useRef(0)
  const completed = useRef(false)

  useFrame(() => {
    if (!active || completed.current) return

    warmedFrames.current += 1
    if (warmedFrames.current >= 2) {
      completed.current = true
      onComplete()
    }
  })

  return null
}

export default function GameWorld({
  visible,
  sceneActive,
  runActive,
  isGameOver,
  isCountdownActive,
  isTransitioning,
  useOriginalMaterials,
  freezeMotion = false,
  foliageSegmentCount = 2,
  quality = 'auto',
  trailTargetRef,
  musicRef,
  onJumpSfx,
  onLogHit,
}) {
  return (
    <>
      <color attach="background" args={['#000000']} />
      <group visible={visible}>
        <DayNightController isRunning={sceneActive && !isGameOver} quality={quality} />
        <Ground active={sceneActive} foliageSegmentCount={foliageSegmentCount} quality={quality} />
        <Background active={sceneActive} />
        <Sky active={sceneActive} />
        <group visible={visible}>
          <SkateCat
            trailTargetRef={trailTargetRef}
            controlsEnabled={runActive && !isGameOver && !isCountdownActive}
            isTransitioning={isTransitioning}
            useOriginalMaterials={useOriginalMaterials}
            freezeMotion={freezeMotion}
            musicRef={musicRef}
            onJumpSfx={onJumpSfx}
          />
        </group>
        <Obstacles
          musicRef={musicRef}
          active={runActive}
          isRunning={runActive && !isGameOver}
          canCollide={runActive && !isCountdownActive}
          onLogHit={onLogHit}
        />
        <SpeedLines active={sceneActive} />
        <KickflipSparks active={sceneActive} />
        <DustTrail active={sceneActive} />
        <AmbientParticles active={sceneActive} />
      </group>
    </>
  )
}
