const START_SCHEDULE_LEAD_SECONDS = 0.02
const MAX_LATENCY_COMPENSATION_SECONDS = 0.08

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function createBufferedMusicTransport(url, { session } = {}) {
  let gainNode = null
  let buffer = null
  let rawArrayBuffer = null
  let fetchPromise = null
  let source = null
  let paused = true
  let playbackRate = 1
  let volume = 1
  let anchorMediaTime = 0
  let anchorPerformanceTime = 0
  let disposed = false
  let onEnded = null

  const getDuration = () => buffer?.duration || Infinity

  const clampMediaTime = (value) => clamp(value, 0, getDuration())

  const getContext = () => {
    const context = session?.context
    if (!context) {
      throw new Error('Audio session is unavailable.')
    }
    return context
  }

  const ensureGainNode = () => {
    if (gainNode) return gainNode
    const context = getContext()
    gainNode = context.createGain()
    gainNode.gain.value = volume
    gainNode.connect(session.masterGain)
    return gainNode
  }

  const getLatencyEstimate = () => {
    const context = session?.context
    if (!context) return 0

    if (typeof context.getOutputTimestamp === 'function') {
      try {
        const timestamp = context.getOutputTimestamp()
        const timestampLatency = context.currentTime - timestamp?.contextTime
        if (Number.isFinite(timestampLatency) && timestampLatency >= 0 && timestampLatency <= 0.5) {
          return clamp(timestampLatency, 0, MAX_LATENCY_COMPENSATION_SECONDS)
        }
      } catch {
        // Fall back to coarse latency estimates below.
      }
    }

    return clamp(Math.max(0, (context.baseLatency || 0) + (context.outputLatency || 0)), 0, MAX_LATENCY_COMPENSATION_SECONDS)
  }

  const getNowSeconds = () => performance.now() / 1000

  const getCurrentMediaTimeFromPerformanceAt = (performanceTime) => {
    if (paused || !source) return clampMediaTime(anchorMediaTime)
    return clampMediaTime(anchorMediaTime + Math.max(0, performanceTime - anchorPerformanceTime) * playbackRate)
  }

  const getCurrentMediaTime = () => {
    if (paused || !source) return clampMediaTime(anchorMediaTime)
    return clampMediaTime(getCurrentMediaTimeFromPerformanceAt(getNowSeconds()))
  }

  const stopSource = () => {
    if (!source) return
    const activeSource = source
    source = null
    activeSource.onended = null
    try {
      activeSource.stop()
    } catch {
      // Source may already be stopped.
    }
    activeSource.disconnect()
  }

  const fetchAudio = () => {
    if (rawArrayBuffer) return Promise.resolve(rawArrayBuffer)
    if (!fetchPromise) {
      fetchPromise = fetch(url)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Failed to load music: ${response.status}`)
          }
          return response.arrayBuffer()
        })
        .then((arrayBuffer) => {
          rawArrayBuffer = arrayBuffer
          return arrayBuffer
        })
    }
    return fetchPromise
  }

  const ensureReady = async () => {
    const audioContext = getContext()
    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }

    if (buffer) return buffer
    const arrayBuffer = await fetchAudio()
    buffer = await audioContext.decodeAudioData(arrayBuffer.slice(0))
    return buffer
  }

  const startSourceAt = async (startMediaTime) => {
    const decodedBuffer = await ensureReady()
    const context = getContext()
    const outputGain = ensureGainNode()
    stopSource()

    const nextSource = context.createBufferSource()
    nextSource.buffer = decodedBuffer
    nextSource.playbackRate.value = playbackRate
    nextSource.connect(outputGain)

    const scheduledStartTime = context.currentTime + START_SCHEDULE_LEAD_SECONDS
    const clampedStartMediaTime = clampMediaTime(startMediaTime)
    const scheduledAudiblePerformanceTime = getNowSeconds() + START_SCHEDULE_LEAD_SECONDS + getLatencyEstimate()

    anchorMediaTime = clampedStartMediaTime
    anchorPerformanceTime = scheduledAudiblePerformanceTime
    paused = false
    source = nextSource

    nextSource.onended = () => {
      if (source !== nextSource) return
      anchorMediaTime = clampMediaTime(getCurrentMediaTime())
      anchorPerformanceTime = getNowSeconds()
      paused = true
      source = null
      if (typeof onEnded === 'function') {
        onEnded()
      }
    }

    nextSource.start(scheduledStartTime, clampedStartMediaTime)
  }

  const transport = {
    async preload() {
      if (disposed) return null
      return fetchAudio()
    },
    prepare() {
      if (disposed) return
      void session?.resumeFromLifecycle().catch(() => { })
    },
    async play() {
      if (disposed) return
      if (!paused) return
      await startSourceAt(anchorMediaTime)
    },
    pause() {
      if (disposed) return
      anchorMediaTime = clampMediaTime(getCurrentMediaTime())
      anchorPerformanceTime = getNowSeconds()
      paused = true
      stopSource()
    },
    dispose() {
      disposed = true
      paused = true
      stopSource()
      fetchPromise = null
      buffer = null
      if (gainNode) {
        gainNode.disconnect()
        gainNode = null
      }
    },
  }

  Object.defineProperties(transport, {
    currentTime: {
      get() {
        return clampMediaTime(getCurrentMediaTime())
      },
      set(value) {
        const nextTime = clampMediaTime(Number.isFinite(value) ? value : 0)
        anchorMediaTime = nextTime
        anchorPerformanceTime = getNowSeconds()
        if (!paused) {
          void startSourceAt(nextTime)
        }
      },
    },
    paused: {
      get() {
        return paused
      },
    },
    playbackRate: {
      get() {
        return playbackRate
      },
      set(value) {
        const nextRate = Math.max(0.01, Number(value) || 1)
        if (nextRate === playbackRate) return
        const currentMediaTime = clampMediaTime(getCurrentMediaTime())
        playbackRate = nextRate
        anchorMediaTime = currentMediaTime
        anchorPerformanceTime = getNowSeconds()
        if (!paused) {
          void startSourceAt(currentMediaTime)
        }
      },
    },
    volume: {
      get() {
        return volume
      },
      set(value) {
        volume = clamp(Number.isFinite(value) ? value : 1, 0, 1)
        if (gainNode) {
          gainNode.gain.value = volume
        }
      },
    },
    duration: {
      get() {
        return getDuration()
      },
    },
    onEnded: {
      get() {
        return onEnded
      },
      set(value) {
        onEnded = typeof value === 'function' ? value : null
      },
    },
  })

  return transport
}
