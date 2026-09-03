import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxProgressBar from '../src/TxProgressBar.vue'
import txProgressBarSource from '../src/TxProgressBar.vue?raw'

describe('txProgressBar', () => {
  it('clamps determinate progress and exposes progressbar state', async () => {
    const wrapper = mount(TxProgressBar, {
      props: {
        percentage: 140,
        showText: true,
      },
    })

    const track = wrapper.find('.tx-progress-bar__track')
    expect(track.attributes('role')).toBe('progressbar')
    expect(track.attributes('aria-valuenow')).toBe('100')
    expect(wrapper.attributes('style')).toContain('--tx-progress-width: 100%')
    expect(wrapper.text()).toContain('100%')

    await wrapper.setProps({ percentage: -20 })
    expect(track.attributes('aria-valuenow')).toBe('0')
    expect(wrapper.attributes('style')).toContain('--tx-progress-width: 0%')
  })

  it('omits aria-valuenow in indeterminate mode', () => {
    const wrapper = mount(TxProgressBar, {
      props: {
        indeterminate: true,
        message: 'Syncing',
        showText: true,
      },
    })

    expect(wrapper.find('.tx-progress-bar__track').attributes('aria-valuenow')).toBeUndefined()
    expect(wrapper.find('.tx-progress-bar').classes()).toContain('tx-progress-bar--indeterminate')
    expect(wrapper.text()).toContain('Syncing')
  })

  it('emits complete once per completion cycle', async () => {
    const wrapper = mount(TxProgressBar, {
      props: {
        percentage: 90,
      },
    })

    await wrapper.setProps({ percentage: 100 })
    await wrapper.setProps({ percentage: 100 })
    expect(wrapper.emitted('complete')).toHaveLength(1)

    await wrapper.setProps({ percentage: 50 })
    await wrapper.setProps({ percentage: 100 })
    expect(wrapper.emitted('complete')).toHaveLength(2)
  })

  it('emits complete when mounted already at 100 (watcher previously lacked immediate)', () => {
    const wrapper = mount(TxProgressBar, {
      props: {
        percentage: 100,
      },
    })

    expect(wrapper.emitted('complete')).toHaveLength(1)
  })

  it('does not emit complete on mount below 100 or while loading', () => {
    const below = mount(TxProgressBar, {
      props: {
        percentage: 40,
      },
    })
    expect(below.emitted('complete')).toBeUndefined()

    const loading = mount(TxProgressBar, {
      props: {
        percentage: 100,
        loading: true,
      },
    })
    expect(loading.emitted('complete')).toBeUndefined()
  })

  it('normalizes segment widths by positive segment sum', () => {
    const wrapper = mount(TxProgressBar, {
      props: {
        segments: [
          { value: 1, color: 'red' },
          { value: 3, color: 'blue' },
          { value: -2, color: 'gray' },
        ],
      },
    })

    const segments = wrapper.findAll('.tx-progress-bar__segment')
    expect(segments).toHaveLength(2)
    expect(segments[0].attributes('style')).toContain('width: 25%')
    expect(segments[1].attributes('style')).toContain('width: 75%')
  })
})

function fillOf(wrapper: ReturnType<typeof mount>): string {
  return (wrapper.element as HTMLElement).style.getPropertyValue('--tx-progress-fill')
}

describe('txProgressBar flat track', () => {
  it('renders no mask node, no mask class and a plain track by default', () => {
    const wrapper = mount(TxProgressBar, { props: { percentage: 40 } })

    expect(wrapper.find('.tx-progress-bar__mask').exists()).toBe(false)
    expect(wrapper.classes()).toContain('tx-progress-bar-wrapper--mask-plain')
    expect(wrapper.classes().some(c => c.startsWith('tx-progress-bar-wrapper--bg-'))).toBe(false)
  })

  it('keeps the mask layer as an explicit opt-in', () => {
    const blur = mount(TxProgressBar, { props: { percentage: 40, maskBackground: 'blur' } })
    expect(blur.find('.tx-progress-bar__mask').exists()).toBe(true)
    expect(blur.classes()).toContain('tx-progress-bar-wrapper--bg-blur')

    const solid = mount(TxProgressBar, { props: { percentage: 40, maskVariant: 'solid', maskBackground: 'glass' } })
    expect(solid.find('.tx-progress-bar__mask').exists()).toBe(true)
    expect(solid.classes()).toContain('tx-progress-bar-wrapper--mask-solid')
    expect(solid.classes()).toContain('tx-progress-bar-wrapper--bg-glass')
  })

  it('renders the mask node inside the tooltip-wrapped template too', () => {
    const wrapper = mount(TxProgressBar, { props: { percentage: 40, tooltip: true, maskBackground: 'blur' } })
    expect(wrapper.find('.tx-progress-bar__track .tx-progress-bar__mask').exists()).toBe(true)

    const plain = mount(TxProgressBar, { props: { percentage: 40, tooltip: true } })
    expect(plain.find('.tx-progress-bar__mask').exists()).toBe(false)
  })
})

describe('txProgressBar gradient fill and tip glow', () => {
  it('fills with a left-to-right gradient derived from the resolved colour', () => {
    const wrapper = mount(TxProgressBar, { props: { percentage: 40 } })
    const fill = fillOf(wrapper)

    expect(fill.startsWith('linear-gradient(90deg')).toBe(true)
    expect(fill).toContain('var(--tx-color-primary')

    const status = mount(TxProgressBar, { props: { percentage: 40, status: 'warning' } })
    expect(fillOf(status).startsWith('linear-gradient(90deg')).toBe(true)
    expect(fillOf(status)).toContain('var(--tx-color-warning')
  })

  it('uses a gradient colour prop verbatim instead of layering another one', () => {
    const gradient = 'linear-gradient(90deg, #000, #fff)'
    const wrapper = mount(TxProgressBar, { props: { percentage: 40, color: gradient } })

    expect(fillOf(wrapper)).toBe(gradient)
  })

  it('no longer emits the shadow colour variable', () => {
    const wrapper = mount(TxProgressBar, { props: { percentage: 40 } })
    expect((wrapper.element as HTMLElement).style.getPropertyValue('--tx-progress-shadow-color')).toBe('')
  })

  it('places the glow beside the track, outside the clipped box, sharing its containing block', () => {
    const wrapper = mount(TxProgressBar, { props: { percentage: 40 } })
    const glow = wrapper.find('.tx-progress-bar__glow')

    expect(glow.exists()).toBe(true)
    expect(glow.attributes('aria-hidden')).toBe('true')
    expect(glow.classes()).toContain('is-visible')
    expect(wrapper.find('.tx-progress-bar__track .tx-progress-bar__glow').exists()).toBe(false)

    // The glow's percentage `left` must resolve against a box that spans
    // exactly the track: under the outside placement the wrapper is wider
    // than the track by the label and its gap.
    const body = glow.element.parentElement
    expect(body?.classList.contains('tx-progress-bar__body')).toBe(true)
    expect(body?.parentElement).toBe(wrapper.element)
    expect(wrapper.find('.tx-progress-bar__track').element.parentElement).toBe(body)
  })

  it('places the glow beside the track in the tooltip-wrapped template too', () => {
    const wrapper = mount(TxProgressBar, { props: { percentage: 40, tooltip: true } })
    const glow = wrapper.find('.tx-progress-bar__glow')

    expect(glow.exists()).toBe(true)
    expect(glow.classes()).toContain('is-visible')
    expect(glow.element.parentElement?.classList.contains('tx-progress-bar__body')).toBe(true)
    expect(glow.element.parentElement?.parentElement?.classList.contains('tx-progress-bar-wrapper')).toBe(true)
    expect(wrapper.find('.tx-progress-bar__track .tx-progress-bar__glow').exists()).toBe(false)
  })

  it('keeps the glow mounted but invisible at both ends so its position transitions with the fill', () => {
    // A glow that mounts at 40% while the fill is still easing out from 0 would
    // sit ahead of the tip for the whole transition; keeping the node and
    // fading it means `left` and `width` always share one timeline.
    const empty = mount(TxProgressBar, { props: { percentage: 0 } }).find('.tx-progress-bar__glow')
    expect(empty.exists()).toBe(true)
    expect(empty.classes()).not.toContain('is-visible')

    const full = mount(TxProgressBar, { props: { percentage: 100 } }).find('.tx-progress-bar__glow')
    expect(full.exists()).toBe(true)
    expect(full.classes()).not.toContain('is-visible')
  })

  it('never renders the glow while indeterminate or for segments', () => {
    expect(mount(TxProgressBar, { props: { indeterminate: true } }).find('.tx-progress-bar__glow').exists()).toBe(false)
    expect(mount(TxProgressBar, { props: { loading: true, percentage: 40 } }).find('.tx-progress-bar__glow').exists()).toBe(false)
    expect(mount(TxProgressBar, {
      props: { segments: [{ value: 20 }, { value: 30 }] },
    }).find('.tx-progress-bar__glow').exists()).toBe(false)
  })

  it('follows the progress across the ends as props change', async () => {
    const wrapper = mount(TxProgressBar, { props: { percentage: 0 } })
    expect(wrapper.find('.tx-progress-bar__glow').classes()).not.toContain('is-visible')

    await wrapper.setProps({ percentage: 65 })
    expect(wrapper.find('.tx-progress-bar__glow').classes()).toContain('is-visible')

    await wrapper.setProps({ percentage: 100 })
    expect(wrapper.find('.tx-progress-bar__glow').classes()).not.toContain('is-visible')
  })
})

describe('txProgressBar top text row', () => {
  it('renders the label and the detail above the track', () => {
    const wrapper = mount(TxProgressBar, {
      props: { percentage: 40, showText: true, textPlacement: 'top', detail: '1.4 MB of 2.3 MB' },
    })

    const head = wrapper.find('.tx-progress-bar__head')
    expect(head.exists()).toBe(true)
    expect(head.element.parentElement).toBe(wrapper.element)
    // The row sits directly above the track's body (track + glow).
    const body = head.element.nextElementSibling
    expect(body?.classList.contains('tx-progress-bar__body')).toBe(true)
    expect(body?.querySelector('.tx-progress-bar__track')).not.toBeNull()
    expect(wrapper.find('.tx-progress-bar__head-label').text()).toBe('40%')
    expect(wrapper.find('.tx-progress-bar__head-detail').text()).toBe('1.4 MB of 2.3 MB')
    expect(wrapper.classes()).toContain('tx-progress-bar-wrapper--text-top')

    expect(wrapper.find('.tx-progress-bar__text').exists()).toBe(false)
    expect(wrapper.find('.tx-progress-bar__outside-text').exists()).toBe(false)
  })

  it('renders the head in the tooltip-wrapped template too', () => {
    const wrapper = mount(TxProgressBar, {
      props: { percentage: 40, showText: true, textPlacement: 'top', detail: 'detail', tooltip: true },
    })

    expect(wrapper.find('.tx-progress-bar__head-label').text()).toBe('40%')
    expect(wrapper.find('.tx-progress-bar__head-detail').text()).toBe('detail')
  })

  it('formats the label through message > format > percentage', () => {
    const formatted = mount(TxProgressBar, {
      props: { percentage: 65, showText: true, textPlacement: 'top', format: (p: number) => `Uploading ${p}%` },
    })
    expect(formatted.find('.tx-progress-bar__head-label').text()).toBe('Uploading 65%')

    const message = mount(TxProgressBar, {
      props: { percentage: 65, textPlacement: 'top', message: 'Paused', format: (p: number) => `Uploading ${p}%` },
    })
    expect(message.find('.tx-progress-bar__head-label').text()).toBe('Paused')
  })

  it('omits the detail node when detail is absent', () => {
    const wrapper = mount(TxProgressBar, { props: { percentage: 40, showText: true, textPlacement: 'top' } })

    expect(wrapper.find('.tx-progress-bar__head-label').exists()).toBe(true)
    expect(wrapper.find('.tx-progress-bar__head-detail').exists()).toBe(false)
  })

  it('follows the outside visibility rules', () => {
    const silent = mount(TxProgressBar, { props: { percentage: 40, textPlacement: 'top', detail: 'ignored' } })
    expect(silent.find('.tx-progress-bar__head').exists()).toBe(false)

    const indeterminate = mount(TxProgressBar, { props: { indeterminate: true, showText: true, textPlacement: 'top' } })
    expect(indeterminate.find('.tx-progress-bar__head').exists()).toBe(false)

    const indeterminateMessage = mount(TxProgressBar, {
      props: { indeterminate: true, textPlacement: 'top', message: 'Syncing', detail: '3 files' },
    })
    expect(indeterminateMessage.find('.tx-progress-bar__head-label').text()).toBe('Syncing')
    expect(indeterminateMessage.find('.tx-progress-bar__head-detail').text()).toBe('3 files')
  })

  it('ignores detail under inside and outside placements', () => {
    const inside = mount(TxProgressBar, { props: { percentage: 40, showText: true, detail: 'hidden' } })
    expect(inside.find('.tx-progress-bar__text').text()).toBe('40%')
    expect(inside.find('.tx-progress-bar__head').exists()).toBe(false)
    expect(inside.text()).not.toContain('hidden')

    const outside = mount(TxProgressBar, {
      props: { percentage: 40, showText: true, textPlacement: 'outside', detail: 'hidden' },
    })
    expect(outside.find('.tx-progress-bar__outside-text').text()).toBe('40%')
    expect(outside.find('.tx-progress-bar__head').exists()).toBe(false)
    expect(outside.text()).not.toContain('hidden')
  })

  it('keeps detail out of the accessible name', () => {
    const wrapper = mount(TxProgressBar, {
      props: { percentage: 40, showText: true, textPlacement: 'top', message: 'Uploading', detail: '1.4 MB of 2.3 MB' },
    })
    const track = wrapper.find('.tx-progress-bar__track')

    expect(track.attributes('aria-label')).toBe('Uploading')

    const unnamed = mount(TxProgressBar, {
      props: { percentage: 40, showText: true, textPlacement: 'top', detail: '1.4 MB of 2.3 MB' },
    })
    expect(unnamed.find('.tx-progress-bar__track').attributes('aria-label')).toBe('Progress')
  })
})

/**
 * jsdom never applies an SFC's `<style>` block, so the motion contract is read
 * from the source. `ruleBody` matches braces instead of running a regex across
 * the file: an unanchored `[\s\S]*` would walk past the rule it names into the
 * next one and still pass with the asserted line deleted.
 */
function ruleBody(source: string, selector: string, from = 0): { body: string, end: number } {
  const start = source.indexOf(selector, from)
  if (start === -1)
    throw new Error(`selector not found in TxProgressBar.vue: ${selector}`)

  const open = source.indexOf('{', start)
  if (open === -1)
    throw new Error(`selector has no block: ${selector}`)

  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{')
      depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0)
        return { body: source.slice(open + 1, i), end: i }
    }
  }
  throw new Error(`unbalanced block for selector: ${selector}`)
}

function keyframeBlocks(source: string): Map<string, string> {
  const blocks = new Map<string, string>()
  const pattern = /@keyframes\s+(tx-progress-[\w-]+)/g
  for (let match = pattern.exec(source); match !== null; match = pattern.exec(source)) {
    const { body, end } = ruleBody(source, match[0], match.index)
    blocks.set(match[1]!, body)
    pattern.lastIndex = end
  }
  return blocks
}

describe('txProgressBar motion contract', () => {
  const source = txProgressBarSource

  it('extracts the keyframes it claims to test', () => {
    // Positive control: every assertion below is about what a block does *not*
    // contain; an extractor that silently returned nothing would pass vacuously.
    const blocks = keyframeBlocks(source)
    expect(blocks.size).toBeGreaterThanOrEqual(5)
    for (const [name, body] of blocks)
      expect(body.trim().length, name).toBeGreaterThan(0)

    for (const name of ['tx-progress-loading', 'tx-progress-classic', 'tx-progress-bounce', 'tx-progress-elastic', 'tx-progress-split'])
      expect(blocks.has(name), name).toBe(true)
  })

  it('animates indeterminate sweeps on composited properties, never left or width', () => {
    for (const [name, body] of keyframeBlocks(source)) {
      expect(body, name).not.toMatch(/\bleft\s*:/)
      expect(body, name).not.toMatch(/\bwidth\s*:/)
    }

    for (const name of ['tx-progress-loading', 'tx-progress-classic', 'tx-progress-bounce', 'tx-progress-elastic'])
      expect(keyframeBlocks(source).get(name), name).toMatch(/transform:\s*translateX\(/)
  })

  it('eases the fill and the glow together over ~480ms', () => {
    const bar = ruleBody(source, '.tx-progress-bar {').body
    const glow = ruleBody(source, '.tx-progress-bar__glow {').body

    expect(bar).toMatch(/transition:[^;]*\bwidth\b[^;]*480ms[^;]*var\(--tx-ease-out-strong/)
    expect(glow).toMatch(/transition:[^;]*\bleft\b[^;]*480ms[^;]*var\(--tx-ease-out-strong/)
    expect(bar).not.toContain('box-shadow')
    expect(bar).toContain('background: var(--tx-progress-fill')
    expect(source).not.toContain('--tx-progress-shadow-color')
  })

  it('paints the plain track without a border and tints it from the text colour', () => {
    const track = ruleBody(source, '.tx-progress-bar__track {').body
    expect(track).toMatch(/background:\s*color-mix\(in srgb, var\(--tx-text-color-primary/)

    // The rim exists only for the explicit solid / dashed variants: no rule may
    // start with the bare track selector (a substring check would also reject
    // the variant selectors that end in the same text).
    expect(source).not.toMatch(/^\.tx-progress-bar__track::after\s*\{/m)
    expect(source).toContain('.tx-progress-bar-wrapper--mask-solid .tx-progress-bar__track::after')
    expect(source).toContain('.tx-progress-bar-wrapper--mask-dashed .tx-progress-bar__track::after')
  })

  it('stops the sweeps under reduced motion', () => {
    const reduced = ruleBody(source, '@media (prefers-reduced-motion: reduce)').body
    expect(reduced).toContain('.tx-progress-bar--indeterminate::before')
    expect(reduced).toContain('animation: none')
  })
})
