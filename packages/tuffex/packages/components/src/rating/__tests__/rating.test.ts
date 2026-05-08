import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxRating from '../src/TxRating.vue'

describe('txRating', () => {
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

  it('supports half-star precision by clicking the selected star again', async () => {
    const wrapper = mount(TxRating, {
      props: {
        modelValue: 3,
        precision: 0.5,
      },
    })

    await wrapper.findAll('.tx-rating__star')[2].trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([2.5])
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
