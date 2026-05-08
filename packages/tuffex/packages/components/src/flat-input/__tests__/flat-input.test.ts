import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import FlatInput, { FlatInput as NamedFlatInput } from '../index'

describe('flatInput', () => {
  it('renders text input with default model value and placeholder', () => {
    const wrapper = mount(FlatInput, {
      props: {
        placeholder: 'Type here',
      },
    })

    const input = wrapper.find('input')
    expect(wrapper.classes()).toContain('none-prefix')
    expect(wrapper.attributes('tabindex')).toBeUndefined()
    expect(input.element.value).toBe('')
    expect(input.attributes('placeholder')).toBe('Type here')
    expect(input.attributes('type')).toBe('text')
  })

  it('emits update:modelValue from text input', async () => {
    const wrapper = mount(FlatInput, {
      props: {
        modelValue: 'old',
      },
    })

    await wrapper.find('input').setValue('new')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['new'])
  })

  it('renders icon prefix without requiring a prefix slot', () => {
    const wrapper = mount(FlatInput, {
      props: {
        icon: 'i-ri-search-line',
      },
    })

    expect(wrapper.classes()).not.toContain('none-prefix')
    expect(wrapper.find('.flat-input__prefix').exists()).toBe(true)
    expect(wrapper.find('.i-ri-search-line').exists()).toBe(true)
  })

  it('lets the default slot replace icon prefix content', () => {
    const wrapper = mount(FlatInput, {
      props: {
        icon: 'i-ri-search-line',
      },
      slots: {
        default: '<strong class="custom-prefix">P</strong>',
      },
    })

    expect(wrapper.find('.custom-prefix').exists()).toBe(true)
    expect(wrapper.find('.i-ri-search-line').exists()).toBe(false)
  })

  it('renders textarea mode and nonWin class switch', async () => {
    const wrapper = mount(FlatInput, {
      props: {
        area: true,
        nonWin: true,
        modelValue: 'line',
      },
    })

    expect(wrapper.classes()).toContain('area')
    expect(wrapper.classes()).not.toContain('win')
    expect(wrapper.find('textarea').element.value).toBe('line')

    await wrapper.find('textarea').setValue('next')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['next'])
  })

  it('renders password input and shows Caps Lock hint only in password mode', async () => {
    const password = mount(FlatInput, {
      props: {
        password: true,
      },
    })

    expect(password.find('input').attributes('type')).toBe('password')
    await password.find('input').trigger('keydown', {
      keyCode: 65,
      shiftKey: false,
    })
    expect(password.find('.flat-input__caps').exists()).toBe(true)

    const text = mount(FlatInput)
    await text.find('input').trigger('keydown', {
      keyCode: 65,
      shiftKey: false,
    })
    expect(text.find('.flat-input__caps').exists()).toBe(false)
  })

  it('registers the component through install', () => {
    const app = createApp({})
    const component = vi.spyOn(app, 'component')

    app.use(NamedFlatInput)

    expect(component).toHaveBeenCalledWith('FlatInput', NamedFlatInput)
  })
})
