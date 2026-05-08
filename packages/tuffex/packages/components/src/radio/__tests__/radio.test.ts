import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxRadio from '../src/TxRadio.vue'
import TxRadioGroup from '../src/TxRadioGroup.vue'

function mountRadioGroup(options: { disabled?: boolean, initial?: string } = {}) {
  return mount({
    components: { TxRadio, TxRadioGroup },
    data: () => ({ value: options.initial ?? 'a' }),
    template: `
      <TxRadioGroup v-model="value" type="standard" :disabled="${options.disabled ? 'true' : 'false'}">
        <TxRadio value="a" label="Option A" />
        <TxRadio value="b" label="Option B" disabled />
        <TxRadio value="c" label="Option C" />
      </TxRadioGroup>
    `,
  })
}

describe('txRadioGroup', () => {
  it('renders radiogroup semantics and selected radio state', () => {
    const wrapper = mountRadioGroup()
    const group = wrapper.find('[role="radiogroup"]')
    const radios = wrapper.findAll('[role="radio"]')

    expect(group.exists()).toBe(true)
    expect(group.attributes('aria-disabled')).toBe('false')
    expect(radios[0].attributes('aria-checked')).toBe('true')
    expect(radios[1].attributes('disabled')).toBeDefined()
  })

  it('moves selection with arrow keys and skips disabled radios', async () => {
    const wrapper = mountRadioGroup()
    const group = wrapper.findComponent(TxRadioGroup)

    await group.trigger('keydown', { key: 'ArrowRight' })
    expect((wrapper.vm as any).value).toBe('c')

    await group.trigger('keydown', { key: 'ArrowRight' })
    expect((wrapper.vm as any).value).toBe('a')

    await group.trigger('keydown', { key: 'ArrowLeft' })
    expect((wrapper.vm as any).value).toBe('c')
  })

  it('supports Home and End keyboard selection', async () => {
    const wrapper = mountRadioGroup({ initial: 'c' })
    const group = wrapper.findComponent(TxRadioGroup)

    await group.trigger('keydown', { key: 'Home' })
    expect((wrapper.vm as any).value).toBe('a')

    await group.trigger('keydown', { key: 'End' })
    expect((wrapper.vm as any).value).toBe('c')
  })

  it('does not move selection when the group is disabled', async () => {
    const wrapper = mountRadioGroup({ disabled: true })
    const group = wrapper.findComponent(TxRadioGroup)

    await group.trigger('keydown', { key: 'ArrowRight' })

    expect((wrapper.vm as any).value).toBe('a')
  })
})
