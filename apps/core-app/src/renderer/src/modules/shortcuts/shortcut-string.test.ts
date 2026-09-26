import { describe, expect, it } from 'vitest'
import { isSameShortcutChord, parseShortcutString } from './shortcut-string'

describe('parseShortcutString', () => {
  it.each([
    // The quick-actions docs' own examples, in macOS symbols.
    ['⌘⇧S', { code: 'KeyS', shift: true }],
    ['⌘M', { code: 'KeyM' }],
    ['⌘⌥T', { code: 'KeyT', alt: true }],
    ['⌘.', { code: 'Period' }],
    ['⌘↵', { code: 'Enter' }],
    // Caret notation for Control, compact like the symbols.
    ['^T', { code: 'KeyT' }],
    // The spelled-out forms CoreBox's own actions used to carry.
    ['Ctrl+Shift+F', { code: 'KeyF', shift: true }],
    ['Ctrl+Alt+T', { code: 'KeyT', alt: true }],
    ['ctrl + shift + c', { code: 'KeyC', shift: true }],
    // Electron accelerator names, as the recommendation items write them.
    ['CmdOrCtrl+C', { code: 'KeyC' }],
    ['CommandOrControl+Shift+C', { code: 'KeyC', shift: true }],
    ['Cmd+Option+Down', { code: 'ArrowDown', alt: true }],
    ['Meta+1', { code: 'Digit1' }],
    ['⌘F5', { code: 'F5' }]
  ])('reads %s as a chord on the platform command key', (raw, chord) => {
    expect(parseShortcutString(raw)).toEqual({ kind: 'chord', chord })
  })

  it.each(['Enter', 'enter', '↵', 'Return'])(
    'reads a bare %s as a claim on the primary slot',
    (raw) => {
      expect(parseShortcutString(raw)).toEqual({ kind: 'enter' })
    }
  )

  it.each([
    ['no command modifier', 'Shift+A'],
    ['no command modifier', 'Alt+1'],
    ['a modifier with no key', '⌘'],
    ['a modifier with no key', 'Ctrl+Shift'],
    ['two keys', 'Ctrl+K+S'],
    ['an unnamed key', 'Ctrl+Hyper'],
    ['the plus key', 'Ctrl++'],
    ['nothing', ''],
    ['nothing', '   ']
  ])('rejects %s (%s)', (_reason, raw) => {
    expect(parseShortcutString(raw)).toBeNull()
  })

  it('rejects a shift-modified Enter, which is not the primary action', () => {
    expect(parseShortcutString('Shift+Enter')).toBeNull()
  })

  it('tolerates a missing value', () => {
    expect(parseShortcutString(undefined)).toBeNull()
    expect(parseShortcutString(null)).toBeNull()
  })
})

describe('isSameShortcutChord', () => {
  it('compares the key and both optional modifiers, treating absent as false', () => {
    expect(isSameShortcutChord({ code: 'KeyC' }, { code: 'KeyC', shift: false })).toBe(true)
    expect(isSameShortcutChord({ code: 'KeyC' }, { code: 'KeyC', shift: true })).toBe(false)
    expect(isSameShortcutChord({ code: 'KeyC', alt: true }, { code: 'KeyC', alt: true })).toBe(true)
    expect(isSameShortcutChord({ code: 'KeyC' }, { code: 'KeyV' })).toBe(false)
  })
})
