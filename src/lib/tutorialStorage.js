const KEY = 'skate-cat:tutorial-completed-v1'

export function hasCompletedTutorial() {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    // Private mode / blocked storage: treat as completed so we never trap users.
    return true
  }
}

export function markTutorialCompleted() {
  try {
    window.localStorage.setItem(KEY, '1')
  } catch {
    // Ignore — tutorial will re-appear next session, acceptable.
  }
}

export function clearTutorialCompletion() {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // Ignore.
  }
}
