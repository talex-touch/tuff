// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FlatCodeInput from './FlatCodeInput.vue'

/**
 * The keypad rendered each digit as a click-only span -- no role, no tabindex, no key handler --
 * and conveyed selection through a CSS class alone, so a keyboard or screen-reader user could
 * neither operate it nor tell what was selected (#509).
 */

describe('FlatCodeInput keypad accessibility', () => {
  it('renders nine focusable buttons rather than spans', () => {
    const items = mount(FlatCodeInput).findAll('.FlatCodeInput-Item')

    expect(items).toHaveLength(9)
    for (const item of items) expect(item.element.tagName).toBe('BUTTON')
  })

  it('exposes selection through aria-pressed, not only a class', async () => {
    const wrapper = mount(FlatCodeInput)
    const third = wrapper.findAll('.FlatCodeInput-Item')[2]!

    expect(third.attributes('aria-pressed')).toBe('false')

    await third.trigger('click')

    expect(third.attributes('aria-pressed')).toBe('true')
  })

  it('reflects deselection back into aria-pressed', async () => {
    // Each digit toggles, so the state has to travel both ways or the announcement goes stale.
    const wrapper = mount(FlatCodeInput)
    const first = wrapper.findAll('.FlatCodeInput-Item')[0]!

    await first.trigger('click')
    await first.trigger('click')

    expect(first.attributes('aria-pressed')).toBe('false')
  })

  it('still emits the joined code once six digits are entered', async () => {
    const wrapper = mount(FlatCodeInput)
    const items = wrapper.findAll('.FlatCodeInput-Item')

    for (const index of [0, 1, 2, 3, 4, 5]) await items[index]!.trigger('click')

    expect(wrapper.emitted('input')?.[0]).toEqual(['123456'])
  })

  it('does not claim to be disabled, because the handler ignores that class', () => {
    // The `disabled` class is visual only -- inputCode never checks it, so mapping it to
    // aria-disabled would announce behaviour the component does not have.
    const wrapper = mount(FlatCodeInput)
    const items = wrapper.findAll('.FlatCodeInput-Item')

    for (const item of items) expect(item.attributes('aria-disabled')).toBeUndefined()
  })
})
