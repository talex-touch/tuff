// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createThemeDetailRoute } from './section-route'
import SectionItem from './SectionItem.vue'

const state = vi.hoisted(() => ({
  push: vi.fn()
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: state.push
  })
}))

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
    const action = wrapper.get('button.SectionItem-Action')

    expect(action.attributes('type')).toBe('button')
    expect(action.attributes('aria-pressed')).toBe('false')

    await action.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['filter'])
  })

  it('opens the detail route from the inner button', async () => {
    const wrapper = mountSectionItem()

    await wrapper.get('button.SectionItem-Bar').trigger('click')

    expect(state.push).toHaveBeenCalledWith(createThemeDetailRoute('filter'))
  })

  it('does not allow disabled keyboard selection', async () => {
    const wrapper = mountSectionItem(true)
    const action = wrapper.get('button.SectionItem-Action')

    expect(action.attributes('disabled')).toBeDefined()
    expect(wrapper.get('button.SectionItem-Bar').attributes('disabled')).toBeDefined()

    await action.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
