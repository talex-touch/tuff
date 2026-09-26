/**
 * Reading an Electron accelerator (`Alt+Space`, `CommandOrControl+K`) the way a person reads a key.
 *
 * Global shortcuts are stored as accelerator strings, and several surfaces print one back: the
 * sidebar's search entry, the command window, the onboarding page, the notice sent when a default
 * is left without a key. They have to agree with each other and with the key that actually fires,
 * so they all read it here.
 *
 * Pure on purpose: the main process formats its notices with it and the renderer its hints, and a
 * test can pin every platform from one machine. `platform` is a `process.platform` value.
 */

/** Modifiers after platform resolution: `CommandOrControl` is already `command` or `control`. */
export type AcceleratorModifier = 'command' | 'control' | 'alt' | 'shift' | 'super'

export interface ParsedAccelerator {
  /** Resolved for the platform, de-duplicated, in display order. */
  modifiers: AcceleratorModifier[]
  /** The accelerator's own key token, e.g. `E`, `Space`, `F5`, `Up`. */
  key: string
}

/** The slice of a `KeyboardEvent` a match reads, so a test can pass a plain object. */
export interface AcceleratorKeyEvent {
  code: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

export type AcceleratorModifierFlag = 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'

/**
 * Command first on macOS, which is how the rest of the app writes a chord (`⌘⇧N`, see
 * `shortcut-chord.ts`). Elsewhere the Windows/Super key leads, as in `Win+Shift+S`.
 */
const MAC_MODIFIER_ORDER: readonly AcceleratorModifier[] = ['command', 'control', 'alt', 'shift']
const OTHER_MODIFIER_ORDER: readonly AcceleratorModifier[] = ['super', 'control', 'alt', 'shift']

const MAC_MODIFIER_SYMBOLS: Readonly<Record<AcceleratorModifier, string>> = {
  command: '⌘',
  super: '⌘',
  control: '⌃',
  alt: '⌥',
  shift: '⇧'
}

/** Caps that are not the key's own token. A letter needs no entry — it is upper-cased. */
const KEY_CAPS: Readonly<Record<string, string>> = {
  space: 'Space',
  spacebar: 'Space',
  plus: '+',
  enter: '↵',
  return: '↵',
  esc: 'Esc',
  escape: 'Esc',
  del: 'Delete',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  // The shortcut recorder stores punctuation by name.
  backquote: '`',
  backslash: '\\',
  bracketleft: '[',
  bracketright: ']',
  comma: ',',
  equal: '=',
  minus: '-',
  period: '.',
  quote: "'",
  semicolon: ';',
  slash: '/'
}

/** `KeyboardEvent.code` values for keys whose code is not derived from the token itself. */
const KEY_EVENT_CODES: Readonly<Record<string, readonly string[]>> = {
  space: ['Space'],
  spacebar: ['Space'],
  plus: ['Equal', 'NumpadAdd'],
  enter: ['Enter', 'NumpadEnter'],
  return: ['Enter', 'NumpadEnter'],
  tab: ['Tab'],
  backspace: ['Backspace'],
  delete: ['Delete'],
  del: ['Delete'],
  insert: ['Insert'],
  esc: ['Escape'],
  escape: ['Escape'],
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  home: ['Home'],
  end: ['End'],
  pageup: ['PageUp'],
  pagedown: ['PageDown'],
  backquote: ['Backquote'],
  '`': ['Backquote'],
  backslash: ['Backslash'],
  '\\': ['Backslash'],
  bracketleft: ['BracketLeft'],
  '[': ['BracketLeft'],
  bracketright: ['BracketRight'],
  ']': ['BracketRight'],
  comma: ['Comma'],
  ',': ['Comma'],
  equal: ['Equal'],
  '=': ['Equal'],
  minus: ['Minus'],
  '-': ['Minus'],
  period: ['Period'],
  '.': ['Period'],
  quote: ['Quote'],
  "'": ['Quote'],
  semicolon: ['Semicolon'],
  ';': ['Semicolon'],
  slash: ['Slash'],
  '/': ['Slash']
}

function resolveModifier(token: string, isMac: boolean): AcceleratorModifier | null {
  switch (token.toLowerCase()) {
    case 'commandorcontrol':
    case 'cmdorctrl':
    case 'commandorctrl':
    case 'cmdorcontrol':
      return isMac ? 'command' : 'control'
    // Electron maps Super/Meta to Cmd on macOS and to the Windows key elsewhere.
    case 'command':
    case 'cmd':
    case 'super':
    case 'meta':
    case 'win':
    case 'windows':
      return isMac ? 'command' : 'super'
    case 'control':
    case 'ctrl':
      return 'control'
    case 'alt':
    case 'option':
    case 'opt':
      return 'alt'
    case 'shift':
      return 'shift'
    default:
      return null
  }
}

/**
 * `null` for anything that is not modifiers plus one key: an empty string, a bare modifier, an
 * unknown modifier token, or a literal `+` (Electron spells that key `Plus`).
 */
export function parseAccelerator(accelerator: string, platform: string): ParsedAccelerator | null {
  if (typeof accelerator !== 'string') return null
  const tokens = accelerator.split('+').map((token) => token.trim())
  if (tokens.some((token) => token.length === 0)) return null

  const key = tokens.pop()
  const isMac = platform === 'darwin'
  if (!key || resolveModifier(key, isMac)) return null

  const found = new Set<AcceleratorModifier>()
  for (const token of tokens) {
    const modifier = resolveModifier(token, isMac)
    if (!modifier) return null
    found.add(modifier)
  }

  const order = isMac ? MAC_MODIFIER_ORDER : OTHER_MODIFIER_ORDER
  return { modifiers: order.filter((modifier) => found.has(modifier)), key }
}

/** What is printed on a key: `E`, `Space`, `↵`, `F5`. */
export function acceleratorKeyCap(key: string): string {
  const named = KEY_CAPS[key.toLowerCase()]
  if (named) return named
  return key.length === 1 ? key.toUpperCase() : key
}

/** `⌥` on macOS, `Alt` elsewhere. */
export function acceleratorModifierLabel(modifier: AcceleratorModifier, platform: string): string {
  if (platform === 'darwin') return MAC_MODIFIER_SYMBOLS[modifier]
  switch (modifier) {
    case 'control':
      return 'Ctrl'
    case 'alt':
      return 'Alt'
    case 'shift':
      return 'Shift'
    default:
      return platform === 'win32' ? 'Win' : 'Super'
  }
}

/**
 * `⌥Space` / `⌘K` on macOS, `Alt+Space` / `Ctrl+K` elsewhere. `separator` replaces the default
 * joiner on both, for running text: `' + '` gives `⌥ + Space` and `Alt + Space`.
 *
 * An accelerator this module cannot read is returned as written: a raw label beats a missing one.
 */
export function acceleratorLabel(
  accelerator: string,
  platform: string,
  separator?: string
): string {
  const parsed = parseAccelerator(accelerator, platform)
  if (!parsed) return accelerator
  const parts = [
    ...parsed.modifiers.map((modifier) => acceleratorModifierLabel(modifier, platform)),
    acceleratorKeyCap(parsed.key)
  ]
  return parts.join(separator ?? (platform === 'darwin' ? '' : '+'))
}

/**
 * Whether two accelerators press the same key on `platform`, whatever order or spelling their
 * modifiers are written in: `Control+K` and `CommandOrControl+K` do on Windows and Linux, and
 * `Command+K` and `CmdOrCtrl+K` on macOS. Accelerators this module cannot read match only when
 * written identically.
 */
export function acceleratorsMatch(a: string, b: string, platform: string): boolean {
  const left = parseAccelerator(a, platform)
  const right = parseAccelerator(b, platform)
  if (!left || !right) return a === b
  return (
    left.modifiers.join('+') === right.modifiers.join('+') &&
    acceleratorKeyCap(left.key).toUpperCase() === acceleratorKeyCap(right.key).toUpperCase()
  )
}

/** The `KeyboardEvent` flag a held modifier sets. Command and Super are both the Meta key. */
export function acceleratorModifierFlag(modifier: AcceleratorModifier): AcceleratorModifierFlag {
  switch (modifier) {
    case 'control':
      return 'ctrlKey'
    case 'alt':
      return 'altKey'
    case 'shift':
      return 'shiftKey'
    default:
      return 'metaKey'
  }
}

/**
 * The physical keys (`KeyboardEvent.code`) an accelerator key names. Physical, because with
 * Option held macOS rewrites `key` (`⌥Space` types a no-break space, `⌥E` a dead accent).
 */
export function acceleratorKeyEventCodes(key: string): readonly string[] {
  if (/^[a-z]$/i.test(key)) return [`Key${key.toUpperCase()}`]
  if (/^\d$/.test(key)) return [`Digit${key}`, `Numpad${key}`]
  if (/^f\d{1,2}$/i.test(key)) return [key.toUpperCase()]
  return KEY_EVENT_CODES[key.toLowerCase()] ?? []
}

/**
 * Exact match: every modifier the accelerator names is held and no other, and the key is the one
 * it names. A stray Shift is a different shortcut, not a sloppy press of this one.
 */
export function acceleratorMatchesEvent(
  parsed: ParsedAccelerator,
  event: AcceleratorKeyEvent
): boolean {
  const held = new Set(parsed.modifiers.map(acceleratorModifierFlag))
  const flags: readonly AcceleratorModifierFlag[] = ['metaKey', 'ctrlKey', 'altKey', 'shiftKey']
  if (flags.some((flag) => event[flag] !== held.has(flag))) return false
  return acceleratorKeyEventCodes(parsed.key).includes(event.code)
}
