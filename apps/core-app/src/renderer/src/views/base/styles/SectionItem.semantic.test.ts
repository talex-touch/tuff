// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SectionItem from './SectionItem.vue'

function mountSectionItem(disabled = false) {
  return mount(SectionItem, {
    props: {
      title: 'filter',
      label: 'Filter',
      disabled,
      modelValue: 'pure'
    },
    global: {
      directives: {
        sharedElement: {}
      }
    }
  })
}

describe('SectionItem semantics', () => {
  it('uses a native button for card selection', async () => {
    const wrapper = mountSectionItem()
    const action = wrapper.get('button.SectionItem-Display')

    expect(action.attributes('type')).toBe('button')
    expect(action.attributes('aria-pressed')).toBe('false')

    await action.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['filter'])
  })

  // The label row used to router.push to /styles/theme, which swapped the settings page
  // for a blank one. Both halves of the tile select now, so this asserts selection and
  // needs no vue-router mock.
  it('selects from the label row rather than navigating', async () => {
    const wrapper = mountSectionItem()
    const bar = wrapper.get('button.SectionItem-Bar')

    expect(bar.attributes('aria-pressed')).toBe('false')

    await bar.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['filter'])
  })

  it('does not allow disabled keyboard selection', async () => {
    const wrapper = mountSectionItem(true)
    const action = wrapper.get('button.SectionItem-Display')

    expect(action.attributes('disabled')).toBeDefined()
    expect(wrapper.get('button.SectionItem-Bar').attributes('disabled')).toBeDefined()

    await action.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
