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

describe('txAllocationBar', () => {
  it('sizes each segment by its share and names it for assistive tech', () => {
    const wrapper = mount(TxAllocationBar, { props: { segments: SEGMENTS } })
    const segments = wrapper.findAll('.tx-bui-allocation-bar__segment')

    expect(segments).toHaveLength(3)
    expect(segments[0]!.attributes('style')).toContain('width: 72.5%')
    expect(segments[0]!.attributes('aria-label')).toBe('Vanilla: 72.5%')
    expect(wrapper.find('.tx-bui-allocation-bar__track').attributes('aria-label'))
      .toBe('Allocation segments')
  })

  it('falls back to the accent-then-greys ladder when no colour is given', () => {
    const wrapper = mount(TxAllocationBar, { props: { segments: SEGMENTS } })
    const segments = wrapper.findAll('.tx-bui-allocation-bar__segment')

    expect(segments[0]!.attributes('style')).toContain('var(--tx-bui-orange)')
    expect(segments[1]!.attributes('style')).toContain('var(--tx-bui-line-strong, #e0e2e5)')
    expect(segments[2]!.attributes('style')).toContain('var(--tx-bui-line, #ecedef)')
  })

  it('treats the first segment as active until told otherwise', () => {
    const wrapper = mount(TxAllocationBar, { props: { segments: SEGMENTS } })

    expect(wrapper.findAll('.tx-bui-allocation-bar__segment')[0]!.classes()).toContain('is-active')
    expect(wrapper.findAll('.tx-bui-allocation-bar__chip')[0]!.attributes('aria-pressed')).toBe('true')
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

  it('renders nothing but the track for an empty allocation', () => {
    const wrapper = mount(TxAllocationBar, { props: { segments: [], detail: true } })
    expect(wrapper.findAll('.tx-bui-allocation-bar__segment')).toHaveLength(0)
    expect(wrapper.find('.tx-bui-allocation-bar__detail').exists()).toBe(false)
  })
})

describe('txAllocationBar motion contract', () => {
  const here = dirname(fileURLToPath(import.meta.url))
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
