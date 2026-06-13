import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ClipboardActionBar from './ClipboardActionBar.vue'

describe('clipboardActionBar', () => {
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

  it('renders pending labels for active actions', () => {
    const wrapper = mount(ClipboardActionBar, {
      props: {
        item: {
          id: 1,
          type: 'text',
          content: 'hello',
          isFavorite: true,
        },
        copyPending: true,
        applyPending: true,
        favoritePending: true,
        deletePending: true,
      },
    })

    expect(wrapper.get('[data-testid="copy-button"]').text()).toContain('复制中')
    expect(wrapper.get('[data-testid="apply-button"]').text()).toContain('粘贴中')
    expect(wrapper.get('[data-testid="favorite-button"]').text()).toContain('处理中')
    expect(wrapper.get('[data-testid="delete-button"]').text()).toContain('删除中')
  })

  it('emits action events from enabled buttons', async () => {
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

    await wrapper.get('[data-testid="copy-button"]').trigger('click')
    await wrapper.get('[data-testid="apply-button"]').trigger('click')
    await wrapper.get('[data-testid="favorite-button"]').trigger('click')
    await wrapper.get('[data-testid="delete-button"]').trigger('click')

    expect(wrapper.emitted('copy')).toHaveLength(1)
    expect(wrapper.emitted('apply')).toHaveLength(1)
    expect(wrapper.emitted('toggleFavorite')).toHaveLength(1)
    expect(wrapper.emitted('delete')).toHaveLength(1)
  })
})
