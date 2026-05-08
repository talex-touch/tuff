import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxFlatRadio from '../src/TxFlatRadio.vue'
import TxFlatRadioItem from '../src/TxFlatRadioItem.vue'

function mountSingleFlatRadio(options: { disabled?: boolean, initial?: string } = {}) {
  return mount({
    components: { TxFlatRadio, TxFlatRadioItem },
    data: () => ({ value: options.initial ?? 'a' }),
    template: `
      <TxFlatRadio v-model="value" :disabled="${options.disabled ? 'true' : 'false'}">
        <TxFlatRadioItem value="a" label="Option A" />
        <TxFlatRadioItem value="b" label="Option B" disabled />
        <TxFlatRadioItem value="c" label="Option C" />
      </TxFlatRadio>
    `,
  })
}

function mountMultipleFlatRadio() {
  return mount({
    components: { TxFlatRadio, TxFlatRadioItem },
    data: () => ({ value: ['a'] }),
    template: `
      <TxFlatRadio v-model="value" multiple>
        <TxFlatRadioItem value="a" label="Option A" />
        <TxFlatRadioItem value="b" label="Option B" disabled />
        <TxFlatRadioItem value="c" label="Option C" />
      </TxFlatRadio>
    `,
  })
}

describe('txFlatRadio', () => {
  it('renders radiogroup semantics for single selection', () => {
    const wrapper = mountSingleFlatRadio()
    const root = wrapper.find('.tx-flat-radio')
    const items = wrapper.findAll('.tx-flat-radio-item')

    expect(root.attributes('role')).toBe('radiogroup')
    expect(root.attributes('aria-disabled')).toBe('false')
    expect(root.attributes('tabindex')).toBe('0')
    expect(items[0].attributes('role')).toBe('radio')
    expect(items[0].attributes('aria-checked')).toBe('true')
    expect(items[1].attributes('disabled')).toBeDefined()
  })

  it('moves single selection with arrow keys and skips disabled items', async () => {
    const wrapper = mountSingleFlatRadio()
    const root = wrapper.findComponent(TxFlatRadio)

    await root.trigger('keydown', { key: 'ArrowRight' })
    expect((wrapper.vm as any).value).toBe('c')

    await root.trigger('keydown', { key: 'ArrowRight' })
    expect((wrapper.vm as any).value).toBe('a')

    await root.trigger('keydown', { key: 'ArrowLeft' })
    expect((wrapper.vm as any).value).toBe('c')
  })

  it('supports Home and End keyboard selection', async () => {
    const wrapper = mountSingleFlatRadio({ initial: 'c' })
    const root = wrapper.findComponent(TxFlatRadio)

    await root.trigger('keydown', { key: 'Home' })
    expect((wrapper.vm as any).value).toBe('a')

    await root.trigger('keydown', { key: 'End' })
    expect((wrapper.vm as any).value).toBe('c')
  })

  it('does not move selection when disabled', async () => {
    const wrapper = mountSingleFlatRadio({ disabled: true })
    const root = wrapper.findComponent(TxFlatRadio)

    await root.trigger('keydown', { key: 'ArrowRight' })

    expect((wrapper.vm as any).value).toBe('a')
    expect(wrapper.find('.tx-flat-radio').attributes('tabindex')).toBe('-1')
  })

  it('toggles the focused item with Enter and Space in multiple mode', async () => {
    const wrapper = mountMultipleFlatRadio()
    const root = wrapper.findComponent(TxFlatRadio)

    await root.trigger('keydown', { key: 'ArrowRight' })
    await root.trigger('keydown', { key: 'Enter' })
    expect((wrapper.vm as any).value).toEqual(['a', 'c'])

    await root.trigger('keydown', { key: ' ' })
    expect((wrapper.vm as any).value).toEqual(['a'])
  })
})
