import type { ShortcutChord } from './shortcut-chord'

/**
 * Plugin and provider shortcuts arrive as display strings — `'⌘⇧S'` in the quick-actions docs,
 * `'Ctrl+Shift+F'`, Electron's `'CmdOrCtrl+C'`, a bare `'Enter'` — while CoreBox matches
 * physical chords (`shortcut-chord.ts`). This is the compatibility bridge between the two until
 * the plugin SDK carries a structured chord of its own.
 *
 * Every command-like modifier (`⌘`, `Cmd`, `Meta`, `Ctrl`, `CmdOrCtrl`, …) reads as the
 * platform's command key, which is what the old string matcher did (it folded `Ctrl` into
 * `Meta`): a plugin that writes `⌘⇧S` means the same chord on Windows as on macOS. A shortcut
 * without a command modifier is not a chord here — except a bare Enter, which is how an action
 * declares that it is the item's primary action.
 */
export type ParsedShortcut = { kind: 'chord'; chord: ShortcutChord } | { kind: 'enter' }

type Modifier = 'command' | 'alt' | 'shift'

const MODIFIER_TOKENS: Readonly<Record<string, Modifier>> = {
  '⌘': 'command',
  cmd: 'command',
  command: 'command',
  meta: 'command',
  super: 'command',
  '⌃': 'command',
  '^': 'command',
  ctrl: 'command',
  control: 'command',
  cmdorctrl: 'command',
  commandorcontrol: 'command',
  mod: 'command',
  '⌥': 'alt',
  alt: 'alt',
  option: 'alt',
  opt: 'alt',
  '⇧': 'shift',
  shift: 'shift'
}

const SYMBOL_MODIFIERS = new Set(['⌘', '⌃', '^', '⌥', '⇧'])

/** Keys whose `KeyboardEvent.code` is not derived from the key's own letter or digit. */
const KEY_CODES: Readonly<Record<string, string>> = {
  enter: 'Enter',
  return: 'Enter',
  '↵': 'Enter',
  '⏎': 'Enter',
  '↩': 'Enter',
  space: 'Space',
  tab: 'Tab',
  '⇥': 'Tab',
  backspace: 'Backspace',
  '⌫': 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  '⌦': 'Delete',
  escape: 'Escape',
  esc: 'Escape',
  '⎋': 'Escape',
  up: 'ArrowUp',
  arrowup: 'ArrowUp',
  '↑': 'ArrowUp',
  down: 'ArrowDown',
  arrowdown: 'ArrowDown',
  '↓': 'ArrowDown',
  left: 'ArrowLeft',
  arrowleft: 'ArrowLeft',
  '←': 'ArrowLeft',
  right: 'ArrowRight',
  arrowright: 'ArrowRight',
  '→': 'ArrowRight',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  '.': 'Period',
  period: 'Period',
  ',': 'Comma',
  comma: 'Comma',
  '/': 'Slash',
  slash: 'Slash',
  ';': 'Semicolon',
  "'": 'Quote',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '\\': 'Backslash',
  '-': 'Minus',
  minus: 'Minus',
  '=': 'Equal',
  '`': 'Backquote'
}

function resolveKeyCode(token: string): string | null {
  if (/^[a-z]$/i.test(token)) return `Key${token.toUpperCase()}`
  if (/^\d$/.test(token)) return `Digit${token}`
  if (/^f(?:[1-9]|1\d|2[0-4])$/i.test(token)) return token.toUpperCase()
  return KEY_CODES[token.toLowerCase()] ?? null
}

/** Splits `'Ctrl+Shift+F'` on `+`, and `'⌘⇧S'` into its leading symbols plus the key. */
function tokenize(raw: string): string[] | null {
  const text = raw.trim()
  if (!text) return null

  if (text.length > 1 && text.includes('+')) {
    const parts = text.split('+').map((part) => part.trim())
    // `Ctrl++` names the plus key, which has no code of its own on most layouts.
    if (parts.some((part) => part.length === 0)) return null
    return parts
  }

  const compact = text.replace(/\s+/g, '')
  const tokens: string[] = []
  let index = 0
  while (index < compact.length - 1 && SYMBOL_MODIFIERS.has(compact[index]!)) {
    tokens.push(compact[index]!)
    index += 1
  }
  tokens.push(compact.slice(index))
  return tokens
}

export function parseShortcutString(raw: string | null | undefined): ParsedShortcut | null {
  if (typeof raw !== 'string') return null
  const tokens = tokenize(raw)
  if (!tokens) return null

  const modifiers = new Set<Modifier>()
  let code: string | null = null
  for (const token of tokens) {
    const modifier = MODIFIER_TOKENS[token.toLowerCase()]
    if (modifier) {
      modifiers.add(modifier)
      continue
    }
    // Two keys in one shortcut is a sequence, which a chord cannot express.
    if (code !== null) return null
    code = resolveKeyCode(token)
    if (code === null) return null
  }
  if (code === null) return null

  if (!modifiers.has('command')) {
    return code === 'Enter' && modifiers.size === 0 ? { kind: 'enter' } : null
  }

  const chord: ShortcutChord = { code }
  if (modifiers.has('shift')) chord.shift = true
  if (modifiers.has('alt')) chord.alt = true
  return { kind: 'chord', chord }
}

/** Chords are equal when their key and both optional modifiers are. */
export function isSameShortcutChord(a: ShortcutChord, b: ShortcutChord): boolean {
  return (
    a.code === b.code && Boolean(a.shift) === Boolean(b.shift) && Boolean(a.alt) === Boolean(b.alt)
  )
}
