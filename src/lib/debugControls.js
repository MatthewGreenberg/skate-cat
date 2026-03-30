import { useControls } from 'leva'
import { debugControlsEnabled } from '../store'

const EMPTY_SCHEMA = Object.freeze({})

function getDefaultValue(config) {
  if (config && typeof config === 'object' && !Array.isArray(config)) {
    if (config.type === 'BUTTON') return undefined
    if ('value' in config) return config.value
  }

  return config
}

export function getControlDefaults(schema) {
  return Object.fromEntries(
    Object.entries(schema).map(([key, config]) => [key, getDefaultValue(config)])
  )
}

export function useOptionalControls(folder, schema) {
  const defaults = getControlDefaults(schema)
  const overrides = useControls(folder, debugControlsEnabled ? schema : EMPTY_SCHEMA)

  return debugControlsEnabled ? { ...defaults, ...overrides } : defaults
}
