import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ClipboardActionBar from './ClipboardActionBar.vue'

describe('ClipboardActionBar', () => {
  it('disables all actions when no item is selected', () => {
    const wrapper = mount(ClipboardActionBar, {
      props: {
        item: null,
        copyPending: false,
        applyPending: false,
        favoritePending: false,
        deletePending: false,
      },
    })

    expect(wrapper.get('[data-testid="copy-button"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="apply-button"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="favorite-button"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="delete-button"]').attributes('disabled')).toBeDefined()
  })

  it('renders default paste label', () => {
    const wrapper = mount(ClipboardActionBar, {
      props: {
        item: {
          id: 1,
          type: 'text',
          content: 'hello',
        },
        copyPending: false,
        applyPending: false,
        favoritePending: false,
        deletePending: false,
      },
    })

    expect(wrapper.get('[data-testid="apply-button"]').text()).toContain('粘贴到当前应用')
  })
})
