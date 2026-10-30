import type { StatusTone } from '@talex-touch/tuffex/status-badge'

export type SaveState = 'saving' | 'success' | 'error'

/** One shortcut as the manager lists it: everything the row shows, nothing it has to look up. */
export interface ShortcutRow {
  id: string
  label: string
  /** The stored accelerator; the recorder prints it the way the platform writes keys. */
  accelerator: string
  /** A mouse trigger has no key to record, only a description of the gesture. */
  isTrigger: boolean
  triggerLabel: string
  isEnabled: boolean
  /** The save in flight or just finished, else the registration state. */
  status: { text: string; tone: StatusTone }
  /** What to do about a state the status alone cannot fix (a permission, a system key). */
  hint: string | null
}
