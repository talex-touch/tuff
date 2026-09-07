/**
 * ⌘1…⌘9 (Ctrl+1…Ctrl+9 on Windows and Linux) pick the first nine visible rows of the home model
 * menu. Pure: the component reads the platform once and passes it in, so both keyboards can be
 * tested from one machine.
 */

/** How many rows carry a hotkey badge: one digit per key, and `0` is not a row. */
export const MODEL_MENU_HOTKEY_COUNT = 9

/** The slice of a `KeyboardEvent` the hotkey reads, so tests can pass a plain object. */
export interface ModelMenuHotkeyEvent {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

/**
 * Zero-based row index the keystroke selects, or `null` when it is not a hotkey. Only the
 * platform's own modifier counts: ⌘ on macOS, Ctrl elsewhere. Alt or Shift on top of it is a
 * different chord (and Alt rewrites `key` on a Mac keyboard), so it is left to whoever owns it.
 */
export function modelMenuHotkeyIndex(event: ModelMenuHotkeyEvent, isMac: boolean): number | null {
  const modifier = isMac ? event.metaKey : event.ctrlKey
  if (!modifier || event.altKey || event.shiftKey) return null
  if (!/^[1-9]$/.test(event.key)) return null
  const index = Number(event.key) - 1
  return index < MODEL_MENU_HOTKEY_COUNT ? index : null
}

/** Badge text for the row at `index`: `⌘1` on macOS, `Ctrl+1` elsewhere. */
export function modelMenuHotkeyLabel(index: number, isMac: boolean): string {
  const digit = index + 1
  return isMac ? `⌘${digit}` : `Ctrl+${digit}`
}
