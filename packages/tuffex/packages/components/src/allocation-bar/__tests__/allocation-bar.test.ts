import type { AllocationSegment } from '../src/types'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mount } from '@vue/test-utils'
import * as sass from 'sass'
import { describe, expect, it } from 'vitest'
import TxAllocationBar from '../src/TxAllocationBar.vue'

const SEGMENTS: AllocationSegment[] = [
  { key: 'van', label: 'Vanilla', short: 'VAN', percent: 72.5, amount: '$51,785', color: 'var(--tx-bui-orange)', description: 'Contribution snapshot.' },
  { key: 'choc', label: 'Chocolate', short: 'CHOC', percent: 22.8, amount: '$16,278' },
  { key: 'mint', label: 'Mint', short: 'MINT', percent: 4.7, amount: '$3,357' },
]

const here = dirname(fileURLToPath(import.meta.url))
const componentsRoot = resolve(here, '../../..')

/** Pull the token name out of an inline `background`/`color` declaration. */
function tokenOf(style: string | undefined): string | undefined {
  return /var\((--tx-bui-[\w-]+)/.exec(style ?? '')?.[1]
}

describe('txAllocationBar', () => {
  it('sizes each segment by its share and names it for assistive tech', () => {
    const wrapper = mount(TxAllocationBar, { props: { segments: SEGMENTS } })
    const segments = wrapper.findAll('.tx-bui-allocation-bar__segment')

    expect(segments).toHaveLength(3)
    expect(segments[0]!.attributes('style')).toContain('width: calc(72.5% - 2.9px)')
    expect(segments[0]!.attributes('aria-label')).toBe('Vanilla: 72.5%')

    const control = wrapper.find('.tx-bui-allocation-bar__control')
    expect(control.attributes('role')).toBe('radiogroup')
    expect(control.attributes('aria-label')).toBe('Allocation segments')
  })

  it('renders each share at its declared percentage of the space the gaps leave', () => {
    // The demo card is 356px wide with 12px of padding, so the bar gets 332px;
    // the track then spends 2px of padding and a 2px gap between neighbours.
    const barWidth = 332
    const trackPadding = 2
    const gap = 2
    const inner = barWidth - trackPadding * 2
    const distributable = inner - gap * (SEGMENTS.length - 1)

    const widths = mount(TxAllocationBar, { props: { segments: SEGMENTS } })
      .findAll('.tx-bui-allocation-bar__segment')
      .map((element) => {
        const match = /width:\s*calc\(([\d.]+)% - ([\d.]+)px\)/.exec(element.attributes('style') ?? '')
        expect(match, element.attributes('style')).not.toBeNull()
        const declared = Number(match![1])
        return { declared, rendered: (declared / 100) * inner - Number(match![2]) }
      })

    // Each rendered width is its declared share of the width left over...
    expect(widths.map(width => width.declared)).toEqual(SEGMENTS.map(segment => segment.percent))
    for (const { declared, rendered } of widths)
      expect(rendered).toBeCloseTo((declared / 100) * distributable, 6)

    // ...and the segments plus the separators fill the track exactly, so nothing
    // is clipped and flex has no overflow left to shrink.
    const filled = widths.reduce((sum, width) => sum + width.rendered, 0) + gap * (SEGMENTS.length - 1)
    expect(filled).toBeCloseTo(inner, 6)
  })

  it('falls back to the accent-then-ink ladder when no colour is given', () => {
    const wrapper = mount(TxAllocationBar, { props: { segments: SEGMENTS } })
    const segments = wrapper.findAll('.tx-bui-allocation-bar__segment')

    expect(segments[0]!.attributes('style')).toContain('var(--tx-bui-orange)')
    expect(segments[1]!.attributes('style')).toContain('var(--tx-bui-ink, #1f2124)')
    expect(segments[2]!.attributes('style')).toContain('var(--tx-bui-ink-2, #62656b)')
  })

  it('treats the first segment as active until told otherwise', () => {
    const wrapper = mount(TxAllocationBar, { props: { segments: SEGMENTS } })

    expect(wrapper.findAll('.tx-bui-allocation-bar__segment')[0]!.classes()).toContain('is-active')
    // Role/state moved from `role="group"` + `aria-pressed` to the single-select
    // radio pattern, so both control sets report `aria-checked` now.
    expect(wrapper.findAll('.tx-bui-allocation-bar__chip')[0]!.attributes('aria-checked')).toBe('true')
    expect(wrapper.findAll('.tx-bui-allocation-bar__chip')[1]!.attributes('aria-checked')).toBe('false')
    expect(wrapper.findAll('.tx-bui-allocation-bar__chip')[0]!.attributes('tabindex')).toBe('0')
    expect(wrapper.findAll('.tx-bui-allocation-bar__chip')[1]!.attributes('tabindex')).toBe('-1')
  })

  it('moves the selection with the arrow keys inside the set that has focus', async () => {
    const wrapper = mount(TxAllocationBar, { props: { segments: SEGMENTS }, attachTo: document.body })
    const chips = wrapper.findAll('.tx-bui-allocation-bar__chip')

    await chips[0]!.trigger('keydown', { key: 'ArrowRight' })

    expect(wrapper.emitted('update:modelValue')).toEqual([['choc']])
    expect(document.activeElement).toBe(chips[1]!.element)

    await chips[1]!.trigger('keydown', { key: 'ArrowLeft' })
    wrapper.unmount()
  })

  it('follows the controlled key rather than its own clicks', async () => {
    const wrapper = mount(TxAllocationBar, { props: { segments: SEGMENTS, modelValue: 'choc' } })

    await wrapper.findAll('.tx-bui-allocation-bar__segment')[2]!.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([['mint']])
    expect(wrapper.emitted('change')?.[0]).toEqual([SEGMENTS[2]])
    // Still on `choc` — the host owns the value.
    expect(wrapper.findAll('.tx-bui-allocation-bar__segment')[1]!.classes()).toContain('is-active')

    await wrapper.setProps({ modelValue: 'mint' })
    expect(wrapper.findAll('.tx-bui-allocation-bar__segment')[2]!.classes()).toContain('is-active')
  })

  it('stays quiet when the active segment is clicked again', async () => {
    const wrapper = mount(TxAllocationBar, { props: { segments: SEGMENTS, modelValue: 'van' } })
    await wrapper.findAll('.tx-bui-allocation-bar__chip')[0]!.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('selects from the legend as well as the bar', async () => {
    const wrapper = mount(TxAllocationBar, { props: { segments: SEGMENTS } })
    await wrapper.findAll('.tx-bui-allocation-bar__chip')[1]!.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['choc']])
  })

  it('shows short codes and formatted percentages in the legend', () => {
    const wrapper = mount(TxAllocationBar, {
      props: { segments: SEGMENTS, percentFormatter: (p: number) => `${Math.round(p)} pct` },
    })

    expect(wrapper.findAll('.tx-bui-allocation-bar__chip')[0]!.text()).toContain('VAN')
    expect(wrapper.findAll('.tx-bui-allocation-bar__percent')[0]!.text()).toBe('73 pct')
    expect(wrapper.findAll('.tx-bui-allocation-bar__segment')[0]!.attributes('aria-label'))
      .toBe('Vanilla: 73 pct')
  })

  it('falls back to the full label when no short code is given', () => {
    const wrapper = mount(TxAllocationBar, {
      props: { segments: [{ key: 'a', label: 'Vanilla', percent: 100 }] },
    })
    expect(wrapper.find('.tx-bui-allocation-bar__chip').text()).toContain('Vanilla')
  })

  it('hides the legend on request', () => {
    const wrapper = mount(TxAllocationBar, { props: { segments: SEGMENTS, legend: false } })
    expect(wrapper.find('.tx-bui-allocation-bar__legend').exists()).toBe(false)
  })

  it('keeps the detail panel opt-in and pinned to the active segment', async () => {
    const wrapper = mount(TxAllocationBar, { props: { segments: SEGMENTS } })
    expect(wrapper.find('.tx-bui-allocation-bar__detail').exists()).toBe(false)

    await wrapper.setProps({ detail: true })
    expect(wrapper.find('.tx-bui-allocation-bar__detail-label').text()).toBe('Vanilla')
    expect(wrapper.find('.tx-bui-allocation-bar__detail-body').text()).toBe('Contribution snapshot.')

    await wrapper.setProps({ modelValue: 'choc' })
    expect(wrapper.find('.tx-bui-allocation-bar__detail-label').text()).toBe('Chocolate')
    expect(wrapper.find('.tx-bui-allocation-bar__detail-body').exists()).toBe(false)
  })

  it('paints the detail label with the same resolved colour as the segment and its dot', async () => {
    const wrapper = mount(TxAllocationBar, {
      props: { segments: SEGMENTS, detail: true, modelValue: 'choc' },
    })

    // `choc` declares no colour, so all three surfaces must share the ladder step.
    expect(tokenOf(wrapper.findAll('.tx-bui-allocation-bar__segment')[1]!.attributes('style')))
      .toBe('--tx-bui-ink')
    expect(tokenOf(wrapper.findAll('.tx-bui-allocation-bar__dot')[1]!.attributes('style')))
      .toBe('--tx-bui-ink')
    expect(tokenOf(wrapper.find('.tx-bui-allocation-bar__detail-label').attributes('style')))
      .toBe('--tx-bui-ink')

    await wrapper.setProps({ modelValue: 'van' })
    expect(tokenOf(wrapper.find('.tx-bui-allocation-bar__detail-label').attributes('style')))
      .toBe('--tx-bui-orange')
  })

  it('renders nothing but the track for an empty allocation', () => {
    const wrapper = mount(TxAllocationBar, { props: { segments: [], detail: true } })
    expect(wrapper.findAll('.tx-bui-allocation-bar__segment')).toHaveLength(0)
    expect(wrapper.find('.tx-bui-allocation-bar__detail').exists()).toBe(false)
  })
})

describe('txAllocationBar default palette', () => {
  const [lightSource = '', darkSource = ''] = readFileSync(
    resolve(componentsRoot, 'style/bui-tokens.scss'),
    'utf8',
  ).split("[data-theme='dark']")

  function tokensIn(source: string): Record<string, string> {
    const table: Record<string, string> = {}
    for (const match of source.matchAll(/(--tx-bui-[\w-]+):\s*(#[0-9a-f]{6})\b/g))
      table[match[1]!] = match[2]!
    return table
  }

  function relativeLuminance(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((offset) => {
      const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
  }

  /** WCAG contrast ratio, the yardstick the "reads as bare track" bug failed. */
  function contrastRatio(one: string, other: string): number {
    const [lighter, darker] = [one, other].map(relativeLuminance).sort((a, b) => b - a)
    return (lighter! + 0.05) / (darker! + 0.05)
  }

  /** Largest per-channel distance — a cheap "these are visually different" test. */
  function channelDistance(one: string, other: string): number {
    return Math.max(
      ...[1, 3, 5].map(offset =>
        Math.abs(
          Number.parseInt(one.slice(offset, offset + 2), 16)
          - Number.parseInt(other.slice(offset, offset + 2), 16),
        ),
      ),
    )
  }

  it('paints a ladder that stays legible on the track in both themes', () => {
    const wrapper = mount(TxAllocationBar, {
      props: { segments: ['a', 'b', 'c', 'd'].map(key => ({ key, label: key, percent: 25 })) },
    })
    const fills = wrapper.findAll('.tx-bui-allocation-bar__segment').map((element) => {
      const token = tokenOf(element.attributes('style'))
      expect(token, element.attributes('style')).toBeDefined()
      return token!
    })
    // Four uncoloured shares must not collapse onto one step.
    expect(new Set(fills).size).toBe(fills.length)

    const themes = { light: tokensIn(lightSource), dark: tokensIn(darkSource) }
    for (const [theme, table] of Object.entries(themes)) {
      const track = table['--tx-bui-field']
      expect(track, `${theme} track exists`).toBeDefined()

      const colors = fills.map((token) => {
        expect(table[token], `${token} exists in the ${theme} theme`).toBeDefined()
        return table[token]!
      })

      // A share has to read as a fill, not as bare track: the old `--tx-bui-line`
      // / `--tx-bui-line-strong` steps sat a ΔRGB of 5–18 from the track (1.03 /
      // 1.16:1), which is exactly the "empty last segment" the report showed.
      for (const color of colors)
        expect(contrastRatio(color, track!), `${theme} ${color} on ${track}`).toBeGreaterThanOrEqual(2)

      for (let index = 1; index < colors.length; index++)
        expect(channelDistance(colors[index - 1]!, colors[index]!)).toBeGreaterThanOrEqual(32)
    }
  })
})

describe('txAllocationBar motion contract', () => {
  const sfc = resolve(here, '../src/TxAllocationBar.vue')

  function compileStyles(): string {
    const source = readFileSync(sfc, 'utf8')
    const blocks = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1] ?? '')
    expect(blocks.length).toBeGreaterThan(0)
    return blocks
      .map(block => sass.compileString(block, { url: pathToFileURL(sfc), syntax: 'scss' }).css)
      .join('\n')
  }

  it('reveals the selected sheen by class, never by an animation fill', () => {
    // The sheen is the one element here that rests at `opacity: 0`. That is safe
    // only because selection — not an entrance animation — brings it back: under
    // reduced motion we drop the transition, and it must still appear at once.
    const css = compileStyles()

    expect(css).not.toMatch(/animation:/)
    expect(css).toMatch(/is-active[\s\S]*?\.tx-bui-allocation-bar__sheen\s*\{[^}]*opacity:\s*1/)
  })

  it('drops only the motion when motion is reduced', () => {
    const guards = compileStyles().match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/g) ?? []

    expect(guards.length).toBeGreaterThan(0)
    for (const guard of guards) {
      expect(guard).toMatch(/transition:\s*none/)
      expect(guard).not.toMatch(/opacity:\s*0\s*[;}]?/)
      expect(guard).not.toMatch(/display:\s*none/)
      expect(guard).not.toMatch(/visibility:\s*hidden/)
    }
  })
})
