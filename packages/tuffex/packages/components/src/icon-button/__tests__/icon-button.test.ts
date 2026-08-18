import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TxIconButton from '../src/TxIconButton.vue'

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
