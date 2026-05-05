import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxTransfer from '../src/TxTransfer.vue'

describe('txTransfer', () => {
  const data = [
    { key: 'docs', label: 'Docs' },
    { key: 'release', label: 'Release' },
    { key: 'blocked', label: 'Blocked', disabled: true },
  ]

  it('moves checked items to target', async () => {
    const wrapper = mount(TxTransfer, {
      props: {
        data,
        modelValue: [],
      },
    })

    await wrapper.findAll('.tx-checkbox')[0].trigger('click')
    await wrapper.find('.tx-transfer__actions button').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0][0]).toEqual(['docs'])
    expect(wrapper.emitted('change')?.[0][0]).toEqual(['docs'])
  })

  it('renders configurable empty text', () => {
    const wrapper = mount(TxTransfer, {
      props: {
        data: [],
        emptyText: 'No selectable items',
      },
    })

    expect(wrapper.text()).toContain('No selectable items')
  })

  it('labels icon-only action buttons', () => {
    const wrapper = mount(TxTransfer, {
      props: {
        data,
        addAriaLabel: 'Add selected',
        removeAriaLabel: 'Remove selected',
      },
    })

    const buttons = wrapper.findAll('.tx-transfer__actions button')
    expect(buttons[0].attributes('aria-label')).toBe('Add selected')
    expect(buttons[1].attributes('aria-label')).toBe('Remove selected')
  })
})
