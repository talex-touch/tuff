import { describe, expect, it } from 'vitest'
import type { ShortcutChord, ShortcutChordEvent } from './shortcut-chord'
import { commandModifierHeld, shortcutChordLabel, shortcutChordMatches } from './shortcut-chord'

/**
 * `key` is in the fixture but not in `ShortcutChordEvent` on purpose: matching must read the
 * physical `code`, so a case that spells a different `key` is how a key-based implementation gets
 * caught.
 */
type TestEvent = ShortcutChordEvent & { key: string }

function press(code: string, modifiers: Partial<Omit<TestEvent, 'code'>> = {}): TestEvent {
  return {
    code,
    key: code,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers
  }
}

describe('commandModifierHeld', () => {
  it('counts only the platform’s own command key', () => {
    expect(commandModifierHeld(press('KeyN', { metaKey: true }), true)).toBe(true)
    expect(commandModifierHeld(press('KeyN', { metaKey: true }), false)).toBe(false)
    expect(commandModifierHeld(press('KeyN', { ctrlKey: true }), false)).toBe(true)
    expect(commandModifierHeld(press('KeyN', { ctrlKey: true }), true)).toBe(false)
  })

  it('refuses both modifiers at once, so a foreign habit is not a command key', () => {
    const both = press('KeyN', { metaKey: true, ctrlKey: true })
    expect(commandModifierHeld(both, true)).toBe(false)
    expect(commandModifierHeld(both, false)).toBe(false)
  })
})

describe('shortcutChordMatches', () => {
  it('fires on the platform’s chord and ignores the foreign modifier', () => {
    expect(shortcutChordMatches(press('KeyN', { metaKey: true }), { code: 'KeyN' }, true)).toBe(
      true
    )
    expect(shortcutChordMatches(press('KeyN', { ctrlKey: true }), { code: 'KeyN' }, false)).toBe(
      true
    )
    // Ctrl+N on a Mac belongs to the focused field; Meta+N on Windows is not a Windows chord.
    expect(shortcutChordMatches(press('KeyN', { ctrlKey: true }), { code: 'KeyN' }, true)).toBe(
      false
    )
    expect(shortcutChordMatches(press('KeyN', { metaKey: true }), { code: 'KeyN' }, false)).toBe(
      false
    )
  })

  it('never matches when both command modifiers are held, on either platform', () => {
    const both = press('KeyN', { metaKey: true, ctrlKey: true })
    expect(shortcutChordMatches(both, { code: 'KeyN' }, true)).toBe(false)
    expect(shortcutChordMatches(both, { code: 'KeyN' }, false)).toBe(false)
  })

  it('is exact about Shift, so ⌘⇧N never runs the ⌘N command', () => {
    const shiftN = press('KeyN', { metaKey: true, shiftKey: true })
    expect(shortcutChordMatches(shiftN, { code: 'KeyN' }, true)).toBe(false)
    expect(
      shortcutChordMatches(press('KeyN', { metaKey: true }), { code: 'KeyN', shift: true }, true)
    ).toBe(false)
    expect(shortcutChordMatches(shiftN, { code: 'KeyN', shift: true }, true)).toBe(true)
  })

  it('is exact about Alt, so a stray ⌥ cannot resolve to a chord of its own', () => {
    const altN = press('KeyN', { metaKey: true, altKey: true })
    expect(shortcutChordMatches(altN, { code: 'KeyN' }, true)).toBe(false)
    expect(
      shortcutChordMatches(press('KeyN', { metaKey: true }), { code: 'KeyN', alt: true }, true)
    ).toBe(false)
    expect(shortcutChordMatches(altN, { code: 'KeyN', alt: true }, true)).toBe(true)
  })

  it('matches on the physical code, so a layout or IME cannot move a command', () => {
    // Same key, different `key`: '?' is what Shift+/ reports, '-' is a non-US layout.
    expect(
      shortcutChordMatches(press('Slash', { metaKey: true, key: '?' }), { code: 'Slash' }, true)
    ).toBe(true)
    expect(
      shortcutChordMatches(press('Slash', { metaKey: true, key: '-' }), { code: 'Slash' }, true)
    ).toBe(true)
  })

  it('never matches a different code, even when `key` agrees with the chord', () => {
    expect(shortcutChordMatches(press('KeyM', { metaKey: true }), { code: 'KeyN' }, true)).toBe(
      false
    )
    // A comparison against `key` would fire here; the physical key is what decides.
    expect(
      shortcutChordMatches(
        press('Backslash', { metaKey: true, key: 'Slash' }),
        { code: 'Slash' },
        true
      )
    ).toBe(false)
  })
})

describe('shortcutChordLabel', () => {
  it.each([
    { chord: { code: 'KeyN' } satisfies ShortcutChord, mac: '⌘N', other: 'Ctrl+N' },
    {
      chord: { code: 'KeyN', shift: true } satisfies ShortcutChord,
      mac: '⌘⇧N',
      other: 'Ctrl+Shift+N'
    },
    { chord: { code: 'KeyN', alt: true } satisfies ShortcutChord, mac: '⌘⌥N', other: 'Ctrl+Alt+N' },
    {
      chord: { code: 'KeyN', alt: true, shift: true } satisfies ShortcutChord,
      mac: '⌘⌥⇧N',
      other: 'Ctrl+Alt+Shift+N'
    },
    { chord: { code: 'Slash' } satisfies ShortcutChord, mac: '⌘/', other: 'Ctrl+/' },
    { chord: { code: 'Comma' } satisfies ShortcutChord, mac: '⌘,', other: 'Ctrl+,' },
    { chord: { code: 'Period' } satisfies ShortcutChord, mac: '⌘.', other: 'Ctrl+.' },
    { chord: { code: 'Enter' } satisfies ShortcutChord, mac: '⌘↵', other: 'Ctrl+↵' }
  ])('writes $chord.code as $mac on macOS, $other elsewhere', ({ chord, mac, other }) => {
    expect(shortcutChordLabel(chord, true)).toBe(mac)
    expect(shortcutChordLabel(chord, false)).toBe(other)
  })
})
