import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useControls } from 'leva'
import { gameState, isDebug } from '../store'
import { BEAT_INTERVAL, OBSTACLE_BEAT_DIVISOR, OBSTACLE_PHASE } from '../rhythm'

const POOL_SIZE = 16
const LOOKAHEAD_BEATS = 4
const DESPAWN_BEHIND_SECONDS = 0.6
const POSITION_SMOOTHING = 0.35
const SPEED_BOOST_SCORE_THRESHOLD = 5
const SPEED_LINES_SCORE_THRESHOLD = 8

export default function Obstacles({ musicRef, isRunning, canCollide = true, onLogHit }) {
  const log = useGLTF('/large_tree_log.glb')
  const refs = useRef([])
  const active = useRef(
    Array.from({ length: POOL_SIZE }, () => ({ z: 0, visible: false, scaleY: 1, rotY: 0, beatIndex: 0 }))
  )
  const beatCursor = useRef(0)

  const { logScale } = useControls('Obstacles', {
    logScale: { value: 0.8, min: 0.1, max: 3, step: 0.1 },
  })

  const wasGameOver = useRef(false)
  const graceTimer = useRef(3.0) // invincibility grace period at start

  const spawnObstacleForBeat = (beatIndex) => {
    const slot = active.current.find(o => !o.visible)
    if (!slot) return

    // Start far ahead; beat-sync positioning is applied later in the frame.
    slot.z = -100
    slot.visible = true
    slot.scored = false
    slot.beatIndex = beatIndex
    slot.rotY = Math.PI / 2
    slot.scaleY = 0.7 + Math.random() * 0.6
    slot.x = (Math.random() - 0.5) * 2
  }

  useFrame((_, delta) => {
    // Reset obstacles when game restarts
    if (wasGameOver.current && !gameState.gameOver) {
      for (let i = 0; i < POOL_SIZE; i++) {
        active.current[i].visible = false
        active.current[i].scored = false
        active.current[i].beatIndex = 0
        if (refs.current[i]) refs.current[i].visible = false
      }
      const musicTime = musicRef?.current?.currentTime || 0
      beatCursor.current = Math.max(0, Math.floor(musicTime / BEAT_INTERVAL))
      graceTimer.current = 3.0
      wasGameOver.current = false
      return
    }
    if (gameState.gameOver) {
      wasGameOver.current = true
      return
    }
    if (!isRunning) return

    const speed = gameState.speed.current
    if (graceTimer.current > 0) graceTimer.current -= delta
    const music = musicRef?.current
    const isMusicRunning = Boolean(music && !music.paused)
    const musicTime = isMusicRunning ? music.currentTime : 0

    if (isMusicRunning) {
      const currentBeat = Math.floor(musicTime / BEAT_INTERVAL)
      while (beatCursor.current <= currentBeat) {
        const targetBeat = beatCursor.current + LOOKAHEAD_BEATS
        if (targetBeat % OBSTACLE_BEAT_DIVISOR === OBSTACLE_PHASE) {
          spawnObstacleForBeat(targetBeat)
        }
        beatCursor.current += 1
      }
    }

    // Collision detection — cat is at z=0, check if log is near
    if (canCollide && graceTimer.current <= 0) {
      for (let i = 0; i < POOL_SIZE; i++) {
        const ob = active.current[i]
        if (!ob.visible) continue
        // Log is near the cat (z ~ 0) and cat is not jumping
        if (ob.z > -0.8 && ob.z < 0.8 && !ob.scored) {
          if (!gameState.jumping && !isDebug) {
            // HIT — game over
            gameState.gameOver = true
            gameState.speed.current = 0
            gameState.speedLinesOn = false
            gameState.screenShake.current = 0.8
            gameState.streak.current = 0
            if (onLogHit) onLogHit()
            if (gameState.onGameOver) gameState.onGameOver()
            return
          }
          ob.scored = true
          gameState.score++
          if (gameState.score >= SPEED_BOOST_SCORE_THRESHOLD && !gameState.speedBoostActive) {
            gameState.speedBoostActive = true
          }
          if (gameState.score >= SPEED_LINES_SCORE_THRESHOLD && !gameState.speedLinesOn) {
            gameState.speedLinesOn = true
          }
        }
      }
    }

    // Move all active obstacles toward camera
    for (let i = 0; i < POOL_SIZE; i++) {
      const ob = active.current[i]
      if (!ob.visible) continue

      if (isMusicRunning) {
        const hitTime = ob.beatIndex * BEAT_INTERVAL
        const timeUntilHit = hitTime - musicTime
        const targetZ = -timeUntilHit * speed
        const smoothedZ = ob.z + (targetZ - ob.z) * POSITION_SMOOTHING
        // Keep logs moving forward only so speed boosts don't pull them backward.
        ob.z = Math.max(ob.z, smoothedZ)
        if (timeUntilHit < -DESPAWN_BEHIND_SECONDS) {
          ob.visible = false
        }
      }

      if (ob.z > 15) {
        // passed behind camera, deactivate
        ob.visible = false
      }

      if (refs.current[i]) {
        refs.current[i].position.z = ob.z
        refs.current[i].visible = ob.visible
      }
    }

    // Update transforms
    for (let i = 0; i < POOL_SIZE; i++) {
      const ob = active.current[i]
      if (refs.current[i]) {
        refs.current[i].position.set(ob.x || 0, 0, ob.z)
        refs.current[i].rotation.y = ob.rotY || 0
        refs.current[i].visible = ob.visible
      }
    }
  })

  const clonedScenes = useMemo(
    () => Array.from({ length: POOL_SIZE }, () => log.scene.clone()),
    [log.scene]
  )

  return (
    <group>
      {clonedScenes.map((scene, i) => (
        <group
          key={i}
          ref={(el) => (refs.current[i] = el)}
          visible={false}
        >
          <primitive
            object={scene}
            scale={logScale}
            rotation={[0, Math.PI / 2, 0]}
          />
        </group>
      ))}
    </group>
  )
}

useGLTF.preload('/large_tree_log.glb')
