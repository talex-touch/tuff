import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import RatingInstalled from '../index'
import TxRating from '../src/TxRating.vue'

const rafCallbacks: FrameRequestCallback[] = []

function flushRaf() {
  const callback = rafCallbacks.shift()
  callback?.(performance.now())
}

describe('txRating', () => {
  beforeEach(() => {
    rafCallbacks.length = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      rafCallbacks.push(callback)
      return rafCallbacks.length
    })
  })

  it('renders half stars from the left with a clipped filled layer', () => {
    const wrapper = mount(TxRating, {
      props: {
        modelValue: 3.5,
        precision: 0.5,
      },
    })

    const halfStar = wrapper.findAll('.tx-rating__star')[3]
    expect(halfStar.classes()).toContain('tx-rating__star--half')
    expect(halfStar.find('.tx-rating__icon--filled').attributes('style')).toContain('width: 50%')
  })

  it('emits updates when a star is clicked', async () => {
    const wrapper = mount(TxRating, {
      props: {
        modelValue: 2,
      },
    })

    await wrapper.findAll('.tx-rating__star')[3].trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([4])
    expect(wrapper.emitted('change')?.[0]).toEqual([4])
  })

  it('supports half-star precision without blocking full-star selection', async () => {
    const wrapper = mount(TxRating, {
      props: {
        modelValue: 3,
        precision: 0.5,
      },
    })

    await wrapper.findAll('.tx-rating__star')[4].trigger('mouseenter')
    await wrapper.findAll('.tx-rating__star')[4].trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([5])

    const selectedWrapper = mount(TxRating, {
      props: {
        modelValue: 3,
        precision: 0.5,
      },
    })

    await selectedWrapper.findAll('.tx-rating__star')[2].trigger('click')

    expect(selectedWrapper.emitted('update:modelValue')?.[0]).toEqual([2.5])
  })

  it('blocks readonly and disabled interaction', async () => {
    const readonlyWrapper = mount(TxRating, {
      props: {
        modelValue: 4,
        readonly: true,
      },
    })
    const readonlyStars = readonlyWrapper.findAll('.tx-rating__star')

    expect(readonlyWrapper.attributes('aria-readonly')).toBe('true')
    expect(readonlyStars[0].attributes('disabled')).toBeDefined()
    await readonlyStars[0].trigger('click')
    expect(readonlyWrapper.emitted('update:modelValue')).toBeUndefined()

    const disabledWrapper = mount(TxRating, {
      props: {
        modelValue: 4,
        disabled: true,
      },
    })

    expect(disabledWrapper.attributes('aria-disabled')).toBe('true')
    expect(disabledWrapper.findAll('.tx-rating__star')[0].attributes('disabled')).toBeDefined()
  })

  it('supports custom style, icon, and disabled animation', async () => {
    const wrapper = mount(TxRating, {
      props: {
        modelValue: 2,
        icon: '💎',
        filledColor: '#f43f5e',
        emptyColor: '#fecdd3',
        hoverColor: '#fb7185',
        textColor: '#f43f5e',
        size: 24,
        gap: 6,
        showText: true,
      },
    })

    expect(wrapper.attributes('style')).toContain('--tx-rating-star-filled: #f43f5e')
    expect(wrapper.attributes('style')).toContain('--tx-rating-star-size: 24px')
    expect(wrapper.attributes('style')).toContain('--tx-rating-star-gap: 6px')
    expect(wrapper.find('[data-icon-type="emoji"][data-icon-value="💎"]').exists()).toBe(true)

    await wrapper.findAll('.tx-rating__star')[3].trigger('click')
    flushRaf()
    await nextTick()
    expect(wrapper.find('.tx-rating__star--pop').exists()).toBe(true)

    const stillWrapper = mount(TxRating, {
      props: {
        modelValue: 2,
        animated: false,
      },
    })

    await stillWrapper.findAll('.tx-rating__star')[3].trigger('click')
    expect(stillWrapper.find('.tx-rating__star--pop').exists()).toBe(false)
  })

  it('reflects external modelValue changes while interactive', async () => {
    // Regression: in interactive mode the filled layer reads hoverValue, which
    // never re-synced from modelValue, so a programmatic value change did not
    // render until the next mouseleave.
    const wrapper = mount(TxRating, {
      props: {
        modelValue: 2,
      },
    })

    let stars = wrapper.findAll('.tx-rating__star')
    expect(stars[1].classes()).toContain('tx-rating__star--filled')
    expect(stars[3].classes()).not.toContain('tx-rating__star--filled')

    await wrapper.setProps({ modelValue: 4 })

    stars = wrapper.findAll('.tx-rating__star')
    expect(stars[2].classes()).toContain('tx-rating__star--filled')
    expect(stars[3].classes()).toContain('tx-rating__star--filled')
  })

  it('exposes radio state and text slot props', () => {
    const wrapper = mount(TxRating, {
      props: {
        modelValue: 3.5,
        maxStars: 5,
        showText: true,
      },
      slots: {
        text: '<template #text="{ value, max }">{{ value }} of {{ max }}</template>',
      },
    })

    expect(wrapper.find('.tx-rating__stars').attributes('role')).toBe('radiogroup')
    const stars = wrapper.findAll('.tx-rating__star')
    expect(stars[0].attributes('role')).toBe('radio')
    // aria-checked is exclusive: exactly one radio is checked (ceil of the score),
    // not every star at or below the score. For 3.5 that is star 4 (index 3).
    const checked = stars.filter(s => s.attributes('aria-checked') === 'true')
    expect(checked).toHaveLength(1)
    expect(stars[3].attributes('aria-checked')).toBe('true')
    expect(stars[0].attributes('aria-checked')).toBe('false')
    expect(wrapper.text()).toContain('3.5 of 5')
  })

  it('exposes a localizable per-star aria-label', () => {
    const defaults = mount(TxRating, { props: { modelValue: 0, maxStars: 3 } })
    const defaultStars = defaults.findAll('.tx-rating__star')
    expect(defaultStars[0].attributes('aria-label')).toBe('Rate 1 star')
    expect(defaultStars[1].attributes('aria-label')).toBe('Rate 2 stars')

    const localized = mount(TxRating, {
      props: { modelValue: 0, maxStars: 3, starLabel: (star: number) => `评分 ${star} 星` },
    })
    expect(localized.findAll('.tx-rating__star')[0].attributes('aria-label')).toBe('评分 1 星')
  })

  it('registers the component through install', () => {
    const app = { component: vi.fn() }

    RatingInstalled.install?.(app as any)

    expect(app.component).toHaveBeenCalledWith('TxRating', RatingInstalled)
  })

  it('keeps keyboard focus on the clicked star', async () => {
    const wrapper = mount(TxRating, {
      attachTo: document.body,
      props: { modelValue: 0, animated: true },
    })

    const stars = wrapper.findAll<HTMLButtonElement>('.tx-rating__star')
    stars[2]!.element.focus()
    await stars[2]!.trigger('click')

    // The pop animation is applied inside requestAnimationFrame; the key only
    // flips once that runs, so the remount has to be given a chance to happen.
    flushRaf()
    await nextTick()

    // The star's :key used to embed the transient animation state, so selecting
    // it destroyed and recreated the button and the browser dropped focus.
    expect(document.activeElement).toBe(
      wrapper.findAll<HTMLButtonElement>('.tx-rating__star')[2]!.element,
    )

    wrapper.unmount()
  })

  it('exposes one tab stop and moves the rating with arrow keys', async () => {
    const wrapper = mount(TxRating, {
      attachTo: document.body,
      props: { modelValue: 3 },
    })

    const tabindexes = wrapper
      .findAll('.tx-rating__star')
      .map(star => star.attributes('tabindex'))
    // ARIA radiogroup: exactly one tab stop, on the checked option.
    expect(tabindexes).toEqual(['-1', '-1', '0', '-1', '-1'])

    const stars = wrapper.findAll<HTMLButtonElement>('.tx-rating__star')
    await stars[2]!.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([4])

    await stars[2]!.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([2])

    await stars[2]!.trigger('keydown', { key: 'Home' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([1])

    await stars[2]!.trigger('keydown', { key: 'End' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([5])

    wrapper.unmount()
  })

  it('ignores arrow keys when readonly or disabled', async () => {
    const wrapper = mount(TxRating, {
      props: { modelValue: 3, readonly: true },
    })

    await wrapper.findAll('.tx-rating__star')[2]!.trigger('keydown', { key: 'ArrowRight' })

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
