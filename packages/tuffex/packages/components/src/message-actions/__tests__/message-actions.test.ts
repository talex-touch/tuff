import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

  it('reads aloud with toggle semantics across its three states', async () => {
    const wrapper = mount(TxMessageActions, {
      props: { speakable: true, speakState: 'idle' },
    })
    const btn = wrapper.find('button')
    expect(btn.attributes('aria-label')).toBe('Read aloud')

    await btn.trigger('click')
    expect(wrapper.emitted('speak')).toHaveLength(1)

    await wrapper.setProps({ speakState: 'loading' })
    expect(wrapper.find('.tx-message-actions__spin').exists()).toBe(true)

    await wrapper.setProps({ speakState: 'speaking' })
    expect(wrapper.find('button').attributes('aria-label')).toBe('Stop reading')
    expect(wrapper.find('button').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('button').classes()).toContain('is-speaking')
  })

  it('drops the entrance animation when appear is off', () => {
    const wrapper = mount(TxMessageActions, { props: { appear: false } })
    expect(wrapper.classes()).not.toContain('has-appear')
  })
})
