import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
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
    expect(stars[0].attributes('aria-checked')).toBe('true')
    expect(stars[3].attributes('aria-checked')).toBe('false')
    expect(wrapper.text()).toContain('3.5 of 5')
  })
})
