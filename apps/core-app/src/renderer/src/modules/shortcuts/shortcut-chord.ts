/**
 * A chord is what a MainWindow shortcut is *made of*, kept separate from what it runs.
 *
 * Two decisions here are load-bearing:
 *
 * - The key is `KeyboardEvent.code`, not `key`. A chord is a physical key, so switching to a
 *   Chinese IME, holding Shift, or using a non-US layout must not change which command fires — the
 *   caps the user reads on the key do (`Slash` stays `Slash` even where the key prints `-`).
 * - Only the platform's own command modifier counts — ⌘ on macOS, Ctrl elsewhere. Ctrl+N on a Mac
 *   belongs to the focused field ("next line"), and a Windows habit must not fire a Mac command.
 *
 * Pure on purpose: `model-menu-hotkeys.ts` next door proves the same kind of contract without an
 * Electron instance. Matching and labelling have to agree — a badge that teaches a key that does
 * nothing is worse than no badge.
 */

export interface ShortcutChord {
  /** `KeyboardEvent.code` — the physical key, e.g. `KeyN`, `Slash`, `Comma`, `Enter`. */
  code: string
  shift?: boolean
  alt?: boolean
}

/** The slice of a `KeyboardEvent` a chord reads, so a test can pass a plain object. */
export interface ShortcutChordEvent {
  code: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

/** Caps that are not the key's own letter. `KeyN` needs no entry — `N` is derived. */
const SHORTCUT_KEY_CAPS: Readonly<Record<string, string>> = {
  Slash: '/',
  Comma: ',',
  Period: '.',
  Enter: '↵',
  Space: 'Space',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'"
}

/** Whether the platform's command modifier is held — and no foreign one on top of it. */
export function commandModifierHeld(event: ShortcutChordEvent, isMac: boolean): boolean {
  return isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
}

/**
 * Exact match. Modifiers are all-or-nothing, so `⌘⇧N` never fires the `⌘N` command and a stray
 * Alt (which rewrites `key` on a Mac keyboard) cannot resolve to a chord of its own.
 */
export function shortcutChordMatches(
  event: ShortcutChordEvent,
  chord: ShortcutChord,
  isMac: boolean
): boolean {
  if (!commandModifierHeld(event, isMac)) return false
  if (event.code !== chord.code) return false
  if (event.shiftKey !== Boolean(chord.shift)) return false
  return event.altKey === Boolean(chord.alt)
}

/**
 * Badge text: `⌘⇧N` on macOS, `Ctrl+Shift+N` elsewhere. Command first on both, which is how the
 * rest of the app writes a chord (`⌘1…⌘9` in the model menu).
 */
export function shortcutChordLabel(chord: ShortcutChord, isMac: boolean): string {
  // A letter key's cap is its own letter; anything else needs the table (or the raw code, for a
  // key the table does not name yet — a wrong-by-a-pixel badge beats a missing one).
  const cap =
    SHORTCUT_KEY_CAPS[chord.code] ??
    (chord.code.startsWith('Key') ? chord.code.slice('Key'.length) : chord.code)
  if (isMac) {
    return `⌘${chord.alt ? '⌥' : ''}${chord.shift ? '⇧' : ''}${cap}`
  }
  return ['Ctrl', ...(chord.alt ? ['Alt'] : []), ...(chord.shift ? ['Shift'] : []), cap].join('+')
}
