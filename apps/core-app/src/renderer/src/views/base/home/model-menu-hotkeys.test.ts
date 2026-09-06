import { describe, expect, it } from 'vitest'
import {
  MODEL_MENU_HOTKEY_COUNT,
  modelMenuHotkeyIndex,
  modelMenuHotkeyLabel
} from './model-menu-hotkeys'

function key(
  keyName: string,
  modifiers: Partial<Omit<Parameters<typeof modelMenuHotkeyIndex>[0], 'key'>> = {}
) {
  return {
    key: keyName,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers
  }
}

describe('modelMenuHotkeyIndex', () => {
  it('maps ⌘1…⌘9 to rows 0…8 on macOS and Ctrl+digit elsewhere', () => {
    expect(modelMenuHotkeyIndex(key('1', { metaKey: true }), true)).toBe(0)
    expect(modelMenuHotkeyIndex(key('9', { metaKey: true }), true)).toBe(8)
    expect(modelMenuHotkeyIndex(key('1', { ctrlKey: true }), false)).toBe(0)
    expect(modelMenuHotkeyIndex(key('5', { ctrlKey: true }), false)).toBe(4)
  })

  it('ignores the other platform modifier, so Ctrl+1 on a Mac is not a pick', () => {
    expect(modelMenuHotkeyIndex(key('1', { ctrlKey: true }), true)).toBeNull()
    expect(modelMenuHotkeyIndex(key('1', { metaKey: true }), false)).toBeNull()
  })

  it('ignores digits without the modifier, zero, letters, and chords with Alt or Shift', () => {
    expect(modelMenuHotkeyIndex(key('1'), true)).toBeNull()
    expect(modelMenuHotkeyIndex(key('0', { metaKey: true }), true)).toBeNull()
    expect(modelMenuHotkeyIndex(key('a', { metaKey: true }), true)).toBeNull()
    expect(modelMenuHotkeyIndex(key('1', { metaKey: true, altKey: true }), true)).toBeNull()
    expect(modelMenuHotkeyIndex(key('1', { ctrlKey: true, shiftKey: true }), false)).toBeNull()
  })

  it('never exceeds the badge count', () => {
    expect(MODEL_MENU_HOTKEY_COUNT).toBe(9)
    expect(modelMenuHotkeyIndex(key('9', { metaKey: true }), true)).toBe(
      MODEL_MENU_HOTKEY_COUNT - 1
    )
  })
})

describe('modelMenuHotkeyLabel', () => {
  it('spells the chord the way each platform writes it', () => {
    expect(modelMenuHotkeyLabel(0, true)).toBe('⌘1')
    expect(modelMenuHotkeyLabel(8, true)).toBe('⌘9')
    expect(modelMenuHotkeyLabel(0, false)).toBe('Ctrl+1')
    expect(modelMenuHotkeyLabel(8, false)).toBe('Ctrl+9')
  })
})
