import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  NERD_FONT_FALLBACK_STACK,
  resolveTerminalFontFamily,
} from '../src/font-fallback'

describe('terminal font fallback resolution', () => {
  it('returns default terminal font family when empty or default', () => {
    expect(resolveTerminalFontFamily()).toBe(DEFAULT_TERMINAL_FONT_FAMILY)
    expect(resolveTerminalFontFamily('')).toBe(DEFAULT_TERMINAL_FONT_FAMILY)
    expect(resolveTerminalFontFamily('   ')).toBe(DEFAULT_TERMINAL_FONT_FAMILY)
    expect(resolveTerminalFontFamily('default')).toBe(DEFAULT_TERMINAL_FONT_FAMILY)
    expect(resolveTerminalFontFamily('DEFAULT')).toBe(DEFAULT_TERMINAL_FONT_FAMILY)
  })

  it('includes symbols nerd font and maple mono in default family', () => {
    expect(DEFAULT_TERMINAL_FONT_FAMILY).toContain('"Symbols Nerd Font Mono"')
    expect(DEFAULT_TERMINAL_FONT_FAMILY).toContain('"Maple Mono NF CN"')
    expect(DEFAULT_TERMINAL_FONT_FAMILY).toContain('monospace')
  })

  it('prepends user font and appends nerd font fallbacks', () => {
    const stack = resolveTerminalFontFamily('Fira Code')
    expect(stack.startsWith('Fira Code,')).toBe(true)
    expect(stack).toContain('"Symbols Nerd Font Mono"')
    expect(stack).toContain('"Maple Mono NF CN"')
    expect(stack.endsWith('monospace')).toBe(true)
  })

  it('deduplicates user fonts case-insensitively while preserving order', () => {
    const stack = resolveTerminalFontFamily('"Maple Mono NF CN", Menlo')
    const parts = stack.split(',').map(s => s.trim())
    expect(parts[0]).toBe('"Maple Mono NF CN"')
    expect(parts[1]).toBe('Menlo')
    const mapleMatches = parts.filter(p => p.toLowerCase().includes('maple mono nf cn'))
    expect(mapleMatches).toHaveLength(1)
  })

  it('exposes immutable nerd font fallback stack', () => {
    expect(NERD_FONT_FALLBACK_STACK).toContain('"Symbols Nerd Font Mono"')
    expect(Object.isFrozen(NERD_FONT_FALLBACK_STACK)).toBe(true)
  })
})
