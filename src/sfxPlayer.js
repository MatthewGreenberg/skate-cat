export function createSfxPlayer(sources) {
  let context = null
  let masterGain = null
  let disposed = false
  const rawBuffers = new Map()
  const decodedBuffers = new Map()

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

  const fetchRaw = async (name) => {
    if (rawBuffers.has(name)) return rawBuffers.get(name)
    const url = sources[name]
    if (!url) throw new Error(`Unknown SFX "${name}"`)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to load SFX ${url}: ${response.status}`)
    const arrayBuffer = await response.arrayBuffer()
    rawBuffers.set(name, arrayBuffer)
    return arrayBuffer
  }

  const decode = async (name) => {
    if (decodedBuffers.has(name)) return decodedBuffers.get(name)
    const ctx = ensureContext()
    const raw = await fetchRaw(name)
    const decoded = await ctx.decodeAudioData(raw.slice(0))
    decodedBuffers.set(name, decoded)
    return decoded
  }

  return {
    async preload() {
      if (disposed) return
      await Promise.all(Object.keys(sources).map((name) => fetchRaw(name).catch(() => null)))
    },
    async prepare() {
      if (disposed) return
      ensureContext()
      if (context.state === 'suspended') {
        try { await context.resume() } catch { /* ignore */ }
      }
      await Promise.all(Object.keys(sources).map((name) => decode(name).catch(() => null)))
    },
    play(name, gain = 1) {
      if (disposed) return
      const buffer = decodedBuffers.get(name)
      if (!buffer) {
        void decode(name).catch(() => { })
        return
      }
      if (!context) return
      if (context.state === 'suspended') {
        void context.resume().catch(() => { })
      }
      const source = context.createBufferSource()
      source.buffer = buffer
      const localGain = context.createGain()
      localGain.gain.value = Math.max(0, Math.min(1, gain))
      source.connect(localGain)
      localGain.connect(masterGain)
      source.start()
      source.onended = () => {
        try { source.disconnect() } catch { /* ignore */ }
        try { localGain.disconnect() } catch { /* ignore */ }
      }
    },
    dispose() {
      disposed = true
      rawBuffers.clear()
      decodedBuffers.clear()
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
