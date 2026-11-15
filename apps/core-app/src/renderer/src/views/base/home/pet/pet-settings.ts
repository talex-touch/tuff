import { hasWindow } from '@talex-touch/utils/env'
import { ref } from 'vue'
import { PET_STORAGE_KEY } from './pet-eggs'

/** The switch's own key. The pet saves its eggs under PET_STORAGE_KEY and never writes this one. */
export const PET_ENABLED_KEY = `${PET_STORAGE_KEY}:enabled`

/**
 * Every copy of this module hears the change, so a copy the switch did not run in still follows it.
 * Two live copies of one module must not be able to disagree about whether the pet is on.
 */
export const PET_ENABLED_EVENT = 'tuff:pet-enabled'

function readEnabled(): boolean {
  if (!hasWindow()) return true
  try {
    return window.localStorage.getItem(PET_ENABLED_KEY) !== 'false'
  } catch {
    return true
  }
}

export const petEnabled = ref(readEnabled())

function writeEnabled(value: boolean): void {
  try {
    window.localStorage.setItem(PET_ENABLED_KEY, value ? 'true' : 'false')
  } catch {
    // The value still holds in memory and in every copy through the event below.
  }
}

export function setPetEnabled(value: boolean): void {
  if (hasWindow()) writeEnabled(value)
  petEnabled.value = value
  if (hasWindow())
    window.dispatchEvent(new CustomEvent<boolean>(PET_ENABLED_EVENT, { detail: value }))
}

if (hasWindow()) {
  window.addEventListener(PET_ENABLED_EVENT, (event) => {
    petEnabled.value = (event as CustomEvent<boolean>).detail !== false
  })
  window.addEventListener('storage', (event) => {
    if (event.key === PET_ENABLED_KEY) petEnabled.value = readEnabled()
  })
}
