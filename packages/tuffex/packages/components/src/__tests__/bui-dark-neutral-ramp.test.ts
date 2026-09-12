// @vitest-environment node
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const tokens = readFileSync(resolve(here, '../../style/bui-tokens.scss'), 'utf8')

/**
 * tuffex's own `.dark` ramp is deliberately neutral — `#141414` page, `#1d1e1f`
 * overlay, `#303030 / #262727 / #1d1d1d` fills, every one within 2 of grey. The
 * vendored BUI palette arrived with a +3..+5 blue lift on each step, so a BUI
 * card on a tuffex page read as blue-tinted: TxSidebarNav's surface measured
 * 35/36/39 against a 20/20/20 frame.
 *
 * Light mode is *not* covered here — tuffex's light tokens are cool too
 * (`--tx-fill-color: #f3f4f6`, `--tx-border-color-light: #e4e7ed`), so BUI's
 * cool light ramp is already in family.
 */
function darkBlock(): string {
  const start = tokens.indexOf("[data-theme='dark'],")
  expect(start, 'dark token block').toBeGreaterThan(-1)
  let depth = 0
  let i = tokens.indexOf('{', start)
  const open = i
  for (; i < tokens.length; i++) {
    if (tokens[i] === '{')
      depth++
    else if (tokens[i] === '}' && --depth === 0)
      break
  }
  return tokens.slice(open, i)
}

/** Tokens that carry a hue on purpose: the accent, the semantic tints, alphas. */
const CHROMATIC = /accent|green|orange|red|blue|yellow|stripe(?!-bg)|shadow|overlay/

function greys(): Array<{ name: string, rgb: [number, number, number] }> {
  const out: Array<{ name: string, rgb: [number, number, number] }> = []
  for (const m of darkBlock().matchAll(/(--tx-bui-[a-z0-9-]+)\s*:\s*#([0-9a-f]{6})\s*;/gi)) {
    const [, name, hex] = m
    if (CHROMATIC.test(name!))
      continue
    out.push({
      name: name!,
      rgb: [
        Number.parseInt(hex!.slice(0, 2), 16),
        Number.parseInt(hex!.slice(2, 4), 16),
        Number.parseInt(hex!.slice(4, 6), 16),
      ],
    })
  }
  return out
}

describe('bui dark ramp', () => {
  const ramp = greys()

  it('finds the achromatic tokens', () => {
    expect(ramp.length).toBeGreaterThanOrEqual(12)
    expect(ramp.map(t => t.name)).toContain('--tx-bui-surface')
    expect(ramp.map(t => t.name)).toContain('--tx-bui-line')
  })

  it('keeps every surface, ink and line neutral', () => {
    const tinted = ramp
      .filter(({ rgb }) => Math.max(...rgb) - Math.min(...rgb) > 1)
      .map(({ name, rgb }) => `${name} (${rgb.join(',')}, spread ${Math.max(...rgb) - Math.min(...rgb)})`)

    expect(tinted, 'blue-tinted greys read as a cool card on tuffex\'s neutral dark page').toEqual([])
  })

  it('keeps the surface lighter than the page and darker than a hover', () => {
    const by = Object.fromEntries(ramp.map(t => [t.name, t.rgb[1]]))
    expect(by['--tx-bui-page']).toBeLessThan(by['--tx-bui-surface']!)
    expect(by['--tx-bui-surface']).toBeLessThan(by['--tx-bui-hover']!)
    expect(by['--tx-bui-line']).toBeLessThan(by['--tx-bui-line-strong']!)
  })
})
