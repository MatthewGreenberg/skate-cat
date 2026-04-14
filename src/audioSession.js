export function createSharedAudioSession() {
  let context = null
  let masterGain = null
  let disposed = false
  let unlocked = false

  const ensureContext = () => {
    if (context) return context
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext
    if (!AudioContextCtor) {
      throw new Error('Web Audio is not supported in this browser.')
    }

    context = new AudioContextCtor({ latencyHint: 'interactive' })
    masterGain = context.createGain()
    masterGain.gain.value = 1
    masterGain.connect(context.destination)
    return context
  }

  const playUnlockPulse = () => {
    const audioContext = ensureContext()
    const source = audioContext.createBufferSource()
    const buffer = audioContext.createBuffer(1, 1, audioContext.sampleRate)
    source.buffer = buffer
    source.connect(masterGain)
    source.onended = () => {
      try { source.disconnect() } catch { /* ignore */ }
    }
    source.start(0)
  }

  return {
    get context() {
      if (disposed) return null
      return ensureContext()
    },
    get masterGain() {
      if (disposed) return null
      ensureContext()
      return masterGain
    },
    get state() {
      if (!context) return 'idle'
      return context.state
    },
    get unlocked() {
      return unlocked
    },
    async unlockFromGesture() {
      if (disposed) return null
      const audioContext = ensureContext()
      const resumePromise = audioContext.state === 'suspended'
        ? audioContext.resume()
        : Promise.resolve()

      // WebKit can require an actual source.start() in the user gesture.
      playUnlockPulse()
      await resumePromise
      unlocked = true
      return audioContext
    },
    async resumeFromLifecycle() {
      if (disposed || !context) return context
      if (context.state === 'suspended') {
        await context.resume()
      }
      return context
    },
    dispose() {
      disposed = true
      unlocked = false
      if (masterGain) {
        masterGain.disconnect()
        masterGain = null
      }
      if (context) {
        const activeContext = context
        context = null
        activeContext.close().catch(() => { })
      }
    },
  }
}
