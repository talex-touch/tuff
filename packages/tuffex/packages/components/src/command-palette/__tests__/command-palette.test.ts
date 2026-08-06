import type { CommandPaletteItem } from '../src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxCommandPalette from '../src/TxCommandPalette.vue'

describe('txCommandPalette', () => {
  it('filters and selects commands', async () => {
    const wrapper = mount(TxCommandPalette, {
      props: {
        modelValue: true,
        commands: [
          { id: 'open', title: 'Open File' },
          { id: 'close', title: 'Close File' },
        ],
      },
      global: {
        stubs: { Teleport: true },
      },
    })

    const input = wrapper.find('input')
    await input.setValue('open')
    await input.trigger('keydown', { key: 'Enter' })

    const emitted = wrapper.emitted('select') as Array<[CommandPaletteItem]> | undefined
    expect(emitted?.[0][0].id).toBe('open')
  })

  it('ignores enter key while composing', async () => {
    const wrapper = mount(TxCommandPalette, {
      props: {
        modelValue: true,
        commands: [
          { id: 'open', title: 'Open File' },
          { id: 'close', title: 'Close File' },
        ],
      },
      global: {
        stubs: { Teleport: true },
      },
    })

    const input = wrapper.find('input')
    await input.setValue('open')
    await input.trigger('keydown', { key: 'Enter', isComposing: true })

    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('highlights matched text', async () => {
    const wrapper = mount(TxCommandPalette, {
      props: {
        modelValue: true,
        commands: [
          { id: 'open', title: 'Open File', description: 'Quickly open files' },
        ],
      },
      global: {
        stubs: { Teleport: true },
      },
    })

    const input = wrapper.find('input')
    await input.setValue('open')

    const highlighted = wrapper.findAll('.tx-command-palette__highlight')
    expect(highlighted.length).toBeGreaterThan(0)
  })

  it('closes on Escape even when the filtered list is empty', async () => {
    const wrapper = mount(TxCommandPalette, {
      props: {
        modelValue: true,
        commands: [
          { id: 'open', title: 'Open File' },
        ],
      },
      global: {
        stubs: { Teleport: true },
      },
    })

    const input = wrapper.find('input')
    await input.setValue('zzz-no-match')

    expect(wrapper.findAll('.tx-command-palette__item')).toHaveLength(0)

    await input.trigger('keydown', { key: 'Escape' })

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])
  })

  it('renders custom empty and footer slots', () => {
    const wrapper = mount(TxCommandPalette, {
      props: {
        modelValue: true,
        commands: [],
        emptyText: 'No matches',
      },
      slots: {
        empty: '<div class="custom-empty">Try docs</div>',
        footer: '<div class="custom-footer">Powered</div>',
      },
      global: {
        stubs: { Teleport: true },
      },
    })

    expect(wrapper.find('.custom-empty').text()).toBe('Try docs')
    expect(wrapper.find('.custom-footer').text()).toBe('Powered')
  })

  it('emits an empty query update when the palette closes', async () => {
    const wrapper = mount(TxCommandPalette, {
      props: {
        modelValue: true,
        commands: [{ id: 'open', title: 'Open File' }],
      },
      global: {
        stubs: { Teleport: true },
      },
    })

    const input = wrapper.find('input')
    await input.setValue('open')
    expect(wrapper.emitted('update:query')?.at(-1)).toEqual(['open'])

    // Closing clears the internal query, so `update:query` listeners must be told
    // instead of retaining the last typed string.
    await wrapper.setProps({ modelValue: false })

    expect(wrapper.emitted('update:query')?.at(-1)).toEqual([''])
  })

  it('skips disabled commands during arrow navigation and marks them for AT', async () => {
    const wrapper = mount(TxCommandPalette, {
      props: {
        modelValue: true,
        commands: [
          { id: 'a', title: 'Alpha' },
          { id: 'b', title: 'Beta', disabled: true },
          { id: 'c', title: 'Gamma' },
        ],
      },
      global: {
        stubs: { Teleport: true },
      },
    })

    const options = wrapper.findAll('.tx-command-palette__item')
    // The disabled option is out of the tab order and announced as disabled.
    expect(options[1].attributes('aria-disabled')).toBe('true')
    expect(options[1].attributes('tabindex')).toBe('-1')
    expect(options[0].attributes('tabindex')).toBe('0')

    const input = wrapper.find('input')
    // ArrowDown from the first row skips the disabled second row onto the third.
    await input.trigger('keydown', { key: 'ArrowDown' })
    const afterMove = wrapper.findAll('.tx-command-palette__item')
    expect(afterMove[2].attributes('aria-selected')).toBe('true')
    expect(afterMove[1].attributes('aria-selected')).toBe('false')

    // Enter selects the highlighted enabled command, never the skipped disabled one.
    await input.trigger('keydown', { key: 'Enter' })
    const emitted = wrapper.emitted('select') as Array<[CommandPaletteItem]> | undefined
    expect(emitted?.[0][0].id).toBe('c')
  })

  it('exposes combobox/listbox semantics with an active-descendant', () => {
    const wrapper = mount(TxCommandPalette, {
      props: {
        modelValue: true,
        ariaLabel: 'Commands',
        commands: [
          { id: 'open', title: 'Open File' },
          { id: 'close', title: 'Close File' },
        ],
      },
      global: {
        stubs: { Teleport: true },
      },
    })

    const overlay = wrapper.find('.tx-command-palette__overlay')
    const input = wrapper.find('input')
    const list = wrapper.find('.tx-command-palette__list')
    const options = wrapper.findAll('.tx-command-palette__item')

    // Pre-fix none of these ARIA relationships existed: the dialog was unnamed, the
    // input was a bare textbox, and the list/items had no listbox/option roles.
    expect(overlay.attributes('aria-label')).toBe('Commands')
    expect(input.attributes('role')).toBe('combobox')
    expect(input.attributes('aria-controls')).toBe(list.attributes('id'))
    expect(list.attributes('role')).toBe('listbox')
    expect(options[0].attributes('role')).toBe('option')
    expect(options[0].attributes('aria-selected')).toBe('true')
    expect(options[1].attributes('aria-selected')).toBe('false')
    // The combobox points at the highlighted option while focus stays in the input.
    expect(input.attributes('aria-activedescendant')).toBe(options[0].attributes('id'))
  })

  it('accepts an inbound query prop, completing the v-model:query pair', async () => {
    const wrapper = mount(TxCommandPalette, {
      props: {
        modelValue: true,
        query: 'open',
        commands: [
          { id: 'open', title: 'Open File' },
          { id: 'close', title: 'Close File' },
        ],
      },
      global: { stubs: { Teleport: true } },
    })

    // update:query was emitted with no matching prop, so a parent could push
    // changes out but never feed one in.
    expect(wrapper.find('input').element.value).toBe('open')
    expect(wrapper.text()).toContain('Open File')
    expect(wrapper.text()).not.toContain('Close File')

    await wrapper.setProps({ query: 'close' })

    expect(wrapper.find('input').element.value).toBe('close')
    expect(wrapper.text()).toContain('Close File')
    expect(wrapper.text()).not.toContain('Open File')
  })

  it('stays uncontrolled when no query prop is supplied', async () => {
    const wrapper = mount(TxCommandPalette, {
      props: {
        modelValue: true,
        commands: [
          { id: 'open', title: 'Open File' },
          { id: 'close', title: 'Close File' },
        ],
      },
      global: { stubs: { Teleport: true } },
    })

    await wrapper.find('input').setValue('close')

    expect(wrapper.text()).toContain('Close File')
    expect(wrapper.emitted('update:query')?.at(-1)).toEqual(['close'])
  })
})
