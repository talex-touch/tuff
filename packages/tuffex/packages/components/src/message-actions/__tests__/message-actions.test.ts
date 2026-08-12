import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxMessageActions from '../src/TxMessageActions.vue'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function stubClipboard(): ReturnType<typeof vi.fn> {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.assign(navigator, { clipboard: { writeText } })
  return writeText
}

describe('txMessageActions', () => {
  it('renders nothing actionable without props', () => {
    const wrapper = mount(TxMessageActions)
    expect(wrapper.findAll('button')).toHaveLength(0)
  })

  it('copies its text and flips to the copied state', async () => {
    vi.useFakeTimers()
    const writeText = stubClipboard()
    const wrapper = mount(TxMessageActions, { props: { copyText: 'hello' } })

    await wrapper.find('button').trigger('click')
    expect(writeText).toHaveBeenCalledWith('hello')
    expect(wrapper.emitted('copy')).toEqual([['hello']])
    expect(wrapper.find('button').classes()).toContain('is-copied')

    vi.advanceTimersByTime(1300)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('button').classes()).not.toContain('is-copied')
  })

  it('still emits copy when the clipboard is denied', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    const wrapper = mount(TxMessageActions, { props: { copyText: 'hi' } })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('copy')).toEqual([['hi']])
  })

  it('emits regenerate', async () => {
    stubClipboard()
    const wrapper = mount(TxMessageActions, { props: { regenerable: true } })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('regenerate')).toHaveLength(1)
  })

  it('drops the entrance animation when appear is off', () => {
    const wrapper = mount(TxMessageActions, { props: { appear: false } })
    expect(wrapper.classes()).not.toContain('has-appear')
  })

  it('names the toolbar and keeps it to a single tab stop', async () => {
    const wrapper = mount(TxMessageActions, {
      attachTo: document.body,
      props: { copyText: 'hello', regenerable: true },
    })
    await nextTick()

    // role="toolbar" needs a name, and the group is one tab stop.
    expect(wrapper.attributes('aria-label')).toBe('Message actions')

    const buttons = wrapper.findAll<HTMLButtonElement>('button')
    expect(buttons.map(b => b.element.tabIndex)).toEqual([0, -1])

    wrapper.unmount()
  })

  it('accepts a localized toolbar label', async () => {
    const wrapper = mount(TxMessageActions, {
      props: { copyText: 'hello', label: '消息操作' },
    })

    expect(wrapper.attributes('aria-label')).toBe('消息操作')
  })

  it('moves focus between controls with arrow keys', async () => {
    const wrapper = mount(TxMessageActions, {
      attachTo: document.body,
      props: { copyText: 'hello', regenerable: true },
    })
    await nextTick()

    const buttons = wrapper.findAll<HTMLButtonElement>('button')
    buttons[0]!.element.focus()

    await wrapper.trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(buttons[1]!.element)

    await wrapper.trigger('keydown', { key: 'ArrowRight' })
    // Wraps, as the toolbar pattern specifies.
    expect(document.activeElement).toBe(buttons[0]!.element)

    await wrapper.trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(buttons[1]!.element)

    wrapper.unmount()
  })

  it('includes slotted controls in the roving order', async () => {
    const wrapper = mount(TxMessageActions, {
      attachTo: document.body,
      props: { copyText: 'hello' },
      slots: { default: '<button type="button" class="extra">Extra</button>' },
    })
    await nextTick()

    const buttons = wrapper.findAll<HTMLButtonElement>('button')
    expect(buttons).toHaveLength(2)
    expect(buttons.map(b => b.element.tabIndex)).toEqual([0, -1])

    buttons[0]!.element.focus()
    await wrapper.trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(wrapper.find('.extra').element)

    wrapper.unmount()
  })
})
