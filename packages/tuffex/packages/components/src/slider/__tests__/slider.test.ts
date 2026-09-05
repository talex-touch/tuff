import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { JELLY } from '../../../../utils/animation/jelly'
import txRadioGroupSource from '../../radio/src/TxRadioGroup.vue?raw'
import txRadioSource from '../../radio/src/TxRadio.vue?raw'
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
    bottom: 28,
    width: 200,
    height: 28,
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
    // 36px, not the old 28: the pill is 28px tall now and the tooltip must clear it.
    expect(tooltip.attributes('style')).toContain('translateY(36px)')

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
 * The pill's look is a stylesheet contract, and jsdom never applies an SFC's
 * `<style>` block — a mounted component cannot see it. So these read the source
 * and assert on the parsed rule bodies instead.
 *
 * `ruleBody` matches braces rather than running a regex across the file: an
 * unanchored `[\s\S]*` would happily walk past the rule it names and into the
 * next one, and would still pass with the asserted line deleted.
 */
function ruleBody(source: string, selector: string): string {
  const start = source.indexOf(selector)
  if (start === -1)
    throw new Error(`selector not found in source: ${selector}`)

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

/** Value of a custom property inside a rule body, or null when it is not set there. */
function varIn(block: string, name: string): string | null {
  const match = block.match(new RegExp(`${name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}:\\s*([^;]+);`))
  return match ? match[1]!.trim() : null
}

/** Top-level entries of a `box-shadow` list: the ring's fallback is a nested color-mix(). */
function shadowListOf(block: string): string[] {
  const list = block.match(/box-shadow:([^;]+);/)?.[1] ?? ''
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

/**
 * The pill thumb (2026-09-06): the Radio button-group indicator borrowed whole.
 * Geometry and recipe are asserted against the indicator's *source*, not
 * against literals copied into the test, so the two cannot drift apart without
 * one of these failing.
 */
describe('txSlider pill thumb', () => {
  const source = txSliderSource
  const base = () => ruleBody(source, '.tx-slider {')

  it('extracts the rules it claims to test', () => {
    // Positive control. Every assertion below is about what a block does *not*
    // contain or does contain; if the extractor silently returned nothing they
    // would all pass vacuously.
    expect(base().length).toBeGreaterThan(0)
    expect(ruleBody(source, '&__surface').length).toBeGreaterThan(0)
    expect(ruleBody(source, '&.is-dragging {').length).toBeGreaterThan(0)
    expect(ruleBody(txRadioSource, '&--button').length).toBeGreaterThan(0)
    expect(ruleBody(txRadioGroupSource, '.tx-radio-group__indicator-plain {').length).toBeGreaterThan(0)
  })

  it('is as tall as a Radio button and as tall as its own row', () => {
    const radioButton = ruleBody(txRadioSource, '&--button')
    const radioHeight = radioButton.match(/height:\s*(\d+px);/)?.[1]
    expect(radioHeight).toBe('28px')

    expect(varIn(base(), '--tx-slider-surface-size')).toBe(radioHeight)
    expect(varIn(base(), '--tx-slider-height')).toBe(radioHeight)
    expect(varIn(base(), '--tx-slider-surface-radius')).toBe('999px')
    // A capsule, not a bar: wider than tall, but not by much.
    const width = Number.parseFloat(varIn(base(), '--tx-slider-surface-width') ?? '0')
    expect(width).toBeGreaterThan(28)
    expect(width).toBeLessThanOrEqual(40)
  })

  it('wears the Radio indicator recipe: 88% overlay fill, 50% rim, 17% top highlight, the same shadow', () => {
    const indicator = ruleBody(txRadioGroupSource, '.tx-radio-group__indicator-plain {')

    // Fill: the overlay surface at the indicator's opacity, never a primary tint.
    const indicatorFill = indicator.match(/background:\s*color-mix\(in srgb, var\(--tx-bg-color-overlay[^)]*\)\s*(\d+)%/)?.[1]
    const tint = varIn(base(), '--tx-slider-surface-tint') ?? ''
    expect(indicatorFill).toBe('88')
    expect(tint).toContain('--tx-bg-color-overlay')
    expect(tint).toMatch(new RegExp(`\\b${indicatorFill}%`))
    expect(tint).not.toContain('--tx-color-primary')

    // Rim: the light border family at the indicator's opacity.
    const indicatorRim = indicator.match(/border:\s*1px solid color-mix\(in srgb, var\(--tx-border-color-light[^)]*\)\s*(\d+)%/)?.[1]
    const rim = varIn(base(), '--tx-slider-surface-rim') ?? ''
    expect(indicatorRim).toBe('50')
    expect(rim).toContain('--tx-border-color-light')
    expect(rim).toMatch(new RegExp(`\\b${indicatorRim}%`))

    // Highlight and shadow: the indicator writes them as literals, the slider as tokens.
    expect(indicator).toContain('inset 0 1px 0 rgba(255, 255, 255, 0.17)')
    expect(varIn(base(), '--tx-slider-surface-highlight')).toContain('17%')
    expect(indicator).toContain('0 2px 8px rgba(15, 23, 42, 0.08)')
    expect(varIn(base(), '--tx-slider-surface-shadow')).toBe('0 2px 8px rgba(15, 23, 42, 0.08)')

    // The three-part list, in the indicator's order.
    const surface = shadowListOf(ruleBody(source, '&__surface'))
    expect(surface).toEqual([
      'inset 0 0 0 1px var(--tx-slider-surface-rim)',
      'inset 0 1px 0 var(--tx-slider-surface-highlight)',
      'var(--tx-slider-surface-shadow)',
    ])
  })

  it('is one body per variant: the solid capsule carries no blur, no size channel, no keyframes', () => {
    // The 2026-09-01 CSS size spring is gone with everything that served it.
    expect(source).not.toContain('--tx-slider-surface-extent')
    expect(source).not.toContain('--tx-slider-state-duration')
    expect(source).not.toContain('@supports')
    expect(source).not.toContain('linear(')
    expect(source).not.toContain('@keyframes')
    expect(source).not.toContain('animation:')

    const surface = ruleBody(source, '&__surface')
    expect(surface).not.toContain('backdrop-filter')
    expect(surface).toContain('width: var(--tx-slider-surface-width);')
    expect(surface).toContain('height: var(--tx-slider-surface-size);')
    expect(surface).not.toMatch(/transition:[^;]*\b(width|height|transform)\b/)
  })

  it('offers the Radio indicator\'s three bodies and defaults to the frosted one', () => {
    // The blur variant thins the fill and frosts the track under it, at rest
    // as well as on drag — the fill refracting through the pill is what it is for.
    const blur = ruleBody(source, '&.is-thumb-blur {')
    expect(varIn(blur, '--tx-slider-surface-tint')).toContain('22%')
    expect(varIn(blur, '--tx-slider-surface-blur')).toBe('8px')
    const blurSurface = ruleBody(source, '&.is-thumb-blur .tx-slider__surface')
    expect(blurSurface).toContain('backdrop-filter: blur(var(--tx-slider-surface-blur)) saturate(var(--tx-slider-surface-saturate));')

    // Glass: the capsule goes clear under the glass body while held.
    expect(varIn(ruleBody(source, '&.is-thumb-glass.is-dragging'), '--tx-slider-surface-tint')).toBe('transparent')

    expect(mount(TxSlider, { props: { modelValue: 40 } }).classes()).toContain('is-thumb-blur')
    expect(mount(TxSlider, { props: { modelValue: 40, thumbVariant: 'solid' } }).classes()).toContain('is-thumb-solid')
    expect(mount(TxSlider, { props: { modelValue: 40, thumbVariant: 'glass' } }).classes()).toContain('is-thumb-glass')
    // The flat path has no body to vary.
    const flat = mount(TxSlider, { props: { modelValue: 40, thumbSurface: false } })
    expect(flat.classes().some(name => name.startsWith('is-thumb-'))).toBe(false)
  })

  it('keeps the pill at one size across every state in the stylesheet', () => {
    // The size steps are the jelly's, written per frame; hover and drag only
    // touch rim, shadow and track.
    for (const selector of ['&.is-hovering,', '&.is-dragging {']) {
      const block = ruleBody(source, selector)
      expect(varIn(block, '--tx-slider-surface-size')).toBeNull()
      expect(varIn(block, '--tx-slider-surface-width')).toBeNull()
      expect(varIn(block, '--tx-slider-surface-opacity')).toBeNull()
    }
    expect(varIn(base(), '--tx-slider-surface-opacity')).toBe('1')
  })

  it('holds the stylesheet transform at a bare translate so the resting pill is exact', () => {
    // The jelly's `scale()` is an inline style that exists only while it runs;
    // once it stops the property is dropped and this rule is what the pill
    // renders with, radius and rim unscaled.
    const surface = ruleBody(source, '&__surface')
    expect(surface).toContain('transform: translate(-50%, -50%);')
    expect(surface).not.toContain('scale(')
  })

  it('sizes the native hit area to the pill so the fill lands on its centre', () => {
    // `refreshMetrics()` reads `--tx-slider-thumb-size`; making it equal the
    // pill width is what keeps the pill inside the track at 0 and 100.
    expect(varIn(base(), '--tx-slider-thumb-size')).toBe('var(--tx-slider-surface-width)')

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
    const surface = shadowListOf(ruleBody(source, '&__surface'))
    const focused = shadowListOf(ruleBody(source, '&.is-focused:not(.is-dragging) .tx-slider__surface'))

    // Positive control: the base list is the three-part Radio recipe.
    expect(surface).toHaveLength(3)
    // Appended to the base list, not a replacement — otherwise the rim and the
    // highlight vanish the moment the slider gains keyboard focus.
    expect(focused.slice(0, surface.length)).toEqual(surface)
    expect(focused).toHaveLength(surface.length + 1)
    expect(focused.at(-1)).toMatch(/^0 0 0 3px var\(--tx-focus-ring-color\b/)
  })

  it('does not let hover in/out overshoot', () => {
    const hoverEase = varIn(base(), '--tx-slider-hover-ease') ?? ''
    const bezier = hoverEase.match(/cubic-bezier\(([^)]+)\)/)
    expect(bezier).not.toBeNull()
    const [, y1, , y2] = bezier![1]!.split(',').map(Number)
    expect(y1!).toBeLessThanOrEqual(1)
    expect(y2!).toBeLessThanOrEqual(1)
  })

  it('zeroes the hover clock under reduced motion', () => {
    const reduced = ruleBody(source, '@media (prefers-reduced-motion: reduce)')
    expect(reduced).toContain('--tx-slider-hover-duration: 0ms;')
  })
})

/**
 * The jelly: the indicator's motion driven by the slider's events. Frames are
 * faked so a press, a drag and a release can be walked through deterministically.
 */
describe('txSlider thumb jelly', () => {
  const surfaceStyle = (wrapper: ReturnType<typeof mount>) => wrapper.find('.tx-slider__surface').attributes('style') ?? ''
  const scaleOf = (style: string) => {
    const match = style.match(/scale\(([\d.]+), ([\d.]+)\)/)
    return match ? { x: Number(match[1]), y: Number(match[2]) } : null
  }

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('scales the pill through an inline transform from press to settled release, then lets go of it', async () => {
    const wrapper = mount(TxSlider, { props: { modelValue: 40, showTooltip: false } })
    expect(surfaceStyle(wrapper)).not.toContain('scale(')

    await wrapper.find('input').trigger('pointerdown')
    vi.advanceTimersByTime(48)
    await nextTick()

    // The grab pop plus the held scale rising on the spring: bigger than rest on both axes.
    const held = scaleOf(surfaceStyle(wrapper))
    expect(held).not.toBeNull()
    expect(held!.x).toBeGreaterThan(1)
    expect(held!.y).toBeGreaterThan(1)
    // Still a translate underneath, so the pill's centre stays on the thumb.
    expect(surfaceStyle(wrapper)).toContain('translate(-50%, -50%)')

    window.dispatchEvent(new Event('pointerup'))
    await nextTick()
    expect(wrapper.classes()).not.toContain('is-dragging')
    // The release does not snap: the spring is still carrying the scale home.
    vi.advanceTimersByTime(16)
    await nextTick()
    expect(surfaceStyle(wrapper)).toContain('scale(')

    // Settled: the inline transform is gone and the stylesheet's own holds again.
    vi.advanceTimersByTime(3000)
    await nextTick()
    expect(surfaceStyle(wrapper)).not.toContain('scale(')
    expect(surfaceStyle(wrapper)).not.toContain('transform')
  })

  it('holds the pill at the indicator\'s held scale while a still drag goes on', async () => {
    const wrapper = mount(TxSlider, { props: { modelValue: 40, showTooltip: false } })

    await wrapper.find('input').trigger('pointerdown')
    // Past the emerge pop and the spring's settling: what is left is the held scale.
    vi.advanceTimersByTime(1500)
    await nextTick()

    const held = scaleOf(surfaceStyle(wrapper))
    expect(held!.x).toBeCloseTo(JELLY.heldScale, 2)
    expect(held!.y).toBeCloseTo(JELLY.heldScale, 2)

    window.dispatchEvent(new Event('pointerup'))
    vi.advanceTimersByTime(3000)
    await nextTick()
  })

  it('never deforms under reduced motion', async () => {
    const matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    vi.stubGlobal('matchMedia', matchMedia)

    try {
      const wrapper = mount(TxSlider, { props: { modelValue: 40, showTooltip: false } })
      await wrapper.find('input').trigger('pointerdown')
      vi.advanceTimersByTime(200)
      await nextTick()

      expect(wrapper.classes()).toContain('is-dragging')
      expect(surfaceStyle(wrapper)).not.toContain('scale(')

      window.dispatchEvent(new Event('pointerup'))
      await nextTick()
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('stops its frame loop on unmount', async () => {
    const wrapper = mount(TxSlider, { props: { modelValue: 40, showTooltip: false } })
    await wrapper.find('input').trigger('pointerdown')
    vi.advanceTimersByTime(32)

    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame')
    wrapper.unmount()
    expect(cancelSpy).toHaveBeenCalled()
    cancelSpy.mockRestore()
  })

  it('mounts the Radio glass body only while the thumb is held or settling', async () => {
    const wrapper = mount(TxSlider, { props: { modelValue: 40, showTooltip: false, thumbVariant: 'glass' } })
    expect(wrapper.find('.tx-slider__glass').exists()).toBe(false)

    await wrapper.find('input').trigger('pointerdown')
    await nextTick()
    const glass = wrapper.find('.tx-slider__glass')
    expect(glass.exists()).toBe(true)
    expect(glass.classes()).toContain('is-active')
    // Inside the capsule, so it rides the jelly transform.
    expect(wrapper.find('.tx-slider__surface .tx-slider__glass').exists()).toBe(true)

    window.dispatchEvent(new Event('pointerup'))
    await nextTick()
    // Fading out, still mounted while the release settles.
    expect(wrapper.find('.tx-slider__glass').exists()).toBe(true)
    expect(wrapper.find('.tx-slider__glass').classes()).not.toContain('is-active')

    vi.advanceTimersByTime(3000)
    await nextTick()
    expect(wrapper.find('.tx-slider__glass').exists()).toBe(false)
  })
})
