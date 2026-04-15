export function createSharedAudioSession() {
  let context = null
  let masterGain = null
  let disposed = false
  let unlocked = false
  let silentMediaElement = null

  const isIosWebKit = typeof window !== 'undefined'
    && navigator.maxTouchPoints > 0
    && window.webkitAudioContext != null

  const createSilentAudioDataUri = (sampleRate) => {
    // Mirrors the small silent WAV trick used by iOS Web Audio unmute workarounds.
    const arrayBuffer = new ArrayBuffer(10)
    const dataView = new DataView(arrayBuffer)
    dataView.setUint32(0, sampleRate, true)
    dataView.setUint32(4, sampleRate, true)
    dataView.setUint16(8, 1, true)
    const missingCharacters = window.btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
      .slice(0, 13)

    return `data:audio/wav;base64,UklGRisAAABXQVZFZm10IBAAAAABAAEA${missingCharacters}AgAZGF0YQcAAACAgICAgICAAAA=`
  }

  const configurePlaybackAudioSession = () => {
    if (!navigator.audioSession) return false

    try {
      navigator.audioSession.type = 'playback'
      return navigator.audioSession.type === 'playback'
    } catch {
      return false
    }
  }

  const ensureContext = () => {
    if (context) return context
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext
    if (!AudioContextCtor) {
      throw new Error('Web Audio is not supported in this browser.')
    }

    configurePlaybackAudioSession()
    context = new AudioContextCtor({ latencyHint: 'interactive' })
    masterGain = context.createGain()
    masterGain.gain.value = 1
    masterGain.connect(context.destination)
    return context
  }

  const primeSilentMediaElement = async () => {
    if (!isIosWebKit) return false
    if (configurePlaybackAudioSession()) return true

    const audioContext = ensureContext()
    if (!silentMediaElement) {
      const element = document.createElement('audio')
      element.setAttribute('x-webkit-airplay', 'deny')
      element.setAttribute('playsinline', '')
      element.preload = 'auto'
      element.loop = true
      element.src = createSilentAudioDataUri(audioContext.sampleRate)
      element.load()
      silentMediaElement = element
    }

    try {
      await silentMediaElement.play()
      return true
    } catch {
      return false
    }
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
      configurePlaybackAudioSession()
      const resumePromise = audioContext.state === 'suspended'
        ? audioContext.resume()
        : Promise.resolve()

      // WebKit can require an actual source.start() in the user gesture.
      playUnlockPulse()
      await primeSilentMediaElement()
      await resumePromise
      unlocked = true
      return audioContext
    },
    async resumeFromLifecycle() {
      if (disposed || !context) return context
      configurePlaybackAudioSession()
      if (context.state === 'suspended') {
        await context.resume()
      }
      if (silentMediaElement?.paused) {
        try {
          await silentMediaElement.play()
        } catch {
          // A future user gesture will retry if WebKit rejects lifecycle resume.
        }
      }
      return context
    },
    dispose() {
      disposed = true
      unlocked = false
      if (silentMediaElement) {
        try { silentMediaElement.pause() } catch { /* ignore */ }
        silentMediaElement.removeAttribute('src')
        silentMediaElement.load()
        silentMediaElement = null
      }
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
