import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ClipboardActionBar from './ClipboardActionBar.vue'

describe('clipboardActionBar', () => {
  it('disables all actions when no item is selected', () => {
    const wrapper = mount(ClipboardActionBar, {
      props: {
        item: null,
        primaryActionLabel: '复制',
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
        primaryActionLabel: '复制',
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
        primaryActionLabel: '复制',
        copyPending: true,
        applyPending: true,
        favoritePending: true,
        deletePending: true,
      },
    })

    expect(wrapper.get('[data-testid="copy-button"]').text()).toContain('处理中')
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
        primaryActionLabel: '复制',
        copyPending: false,
        applyPending: false,
        favoritePending: false,
        deletePending: false,
      },
    })

    await wrapper.get('[data-testid="copy-button"]').trigger('click')
    await wrapper.get('[data-testid="apply-button"]').trigger('click')
    await wrapper.get('[data-testid="favorite-button"]').trigger('click')

    expect(wrapper.emitted('primary')).toHaveLength(1)
    expect(wrapper.emitted('apply')).toHaveLength(1)
    expect(wrapper.emitted('toggleFavorite')).toHaveLength(1)
    // 删除单独测：它现在要按两次。
    expect(wrapper.emitted('delete')).toBeUndefined()
  })

  /**
   * 删除是这个面板里唯一不可撤销的动作，所以它要按两次。第一次只是把按钮变成
   * 待确认态——这条断言的重点是「第一次什么都没发生」。
   */
  it('does not delete on the first press', async () => {
    const wrapper = mount(ClipboardActionBar, {
      props: {
        item: { id: 1, type: 'text', content: 'hello' },
        primaryActionLabel: '复制',
        copyPending: false,
        applyPending: false,
        favoritePending: false,
        deletePending: false,
      },
    })

    const button = wrapper.get('[data-testid="delete-button"]')
    await button.trigger('click')

    expect(wrapper.emitted('delete')).toBeUndefined()
    expect(button.text()).toContain('再按一次删除')
    expect(button.attributes('aria-label')).toBe('再按一次删除')

    await button.trigger('click')
    expect(wrapper.emitted('delete')).toHaveLength(1)
    // 删完退回原状，否则下一条记录的第一次点击就直接删了。
    expect(button.text()).toContain('删除')
    expect(button.text()).not.toContain('再按一次')
  })

  /** 待确认态不能跟着选中项走：换一条记录后必须回到需要两次点击。 */
  it('disarms when the selection changes', async () => {
    const wrapper = mount(ClipboardActionBar, {
      props: {
        item: { id: 1, type: 'text', content: 'hello' },
        primaryActionLabel: '复制',
        copyPending: false,
        applyPending: false,
        favoritePending: false,
        deletePending: false,
      },
    })

    const button = wrapper.get('[data-testid="delete-button"]')
    await button.trigger('click')
    expect(button.text()).toContain('再按一次删除')

    await wrapper.setProps({ item: { id: 2, type: 'text', content: 'other' } })
    expect(button.text()).not.toContain('再按一次')

    await button.trigger('click')
    expect(wrapper.emitted('delete')).toBeUndefined()
  })
})
