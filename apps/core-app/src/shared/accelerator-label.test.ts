import { describe, expect, it } from 'vitest'
import type { AcceleratorKeyEvent } from './accelerator-label'
import {
  acceleratorKeyCap,
  acceleratorLabel,
  acceleratorMatchesEvent,
  acceleratorsMatch,
  parseAccelerator
} from './accelerator-label'

function press(code: string, modifiers: Partial<Omit<AcceleratorKeyEvent, 'code'>> = {}) {
  return {
    code,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers
  }
}

describe('parseAccelerator', () => {
  it('resolves CommandOrControl for the platform it runs on', () => {
    expect(parseAccelerator('CommandOrControl+E', 'darwin')).toEqual({
      modifiers: ['command'],
      key: 'E'
    })
    expect(parseAccelerator('CommandOrControl+E', 'win32')).toEqual({
      modifiers: ['control'],
      key: 'E'
    })
  })

  it('reads Option and Alt as one modifier, and Super as Command on a Mac', () => {
    expect(parseAccelerator('Option+Space', 'darwin')?.modifiers).toEqual(['alt'])
    expect(parseAccelerator('Alt+Space', 'linux')?.modifiers).toEqual(['alt'])
    expect(parseAccelerator('Super+K', 'darwin')?.modifiers).toEqual(['command'])
    expect(parseAccelerator('Super+K', 'win32')?.modifiers).toEqual(['super'])
  })

  it('puts modifiers in display order whatever order they were written in', () => {
    expect(parseAccelerator('Shift+Alt+Command+K', 'darwin')?.modifiers).toEqual([
      'command',
      'alt',
      'shift'
    ])
  })

  it('refuses what is not modifiers plus one key', () => {
    expect(parseAccelerator('', 'darwin')).toBeNull()
    expect(parseAccelerator('Alt', 'darwin')).toBeNull()
    expect(parseAccelerator('Hyper+K', 'darwin')).toBeNull()
    // Electron spells the plus key `Plus`; a literal `+` leaves an empty token.
    expect(parseAccelerator('CommandOrControl++', 'darwin')).toBeNull()
  })
})

describe('acceleratorLabel', () => {
  it('prints the CoreBox default and its fallback the way each platform writes them', () => {
    expect(acceleratorLabel('Alt+Space', 'darwin')).toBe('⌥Space')
    expect(acceleratorLabel('Alt+Space', 'win32')).toBe('Alt+Space')
    expect(acceleratorLabel('CommandOrControl+E', 'darwin')).toBe('⌘E')
    expect(acceleratorLabel('CommandOrControl+E', 'linux')).toBe('Ctrl+E')
  })

  it('spaces the parts for running text when asked', () => {
    expect(acceleratorLabel('Alt+Space', 'darwin', ' + ')).toBe('⌥ + Space')
    expect(acceleratorLabel('CommandOrControl+E', 'win32', ' + ')).toBe('Ctrl + E')
  })

  it('writes command first on macOS, as the rest of the app does', () => {
    expect(acceleratorLabel('Shift+Command+Space', 'darwin')).toBe('⌘⇧Space')
    expect(acceleratorLabel('Control+Option+K', 'darwin')).toBe('⌃⌥K')
    expect(acceleratorLabel('Super+Shift+S', 'win32')).toBe('Win+Shift+S')
  })

  it('names keys by their caps and passes an unreadable accelerator through', () => {
    expect(acceleratorKeyCap('e')).toBe('E')
    expect(acceleratorKeyCap('Return')).toBe('↵')
    expect(acceleratorKeyCap('Comma')).toBe(',')
    expect(acceleratorKeyCap('F5')).toBe('F5')
    expect(acceleratorLabel('Hyper+K', 'darwin')).toBe('Hyper+K')
  })
})

describe('acceleratorMatchesEvent', () => {
  const optionSpace = parseAccelerator('Alt+Space', 'darwin')!
  const commandE = parseAccelerator('CommandOrControl+E', 'darwin')!
  const ctrlE = parseAccelerator('CommandOrControl+E', 'win32')!

  it('matches the physical key, not the character Option types', () => {
    // ⌥Space types a no-break space on a Mac, so `key` is useless here; `code` is the key.
    expect(acceleratorMatchesEvent(optionSpace, press('Space', { altKey: true }))).toBe(true)
    expect(acceleratorMatchesEvent(commandE, press('KeyE', { metaKey: true }))).toBe(true)
    expect(acceleratorMatchesEvent(ctrlE, press('KeyE', { ctrlKey: true }))).toBe(true)
  })

  it('needs the exact modifiers: a missing, extra or foreign one is another shortcut', () => {
    expect(acceleratorMatchesEvent(optionSpace, press('Space'))).toBe(false)
    expect(
      acceleratorMatchesEvent(optionSpace, press('Space', { altKey: true, shiftKey: true }))
    ).toBe(false)
    expect(acceleratorMatchesEvent(commandE, press('KeyE', { ctrlKey: true }))).toBe(false)
    expect(acceleratorMatchesEvent(ctrlE, press('KeyE', { metaKey: true }))).toBe(false)
  })

  it('does not fire on the old default once the binding moved', () => {
    expect(acceleratorMatchesEvent(optionSpace, press('KeyE', { metaKey: true }))).toBe(false)
  })
})

describe('acceleratorsMatch', () => {
  it('reads CommandOrControl as the key it presses on each platform', () => {
    // The recorder writes Control+E for Ctrl+E on a PC, where CommandOrControl+E is that key too.
    expect(acceleratorsMatch('Control+E', 'CommandOrControl+E', 'win32')).toBe(true)
    expect(acceleratorsMatch('Control+E', 'CommandOrControl+E', 'linux')).toBe(true)
    expect(acceleratorsMatch('Control+E', 'CommandOrControl+E', 'darwin')).toBe(false)
    expect(acceleratorsMatch('Command+E', 'CommandOrControl+E', 'darwin')).toBe(true)
    expect(acceleratorsMatch('Command+E', 'CommandOrControl+E', 'win32')).toBe(false)
  })

  it('ignores spelling, case and modifier order, but not a modifier or key that differs', () => {
    expect(acceleratorsMatch('CmdOrCtrl+e', 'CommandOrControl+E', 'darwin')).toBe(true)
    expect(acceleratorsMatch('Option+Space', 'Alt+Space', 'darwin')).toBe(true)
    expect(acceleratorsMatch('Shift+Alt+Return', 'Alt+Shift+Enter', 'linux')).toBe(true)
    expect(acceleratorsMatch('Alt+Shift+Space', 'Alt+Space', 'darwin')).toBe(false)
    expect(acceleratorsMatch('CommandOrControl+R', 'CommandOrControl+E', 'win32')).toBe(false)
  })

  it('matches an accelerator it cannot read only as written', () => {
    expect(acceleratorsMatch('Hyper+K', 'Hyper+K', 'darwin')).toBe(true)
    expect(acceleratorsMatch('Hyper+K', 'Command+K', 'darwin')).toBe(false)
  })
})
