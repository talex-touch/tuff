import type { WebContents } from 'electron'

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
export type CoreBoxFlowShortcutAction = 'detach' | 'transfer'

export interface CoreBoxFlowShortcutInput {
  key: string
  meta: boolean
  control: boolean
  alt: boolean
  shift: boolean
  isAutoRepeat?: boolean
}

const BLOCKED_FUNCTION_KEYS = new Set(Array.from({ length: 24 }, (_, index) => `F${index + 1}`))

const ELECTRON_KEY_CODE_BY_DOM_KEY: Readonly<Record<string, string>> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Enter: 'Return',
  Escape: 'Escape',
  Backspace: 'Backspace',
  Tab: 'Tab',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ' ': 'Space'
}

export function isBlockedCoreBoxFunctionKey(key: string): boolean {
  return BLOCKED_FUNCTION_KEYS.has(key)
}

export function resolveCoreBoxFlowShortcut(
  input: CoreBoxFlowShortcutInput
): CoreBoxFlowShortcutAction | null {
  if (input.isAutoRepeat || input.key.toLowerCase() !== 'd') {
    return null
  }
  if ((!input.meta && !input.control) || input.alt) {
    return null
  }
  return input.shift ? 'transfer' : 'detach'
}

export function buildCoreBoxKeyModifiers(event: CoreBoxKeyEvent): CoreBoxKeyModifier[] {
  const modifiers: CoreBoxKeyModifier[] = []
  if (event.shiftKey) modifiers.push('shift')
  if (event.ctrlKey) modifiers.push('control')
  if (event.altKey) modifiers.push('alt')
  if (event.metaKey) modifiers.push('meta')
  if (event.repeat) modifiers.push('isautorepeat')
  return modifiers
}

export function mapDomKeyToElectronKeyCode(key: string): string {
  return ELECTRON_KEY_CODE_BY_DOM_KEY[key] ?? key
}

/**
 * Replays a CoreBox key event into another renderer's webContents.
 *
 * A plugin UI view is its own webContents, so host keys that the view is supposed to own
 * (⌘←/⌘→ for its own navigation, Enter, …) have to be re-dispatched here: the view's DOM
 * listeners only run for events delivered to that webContents.
 *
 * @returns True when the event was dispatched, false for blocked function keys.
 */
export function forwardKeyEventToWebContents(
  webContents: WebContents,
  event: CoreBoxKeyEvent
): boolean {
  if (isBlockedCoreBoxFunctionKey(event.key)) {
    return false
  }

  const modifiers = buildCoreBoxKeyModifiers(event)
  const keyCode = mapDomKeyToElectronKeyCode(event.key)

  webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })

  if (event.key.length === 1) {
    webContents.sendInputEvent({ type: 'char', keyCode: event.key, modifiers })
  }

  webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })

  return true
}
