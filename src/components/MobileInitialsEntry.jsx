import { useEffect, useRef } from 'react'

// Invisible input whose only job is to summon the iOS keyboard so the player
// can type into the CRT's rendered initials slots. No visible DOM boxes — the
// TV canvas already draws the letters + SUBMIT button; tapping that button
// fires `confirmInitials` on its own.
const hiddenInputStyle = {
  position: 'fixed',
  left: '50%',
  bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)',
  transform: 'translateX(-50%)',
  width: '1px',
  height: '1px',
  padding: 0,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  color: 'transparent',
  caretColor: 'transparent',
  opacity: 0,
  fontSize: '16px', // prevent iOS auto-zoom on focus
  zIndex: 1400,
  pointerEvents: 'auto',
}

function sanitizeChar(raw) {
  if (!raw) return ''
  const char = raw.slice(-1).toUpperCase()
  return /[A-Z]/.test(char) ? char : ''
}

export default function MobileInitialsEntry({ initials, cursorPos, onChange, onSubmit }) {
  const inputRef = useRef(null)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    // Refocus if focus is lost (e.g. after the player taps the TV's SUBMIT
    // button and the keyboard dismisses briefly). Delayed so iOS accepts it.
    const id = window.setTimeout(() => {
      if (document.activeElement !== el) {
        try { el.focus({ preventScroll: true }) } catch { /* ignore */ }
      }
    }, 0)
    return () => window.clearTimeout(id)
  }, [])

  const commit = (char) => {
    if (!char) return
    const next = [initials[0] || 'A', initials[1] || 'A', initials[2] || 'A']
    const idx = Math.max(0, Math.min(2, cursorPos))
    next[idx] = char
    const nextCursor = Math.min(2, idx + 1)
    onChange(next, nextCursor)
  }

  const backspace = () => {
    const idx = Math.max(0, Math.min(2, cursorPos))
    const next = [initials[0] || 'A', initials[1] || 'A', initials[2] || 'A']
    if (next[idx] && next[idx] !== 'A') {
      next[idx] = 'A'
      onChange(next, idx)
    } else if (idx > 0) {
      next[idx - 1] = 'A'
      onChange(next, idx - 1)
    }
  }

  return (
    <input
      ref={inputRef}
      autoFocus
      type="text"
      inputMode="text"
      enterKeyHint="done"
      autoCapitalize="characters"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      aria-label="Enter initials"
      // `value` stays a single space so backspace on "empty" still fires
      // onBeforeInput with inputType=deleteContentBackward.
      value=" "
      readOnly={false}
      onChange={() => { /* controlled via onBeforeInput */ }}
      onBeforeInput={(e) => {
        const native = e.nativeEvent
        if (!native) return
        if (native.inputType === 'insertText' || native.inputType === 'insertCompositionText') {
          e.preventDefault()
          const char = sanitizeChar(native.data || '')
          if (char) commit(char)
        } else if (native.inputType?.startsWith('delete')) {
          e.preventDefault()
          backspace()
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
          onSubmit()
        } else if (e.key === 'Backspace') {
          e.preventDefault()
          backspace()
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          onChange([...initials], Math.max(0, cursorPos - 1))
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          onChange([...initials], Math.min(2, cursorPos + 1))
        } else if (/^[a-zA-Z]$/.test(e.key)) {
          e.preventDefault()
          commit(e.key.toUpperCase())
        }
      }}
      style={hiddenInputStyle}
    />
  )
}
