export function createSfxPlayer(sources, { session } = {}) {
  let disposed = false
  const rawBuffers = new Map()
  const decodedBuffers = new Map()

  const getContext = () => {
    const context = session?.context
    if (!context) {
      throw new Error('Audio session is unavailable.')
    }
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
    const ctx = getContext()
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
      try { await session?.resumeFromLifecycle() } catch { /* ignore */ }
    },
    play(name, gain = 1) {
      if (disposed) return
      const playBuffer = (buffer) => {
        if (disposed || !buffer) return
        const context = session?.context
        if (!context || !session?.masterGain) return
        if (context.state === 'suspended') {
          void context.resume().catch(() => { })
        }
        const source = context.createBufferSource()
        source.buffer = buffer
        const localGain = context.createGain()
        localGain.gain.value = Math.max(0, Math.min(1, gain))
        source.connect(localGain)
        localGain.connect(session.masterGain)
        source.start()
        source.onended = () => {
          try { source.disconnect() } catch { /* ignore */ }
          try { localGain.disconnect() } catch { /* ignore */ }
        }
      }
      const buffer = decodedBuffers.get(name)
      if (buffer) {
        playBuffer(buffer)
        return
      }
      void decode(name).then(playBuffer).catch(() => { })
    },
    dispose() {
      disposed = true
      rawBuffers.clear()
      decodedBuffers.clear()
    },
  }
}
