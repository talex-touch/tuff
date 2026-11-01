import { describe, expect, it } from 'vitest'
import { scanTerminalFonts } from './terminal-font-service'

describe('terminal font discovery service', () => {
  it('returns non-empty array of terminal font info with family and label', async () => {
    const fonts = await scanTerminalFonts()
    expect(Array.isArray(fonts)).toBe(true)
    expect(fonts.length).toBeGreaterThan(0)

    for (const font of fonts) {
      expect(font.family).toBeTypeOf('string')
      expect(font.label).toBeTypeOf('string')
      expect(font.isNerdFont).toBeTypeOf('boolean')
    }
  })

  it('marks nerd fonts correctly', async () => {
    const fonts = await scanTerminalFonts()
    const nerdFonts = fonts.filter((f) => f.isNerdFont)
    for (const font of nerdFonts) {
      expect(font.label).toContain('[Nerd Font]')
    }
  })

  it('returns cached result on subsequent calls', async () => {
    const first = await scanTerminalFonts()
    const second = await scanTerminalFonts()
    expect(first).toBe(second)
  })
})
