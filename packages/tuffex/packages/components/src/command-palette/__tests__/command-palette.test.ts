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
})
