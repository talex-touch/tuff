// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FlatInput from './FlatInput.vue'

describe('FlatInput events', () => {
  it.each([
    { area: false, selector: 'input' },
    { area: true, selector: 'textarea' }
  ])(
    'forwards native focus lifecycle and preserves v-model for $selector',
    async ({ area, selector }) => {
      const wrapper = mount(FlatInput, {
        props: {
          area,
          modelValue: 'initial'
        }
      })
      const field = wrapper.get<HTMLInputElement | HTMLTextAreaElement>(selector)

      await field.trigger('focus')
      await field.setValue('updated')
      await field.trigger('blur')

      const focusEvent = wrapper.emitted('focus')?.[0]?.[0]
      const blurEvent = wrapper.emitted('blur')?.[0]?.[0]

      expect(wrapper.emitted('focus')).toHaveLength(1)
      expect(focusEvent).toBeInstanceOf(FocusEvent)
      expect((focusEvent as FocusEvent).target).toBe(field.element)
      expect(wrapper.emitted('blur')).toHaveLength(1)
      expect(blurEvent).toBeInstanceOf(FocusEvent)
      expect((blurEvent as FocusEvent).target).toBe(field.element)
      expect(wrapper.emitted('update:modelValue')).toEqual([['updated']])

      await wrapper.setProps({ modelValue: 'parent update' })
      expect(field.element.value).toBe('parent update')
    }
  )
})
