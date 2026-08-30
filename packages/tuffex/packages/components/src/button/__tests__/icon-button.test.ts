import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TxIconButton from '../src/icon-button.vue'

describe('txIconButton accessible name', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('warns when an icon-only button has no accessible name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    mount(TxIconButton, { props: { icon: 'i-carbon-close' } })

    // The icon is aria-hidden, so with neither a label nor slot content the button
    // is unnamed — pre-fix no warning fired at all.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[TxIconButton]'))
  })

  it('does not warn when a label names the button', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    mount(TxIconButton, { props: { icon: 'i-carbon-close', label: 'Close' } })

    expect(warn).not.toHaveBeenCalled()
  })

  it('does not warn when default slot content names the button', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    mount(TxIconButton, {
      slots: { default: '<span>Menu</span>' },
    })

    expect(warn).not.toHaveBeenCalled()
  })
})

describe('txIconButton status', () => {
  it.each([
    { status: 'success', className: 'tx-icon-button--status-success' },
    { status: 'warning', className: 'tx-icon-button--status-warning' },
    { status: 'danger', className: 'tx-icon-button--status-danger' },
    { status: 'info', className: 'tx-icon-button--status-info' },
  ] as const)('renders the $status semantic status class', ({ status, className }) => {
    const wrapper = mount(TxIconButton, {
      props: { label: 'Status action', status },
    })

    expect(wrapper.classes()).toContain(className)
  })

  it('keeps omitted and undefined status neutral', () => {
    const neutralButtons = [
      mount(TxIconButton, { props: { label: 'Neutral action' } }),
      mount(TxIconButton, { props: { label: 'Undefined status action', status: undefined } }),
    ]

    for (const wrapper of neutralButtons) {
      expect(wrapper.classes()).not.toContain('tx-icon-button--status-success')
      expect(wrapper.classes()).not.toContain('tx-icon-button--status-warning')
      expect(wrapper.classes()).not.toContain('tx-icon-button--status-danger')
      expect(wrapper.classes()).not.toContain('tx-icon-button--status-info')
    }
  })
})
