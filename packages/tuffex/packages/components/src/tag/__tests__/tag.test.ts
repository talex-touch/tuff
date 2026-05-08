import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxTag from '../src/TxTag.vue'

describe('txTag', () => {
  it('renders label, icon, default size, and style variables', () => {
    const wrapper = mount(TxTag, {
      props: {
        label: 'Beta',
        icon: 'i-carbon-star',
        color: '#2563eb',
      },
    })

    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.classes()).toContain('tx-tag--sm')
    expect(wrapper.find('.tx-tag__content').text()).toBe('Beta')
    expect(wrapper.find('.tx-tag__icon').classes()).toContain('i-carbon-star')
    expect(wrapper.attributes('style')).toContain('--tx-tag-color: #2563eb')
  })

  it('uses default slot instead of label', () => {
    const wrapper = mount(TxTag, {
      props: {
        label: 'Fallback',
      },
      slots: {
        default: '<strong>Slot tag</strong>',
      },
    })

    expect(wrapper.find('.tx-tag__content').text()).toBe('Slot tag')
    expect(wrapper.find('strong').exists()).toBe(true)
  })

  it('emits click and close without bubbling close to tag click', async () => {
    const wrapper = mount(TxTag, {
      props: {
        label: 'Vue',
        closable: true,
      },
    })

    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)

    await wrapper.find('.tx-tag__close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('blocks click and close when disabled', async () => {
    const wrapper = mount(TxTag, {
      props: {
        label: 'Disabled',
        closable: true,
        disabled: true,
      },
    })

    expect(wrapper.classes()).toContain('tx-tag--disabled')
    expect(wrapper.find('.tx-tag__close').attributes('disabled')).toBeDefined()

    await wrapper.trigger('click')
    await wrapper.find('.tx-tag__close').trigger('click')

    expect(wrapper.emitted('click')).toBeUndefined()
    expect(wrapper.emitted('close')).toBeUndefined()
  })
})
