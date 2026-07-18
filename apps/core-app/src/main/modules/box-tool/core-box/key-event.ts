export interface CoreBoxKeyEvent {
  key: string
  code: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  repeat: boolean
}

export type CoreBoxKeyModifier = 'shift' | 'control' | 'alt' | 'meta' | 'isautorepeat'

const BLOCKED_FUNCTION_KEYS = new Set(
  Array.from({ length: 24 }, (_, index) => `F${index + 1}`),
)

const ELECTRON_KEY_CODE_BY_DOM_KEY: Readonly<Record<string, string>> = {
  'ArrowUp': 'Up',
  'ArrowDown': 'Down',
  'ArrowLeft': 'Left',
  'ArrowRight': 'Right',
  'Enter': 'Return',
  'Escape': 'Escape',
  'Backspace': 'Backspace',
  'Tab': 'Tab',
  'Delete': 'Delete',
  'Home': 'Home',
  'End': 'End',
  'PageUp': 'PageUp',
  'PageDown': 'PageDown',
  ' ': 'Space',
}

export function isBlockedCoreBoxFunctionKey(key: string): boolean {
  return BLOCKED_FUNCTION_KEYS.has(key)
}

export function buildCoreBoxKeyModifiers(event: CoreBoxKeyEvent): CoreBoxKeyModifier[] {
  const modifiers: CoreBoxKeyModifier[] = []
  if (event.shiftKey)
    modifiers.push('shift')
  if (event.ctrlKey)
    modifiers.push('control')
  if (event.altKey)
    modifiers.push('alt')
  if (event.metaKey)
    modifiers.push('meta')
  if (event.repeat)
    modifiers.push('isautorepeat')
  return modifiers
}

export function mapDomKeyToElectronKeyCode(key: string): string {
  return ELECTRON_KEY_CODE_BY_DOM_KEY[key] ?? key
}
