import { mount } from '@vue/test-utils'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { resolveTransition } from '../../liquid/src/spring'
import TxSlider from '../src/TxSlider.vue'
import txSliderSource from '../src/TxSlider.vue?raw'

function setMainMetrics(wrapper: ReturnType<typeof mount>) {
  const main = wrapper.find('.tx-slider__main').element as HTMLElement
  main.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 200,
    bottom: 24,
    width: 200,
    height: 24,
    toJSON: () => ({}),
  } as DOMRect)
}

describe('txSlider', () => {
  it('clamps displayed value and formats visible value', () => {
    const wrapper = mount(TxSlider, {
      props: {
        modelValue: 160,
        min: 10,
        max: 120,
        showValue: true,
        showTooltip: false,
        formatValue: value => `${value}%`,
      },
    })

    const input = wrapper.find('input')

    expect(input.element.value).toBe('120')
    expect(wrapper.find('.tx-slider__range').attributes('style')).toContain('width: 100%')
    expect(wrapper.find('.tx-slider__value').text()).toBe('120%')
  })

  it('emits clamped input and change values', async () => {
    const wrapper = mount(TxSlider, {
      props: {
        modelValue: 20,
        min: 0,
        max: 100,
        step: 5,
        showTooltip: false,
      },
    })

    const input = wrapper.find('input')
    await input.setValue('140')
    await input.trigger('change')

    expect(wrapper.emitted('update:modelValue')?.[0][0]).toBe(100)
    expect(wrapper.emitted('change')?.[0][0]).toBe(100)
  })

  it('blocks interaction and tooltip when disabled', async () => {
    const wrapper = mount(TxSlider, {
      props: {
        modelValue: 40,
        disabled: true,
        tooltipTrigger: 'always',
      },
    })

    await wrapper.find('input').trigger('pointerdown')
    await wrapper.find('input').setValue('60')

    expect(wrapper.classes()).toContain('is-disabled')
    expect(wrapper.find('.tx-slider__tooltip').exists()).toBe(false)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('shows hover tooltip with custom formatter and bottom placement', async () => {
    const wrapper = mount(TxSlider, {
      props: {
        modelValue: 40,
        tooltipTrigger: 'hover',
        tooltipPlacement: 'bottom',
        tooltipFormatter: value => `Value ${value}`,
        tooltipMotionDuration: -20,
        tooltipMotionBlurPx: -5,
      },
    })
    setMainMetrics(wrapper)

    await wrapper.find('.tx-slider__main').trigger('pointerenter')
    await nextTick()

    const tooltip = wrapper.find('.tx-slider__tooltip')
    expect(tooltip.exists()).toBe(true)
    expect(tooltip.text()).toBe('Value 40')
    expect(tooltip.attributes('data-motion')).toBe('blur')
    expect(tooltip.attributes('style')).toContain('--tx-slider-tooltip-motion-duration: 0ms')
    expect(tooltip.attributes('style')).toContain('--tx-slider-tooltip-motion-blur: 0px')
    expect(tooltip.attributes('style')).toContain('translateY(28px)')

    await wrapper.find('.tx-slider__main').trigger('pointerleave')
    await nextTick()
    expect(wrapper.find('.tx-slider__tooltip').exists()).toBe(false)
  })

  it('shows a non-transition tooltip when tooltipMotion is none', () => {
    const wrapper = mount(TxSlider, {
      props: {
        modelValue: 30,
        tooltipTrigger: 'always',
        tooltipMotion: 'none',
      },
    })

    const tooltip = wrapper.find('.tx-slider__tooltip')
    expect(tooltip.exists()).toBe(true)
    expect(tooltip.attributes('data-motion')).toBe('none')
  })

  it('cleans global pointer listeners on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const wrapper = mount(TxSlider)

    expect(addSpy).toHaveBeenCalledWith('pointerup', expect.any(Function))
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('pointerup', expect.any(Function))

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('paints from the input while the parent has not echoed the value back', async () => {
    // Pre-fix the fill was derived from `modelValue`, so it only caught up after
    // emit -> parent -> prop. A parent that persists on write (storage/IPC) made the
    // fill visibly trail the native thumb for the whole drag.
    const wrapper = mount(TxSlider, {
      props: { modelValue: 0, min: 0, max: 100, showTooltip: false, showValue: true },
    })

    await wrapper.find('input').setValue('80')

    // `modelValue` is still 0 — the parent never wrote it back.
    expect(wrapper.props('modelValue')).toBe(0)
    expect(wrapper.find('.tx-slider__range').attributes('style')).toContain('width: 80%')
    expect(wrapper.find('.tx-slider__value').text()).toBe('80')
  })

  it('lets a parent that clamps the value override what was painted', async () => {
    const wrapper = mount(TxSlider, {
      props: { modelValue: 0, min: 0, max: 100, showTooltip: false, showValue: true },
    })

    await wrapper.find('input').setValue('80')
    expect(wrapper.find('.tx-slider__value').text()).toBe('80')

    await wrapper.setProps({ modelValue: 50 })
    expect(wrapper.find('.tx-slider__value').text()).toBe('50')
    expect(wrapper.find('.tx-slider__range').attributes('style')).toContain('width: 50%')
  })

  it('exposes hover and drag as classes that survive the pointer leaving the track', async () => {
    // Pre-fix `dragging` was tracked in JS but never reached the DOM, so the drag
    // visuals rode `:hover`/`:active` and collapsed the moment the pointer left the
    // element — which a drag does constantly, since it is captured on `window`.
    const wrapper = mount(TxSlider, { props: { modelValue: 40 } })

    await wrapper.find('.tx-slider__main').trigger('pointerenter')
    expect(wrapper.classes()).toContain('is-hovering')

    await wrapper.find('input').trigger('pointerdown')
    expect(wrapper.classes()).toContain('is-dragging')

    await wrapper.find('.tx-slider__main').trigger('pointerleave')
    expect(wrapper.classes()).not.toContain('is-hovering')
    expect(wrapper.classes()).toContain('is-dragging')

    window.dispatchEvent(new Event('pointerup'))
    await nextTick()
    expect(wrapper.classes()).not.toContain('is-dragging')
  })

  it('never reports hover or drag while disabled', async () => {
    const wrapper = mount(TxSlider, { props: { modelValue: 40, disabled: true } })

    await wrapper.find('.tx-slider__main').trigger('pointerenter')
    await wrapper.find('input').trigger('pointerdown')

    expect(wrapper.classes()).not.toContain('is-hovering')
    expect(wrapper.classes()).not.toContain('is-dragging')
  })

  it('does not raise the keyboard focus ring for a drag-initiated focus', async () => {
    const wrapper = mount(TxSlider, { props: { modelValue: 40 } })
    const input = wrapper.find('input')

    await input.trigger('pointerdown')
    await input.trigger('focus')

    expect(wrapper.classes()).not.toContain('is-focused')
  })

  it('names the range input and surfaces aria-valuetext only when a formatter is set', () => {
    // Pre-fix the input had no accessible name (a host aria-label landed on the
    // wrapper div) and a custom formatter was never announced to AT.
    const wrapper = mount(TxSlider, {
      props: {
        modelValue: 40,
        min: 0,
        max: 100,
        ariaLabel: '音量',
        formatValue: (value: number) => `${value}%`,
      },
    })

    const input = wrapper.find('input')
    expect(input.attributes('aria-label')).toBe('音量')
    expect(input.attributes('aria-valuetext')).toBe('40%')

    // Without a formatter the raw aria-valuenow suffices; no redundant valuetext.
    const plain = mount(TxSlider, {
      props: { modelValue: 40, min: 0, max: 100 },
    })
    expect(plain.find('input').attributes('aria-valuetext')).toBeUndefined()
  })

  it('renders the pill by default and drops it on the flat path', () => {
    const pill = mount(TxSlider, { props: { modelValue: 40 } })
    expect(pill.classes()).toContain('has-surface')
    expect(pill.find('.tx-slider__surface').exists()).toBe(true)

    const flat = mount(TxSlider, { props: { modelValue: 40, thumbSurface: false } })
    expect(flat.classes()).not.toContain('has-surface')
    expect(flat.find('.tx-slider__surface').exists()).toBe(false)
  })
})

/**
 * The refractive slab's state channel is a stylesheet contract, and jsdom never
 * applies an SFC's `<style>` block — a mounted component cannot see it. So these
 * read the source and assert on the parsed rule bodies instead.
 *
 * `ruleBody` matches braces rather than running a regex across the file: an
 * unanchored `[\s\S]*` would happily walk past the rule it names and into the
 * next one, and would still pass with the asserted line deleted.
 */
function ruleBody(source: string, selector: string): string {
  const start = source.indexOf(selector)
  if (start === -1)
    throw new Error(`selector not found in TxSlider.vue: ${selector}`)

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
        return source.slice(open + 1, i)
    }
  }
  throw new Error(`unbalanced block for selector: ${selector}`)
}

describe('txSlider refractive slab sizing', () => {
  const source = txSliderSource

  it('extracts the rules it claims to test', () => {
    // Positive control. Every assertion below is about what a block does *not*
    // contain or does contain; if the extractor silently returned nothing they
    // would all pass vacuously.
    expect(ruleBody(source, '&__surface').length).toBeGreaterThan(0)
    expect(ruleBody(source, '&.is-dragging').length).toBeGreaterThan(0)
    expect(ruleBody(source, '@supports (transition-timing-function: linear(0, 1))').length).toBeGreaterThan(0)
  })

  it('drives the slab through its own box, not a transform scale', () => {
    const surface = ruleBody(source, '&__surface')

    // The whole point: scaling dragged the corner radius and the 1px rim along
    // with the box, so at rest the slab read as a shrunken sticker.
    expect(surface).not.toContain('scale(')
    expect(surface).toContain('transform: translate(-50%, -50%);')

    expect(surface).toContain('width: calc(var(--tx-slider-surface-width) * var(--tx-slider-surface-extent))')
    expect(surface).toContain('height: calc(var(--tx-slider-surface-size) * var(--tx-slider-surface-extent))')

    // Radius and rim are authored values now, never multiplied.
    expect(surface).toContain('border-radius: var(--tx-slider-surface-radius);')
    expect(surface).toContain('box-shadow:')
    expect(surface).toContain('inset 0 0 0 1px')
  })

  it('transitions the size channel and walls the layout pass in', () => {
    const surface = ruleBody(source, '&__surface')

    expect(surface).toMatch(/transition:[^;]*\bwidth\b/)
    expect(surface).toMatch(/transition:[^;]*\bheight\b/)
    expect(surface).not.toMatch(/transition:[^;]*\btransform\b/)

    // Without containment the size write is free to escape this leaf.
    expect(surface).toContain('contain: layout;')
  })
})

/**
 * The pill thumb (2026-09-01). One visual object in all three states, sized
 * like the Radio button-group indicator, with the press bounce compiled into
 * the transition curve itself rather than layered on as keyframes.
 */
describe('txSlider pill thumb', () => {
  const source = txSliderSource

  /** Value of a custom property inside a rule body, or null when it is not set there. */
  const varIn = (block: string, name: string): string | null => {
    const match = block.match(new RegExp(`${name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}:\\s*([^;]+);`))
    return match ? match[1]!.trim() : null
  }

  it('keeps the pill at one size across rest and hover, and grows it at most 10% on drag', () => {
    const rest = Number(varIn(ruleBody(source, '.tx-slider {'), '--tx-slider-surface-extent'))
    const hover = varIn(ruleBody(source, '&.is-hovering,'), '--tx-slider-surface-extent')
    const drag = Number(varIn(ruleBody(source, '&.is-dragging {'), '--tx-slider-surface-extent'))

    expect(rest).toBe(1)
    // Hover must not re-declare the extent: rest and hover are the same box.
    expect(hover).toBeNull()
    expect(drag).toBeGreaterThan(rest)
    expect(drag).toBeLessThanOrEqual(rest * 1.1)
  })

  it('keeps the pill visible in every state', () => {
    // Pre-change the slab was opacity 0 at rest and the native white disc did
    // the resting job; now the pill is the only thumb there is.
    expect(varIn(ruleBody(source, '.tx-slider {'), '--tx-slider-surface-opacity')).toBe('1')
    expect(varIn(ruleBody(source, '&.is-hovering,'), '--tx-slider-surface-opacity')).toBeNull()
    expect(varIn(ruleBody(source, '&.is-dragging {'), '--tx-slider-surface-opacity')).toBeNull()
  })

  it('draws a capsule with the Radio indicator recipe: rim, top highlight, drop shadow', () => {
    expect(varIn(ruleBody(source, '.tx-slider {'), '--tx-slider-surface-radius')).toBe('999px')

    const surface = ruleBody(source, '&__surface')
    const shadow = surface.match(/box-shadow:([^;]+);/)?.[1] ?? ''
    expect(shadow).toContain('inset 0 0 0 1px var(--tx-slider-surface-rim)')
    expect(shadow).toContain('inset 0 1px 0 var(--tx-slider-surface-highlight)')
    expect(shadow).toContain('0 2px 8px')

    // Neutral glass, not a primary-tinted sticker: the tint mixes the overlay
    // surface token, and the blue comes from the fill refracting through it.
    const tint = varIn(ruleBody(source, '.tx-slider {'), '--tx-slider-surface-tint') ?? ''
    expect(tint).toContain('--tx-bg-color-overlay')
    expect(tint).not.toContain('--tx-color-primary')
  })

  it('sizes the native hit area to the pill so the fill lands on its centre', () => {
    // `refreshMetrics()` reads `--tx-slider-thumb-size`; making it equal the
    // pill width is what keeps the pill inside the track at 0 and 100.
    const base = ruleBody(source, '.tx-slider {')
    expect(varIn(base, '--tx-slider-thumb-size')).toBe('var(--tx-slider-surface-width)')

    const flat = ruleBody(source, '&:not(.has-surface) {')
    expect(varIn(flat, '--tx-slider-thumb-size')).toBe('18px')
  })

  it('reduces the native thumb to a hit area on the surface path', () => {
    const thumb = ruleBody(source, '&.has-surface .tx-slider__input::-webkit-slider-thumb')
    expect(thumb).toContain('background: transparent;')
    expect(thumb).toContain('border: 0;')
    expect(thumb).toContain('box-shadow: none;')
    expect(thumb).toContain('width: var(--tx-slider-thumb-size);')
    expect(thumb).toContain('height: var(--tx-slider-height);')
  })

  it('appends the keyboard focus ring to the pill without dropping its rim', () => {
    const shadowListOf = (selector: string) => {
      const list = ruleBody(source, selector).match(/box-shadow:([^;]+);/)?.[1] ?? ''
      // Split on top-level commas only: the ring's fallback is a nested color-mix().
      const items: string[] = []
      let depth = 0
      let current = ''
      for (const ch of list) {
        if (ch === '(')
          depth++
        else if (ch === ')')
          depth--
        if (ch === ',' && depth === 0) {
          items.push(current.trim())
          current = ''
        }
        else {
          current += ch
        }
      }
      items.push(current.trim())
      return items.filter(Boolean)
    }

    const base = shadowListOf('&__surface')
    const focused = shadowListOf('&.is-focused:not(.is-dragging) .tx-slider__surface')

    // Positive control: the base list is the three-part Radio recipe.
    expect(base).toHaveLength(3)
    // Appended to the base list, not a replacement — otherwise the rim and the
    // highlight vanish the moment the slider gains keyboard focus.
    expect(focused.slice(0, base.length)).toEqual(base)
    expect(focused).toHaveLength(base.length + 1)
    expect(focused.at(-1)).toMatch(/^0 0 0 3px var\(--tx-focus-ring-color\b/)
  })

  it('no longer carries the press keyframes or the thumb dissolve', () => {
    // The 08-31 bounce was four keyframes each on its own overshooting bezier,
    // reversing velocity at every boundary. The bounce is now the transition.
    expect(source).not.toContain('tx-slider-thumb-press')
    expect(source).not.toContain('tx-slider-surface-press')
    expect(source).not.toContain('@keyframes')
    expect(source).not.toContain('animation:')

    // The dissolve served the white disc, which no longer exists.
    expect(source).not.toContain('--tx-slider-thumb-blur')
    expect(source).not.toContain('--tx-slider-thumb-opacity')
    expect(source).not.toContain('--tx-slider-dissolve-duration')
    expect(source).not.toContain('--tx-slider-press-duration')
  })

  it('bounces on the state transition itself, timed by the state duration', () => {
    const surface = ruleBody(source, '&__surface')
    const transition = surface.match(/transition:([^;]+);/)?.[1] ?? ''
    expect(transition).toMatch(/\bwidth var\(--tx-slider-state-duration\) var\(--tx-slider-ease\)/)
    expect(transition).toMatch(/\bheight var\(--tx-slider-state-duration\) var\(--tx-slider-ease\)/)
    // Rim / highlight / blur changes on hover ride the non-overshooting clock.
    expect(transition).toMatch(/\bbox-shadow var\(--tx-slider-hover-duration\) var\(--tx-slider-hover-ease\)/)
  })

  it('does not let hover in/out overshoot', () => {
    const base = ruleBody(source, '.tx-slider {')
    const hoverEase = varIn(base, '--tx-slider-hover-ease') ?? ''
    const bezier = hoverEase.match(/cubic-bezier\(([^)]+)\)/)
    expect(bezier).not.toBeNull()
    const [, y1, , y2] = bezier![1]!.split(',').map(Number)
    expect(y1!).toBeLessThanOrEqual(1)
    expect(y2!).toBeLessThanOrEqual(1)
  })

  it('falls back to a non-overshooting ease-out where linear() is unsupported', () => {
    const base = ruleBody(source, '.tx-slider {')
    const ease = varIn(base, '--tx-slider-ease') ?? ''
    const bezier = ease.match(/^cubic-bezier\(([^)]+)\)$/)
    expect(bezier).not.toBeNull()
    const [, y1, , y2] = bezier![1]!.split(',').map(Number)
    expect(y1!).toBeLessThanOrEqual(1)
    expect(y2!).toBeLessThanOrEqual(1)
  })

  it('zeroes every clock under reduced motion', () => {
    const reduced = ruleBody(source, '@media (prefers-reduced-motion: reduce)')
    expect(reduced).toContain('--tx-slider-state-duration: 0ms;')
    expect(reduced).toContain('--tx-slider-hover-duration: 0ms;')
    // Nothing left to switch off: there are no keyframes.
    expect(reduced).not.toContain('animation')
  })
})

/**
 * The spring is compiled once, by hand, into a static `linear()` string in the
 * SCSS. This locks that string to the compiler's output so the two cannot drift.
 */
describe('txSlider spring curve', () => {
  const source = txSliderSource
  const STIFFNESS = 560
  const DAMPING = 34

  beforeAll(() => {
    // `spring.ts` caches the `CSS.supports` probe module-wide on first call, so
    // the stub has to be in place before any `resolveTransition` call in this
    // process. jsdom has no `CSS` global, so without it we would get the
    // bezier fallback and the equality below would be meaningless.
    vi.stubGlobal('CSS', { supports: () => true })
  })

  it('locks the authored linear() curve to resolveTransition output', () => {
    const resolved = resolveTransition({ stiffness: STIFFNESS, damping: DAMPING })
    // Positive control: the stub took, we are looking at a compiled spring.
    expect(resolved.easing.startsWith('linear(')).toBe(true)

    const supports = ruleBody(source, '@supports (transition-timing-function: linear(0, 1))')
    const authored = supports.match(/--tx-slider-ease:\s*(linear\([^)]*\));/)?.[1]
    expect(authored).toBe(resolved.easing)

    const duration = supports.match(/--tx-slider-state-duration:\s*(\d+)ms;/)?.[1]
    expect(Number(duration)).toBe(resolved.duration)
  })

  it('overshoots 2–5% and reverses once', () => {
    const resolved = resolveTransition({ stiffness: STIFFNESS, damping: DAMPING })
    const values = resolved.easing.slice('linear('.length, -1).split(',').map(Number)

    const peak = Math.max(...values)
    expect(peak - 1).toBeGreaterThanOrEqual(0.02)
    expect(peak - 1).toBeLessThanOrEqual(0.05)
    expect(resolved.duration).toBeLessThanOrEqual(420)

    // Count sign changes of the sampled velocity outside the ±0.1% settle band —
    // the compiler forces the last sample to exactly 1, which manufactures a
    // sub-visible wiggle at the tail that a raw count would report.
    let reversals = 0
    let previous = 0
    for (let i = 1; i < values.length; i++) {
      const delta = values[i]! - values[i - 1]!
      const sign = delta > 0 ? 1 : delta < 0 ? -1 : 0
      if (sign !== 0 && previous !== 0 && sign !== previous && Math.abs(values[i - 1]! - 1) >= 0.001)
        reversals++
      if (sign !== 0)
        previous = sign
    }
    expect(reversals).toBe(1)
  })
})
