import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxTextarea from '../src/TxTextarea.vue'

describe('txTextarea', () => {
  it('renders value, placeholder, rows, and forwards attrs to textarea', () => {
    const wrapper = mount(TxTextarea, {
      props: {
        modelValue: 'Notes',
        placeholder: 'Write notes',
        rows: 6,
      },
      attrs: {
        id: 'notes',
        class: 'field-wrap',
        style: 'max-width: 320px;',
      },
    })

    const textarea = wrapper.find('textarea')
    expect(wrapper.classes()).toContain('field-wrap')
    expect(wrapper.attributes('style')).toContain('max-width: 320px')
    expect(textarea.element.value).toBe('Notes')
    expect(textarea.attributes('placeholder')).toBe('Write notes')
    expect(textarea.attributes('rows')).toBe('6')
    expect(textarea.attributes('id')).toBe('notes')
  })

  it('emits model and input updates', async () => {
    const wrapper = mount(TxTextarea, {
      props: {
        modelValue: '',
      },
    })

    await wrapper.find('textarea').setValue('hello')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['hello'])
    expect(wrapper.emitted('input')?.[0]).toEqual(['hello'])
  })

  it('shows character count and status classes', () => {
    const wrapper = mount(TxTextarea, {
      props: {
        modelValue: 'hello',
        maxLength: 20,
        showCount: true,
        status: 'error',
        resize: 'none',
      },
    })

    expect(wrapper.classes()).toContain('tx-textarea--error')
    expect(wrapper.classes()).toContain('tx-textarea--resize-none')
    expect(wrapper.find('.tx-textarea__count').text()).toBe('5/20')
  })

  it('exposes focus and blur helpers', () => {
    const wrapper = mount(TxTextarea)

    expect(typeof wrapper.vm.focus).toBe('function')
    expect(typeof wrapper.vm.blur).toBe('function')
  })
})
