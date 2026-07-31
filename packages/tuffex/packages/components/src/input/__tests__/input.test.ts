import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TuffInput from '../src/TxInput.vue'

describe('tuffInput', () => {
  it('emits model and input updates for text input', async () => {
    const wrapper = mount(TuffInput, {
      props: {
        modelValue: '',
        placeholder: 'Type here',
      },
    })

    const input = wrapper.find('input')
    expect(input.attributes('placeholder')).toBe('Type here')

    await input.setValue('hello')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['hello'])
    expect(wrapper.emitted('input')?.[0]).toEqual(['hello'])
  })

  it('normalizes number input values', async () => {
    const wrapper = mount(TuffInput, {
      props: {
        modelValue: '',
        type: 'number',
      },
    })

    const input = wrapper.find('input')
    await input.setValue('42')
    await input.setValue('')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([42])
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([''])
  })

  it('renders textarea with rows and forwards attrs to the field', () => {
    const wrapper = mount(TuffInput, {
      props: {
        type: 'textarea',
        modelValue: 'Notes',
        rows: 5,
      },
      attrs: {
        id: 'notes',
        class: 'form-field',
        style: 'max-width: 320px;',
      },
    })

    const textarea = wrapper.find('textarea')
    expect(wrapper.classes()).toContain('form-field')
    expect(wrapper.attributes('style')).toContain('max-width: 320px')
    expect(textarea.attributes('id')).toBe('notes')
    expect(textarea.attributes('rows')).toBe('5')
    expect(textarea.attributes('class')).not.toContain('form-field')
  })

  it('clears value with an accessible clear button', async () => {
    const wrapper = mount(TuffInput, {
      props: {
        modelValue: 'hello',
        clearable: true,
      },
    })

    const clear = wrapper.find('.tx-input__clear')
    expect(clear.element.tagName).toBe('BUTTON')
    expect(clear.attributes('aria-label')).toBe('Clear input')

    await clear.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([''])
    expect(wrapper.emitted('input')?.[0]).toEqual([''])
    expect(wrapper.emitted('clear')).toHaveLength(1)
  })

  it('blocks clear when disabled or readonly', async () => {
    const disabled = mount(TuffInput, {
      props: {
        modelValue: 'disabled',
        clearable: true,
        disabled: true,
      },
    })
    expect(disabled.find('.tx-input__clear').exists()).toBe(false)
    disabled.vm.clear()
    expect(disabled.emitted('update:modelValue')).toBeUndefined()

    const readonly = mount(TuffInput, {
      props: {
        modelValue: 'readonly',
        clearable: true,
        readonly: true,
      },
    })
    expect(readonly.find('.tx-input__clear').exists()).toBe(false)
    readonly.vm.clear()
    expect(readonly.emitted('update:modelValue')).toBeUndefined()
  })

  it('announces CapsLock through a localizable status region', async () => {
    const wrapper = mount(TuffInput, {
      props: { type: 'password', capsLockText: '大写锁定已开启' },
    })
    const input = wrapper.find('input')
    await input.trigger('focus')
    // CapsLock detection reads getModifierState on the keydown event; jsdom's default
    // returns false, so dispatch a real event with the modifier reported active.
    const event = new KeyboardEvent('keydown', { bubbles: true })
    Object.defineProperty(event, 'getModifierState', { value: () => true })
    input.element.dispatchEvent(event)
    await wrapper.vm.$nextTick()

    const caps = wrapper.find('.tx-input__capslock')
    expect(caps.exists()).toBe(true)
    expect(caps.attributes('role')).toBe('status')
    expect(caps.attributes('aria-live')).toBe('polite')
    expect(caps.attributes('aria-label')).toBe('大写锁定已开启')
    expect(caps.attributes('title')).toBe('大写锁定已开启')
  })

  it('renders prefix and suffix slots before icon props', () => {
    const wrapper = mount(TuffInput, {
      props: {
        prefixIcon: 'i-carbon-search',
        suffixIcon: 'i-carbon-user',
      },
      slots: {
        prefix: '<span class="prefix-slot">P</span>',
        suffix: '<span class="suffix-slot">S</span>',
      },
    })

    expect(wrapper.find('.prefix-slot').exists()).toBe(true)
    expect(wrapper.find('.suffix-slot').exists()).toBe(true)
    expect(wrapper.find('.tx-input__icon--prefix').exists()).toBe(false)
    expect(wrapper.find('.tx-input__icon--suffix').exists()).toBe(false)
  })
})
