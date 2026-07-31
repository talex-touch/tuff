import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
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

  it('keeps a single roving tab stop on the selected radio', async () => {
    const wrapper = mountRadioGroup() // 'a' selected, 'b' disabled, 'c' enabled
    await nextTick()
    const radios = wrapper.findAll('[role="radio"]')

    // Only the selected radio is Tab-reachable; the rest leave the tab order so a
    // single Tab enters the group and arrow keys move within it.
    expect(radios[0].attributes('tabindex')).toBe('0')
    expect(radios[1].attributes('tabindex')).toBe('-1')
    expect(radios[2].attributes('tabindex')).toBe('-1')
  })

  it('falls back to the first enabled radio for the tab stop when nothing is selected', async () => {
    const wrapper = mount({
      components: { TxRadio, TxRadioGroup },
      data: () => ({ value: undefined }),
      template: `
        <TxRadioGroup v-model="value" type="standard">
          <TxRadio value="a" label="A" disabled />
          <TxRadio value="b" label="B" />
          <TxRadio value="c" label="C" />
        </TxRadioGroup>
      `,
    })
    await nextTick()
    const radios = wrapper.findAll('[role="radio"]')

    // 'a' is disabled, so the first enabled radio 'b' holds the single tab stop.
    expect(radios[0].attributes('tabindex')).toBe('-1')
    expect(radios[1].attributes('tabindex')).toBe('0')
    expect(radios[2].attributes('tabindex')).toBe('-1')
  })
})

describe('txRadio standalone', () => {
  it('emits click and renders the checked state without a group', async () => {
    const wrapper = mount(TxRadio, {
      props: { value: 'solo', label: 'Solo' },
    })
    const radio = wrapper.find('[role="radio"]')

    expect(radio.attributes('aria-checked')).toBe('false')

    await radio.trigger('click')

    expect(wrapper.emitted('click')?.[0]).toEqual(['solo'])
    expect(radio.attributes('aria-checked')).toBe('true')
    expect(radio.classes()).toContain('is-checked')
  })

  it('supports v-model through the modelValue prop', async () => {
    const wrapper = mount(TxRadio, {
      props: { value: 'solo', modelValue: false },
    })
    const radio = wrapper.find('[role="radio"]')

    expect(radio.attributes('aria-checked')).toBe('false')

    await radio.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
    expect(wrapper.emitted('click')?.[0]).toEqual(['solo'])
  })

  it('leaves a standalone radio with native button focus (no roving tabindex)', () => {
    const wrapper = mount(TxRadio, { props: { value: 'solo', label: 'Solo' } })
    // Without a group there is no roving behavior; the native button stays tabbable.
    expect(wrapper.find('[role="radio"]').attributes('tabindex')).toBeUndefined()
  })

  it('stays inert when disabled standalone', async () => {
    const wrapper = mount(TxRadio, {
      props: { value: 'solo', disabled: true },
    })

    await wrapper.find('[role="radio"]').trigger('click')

    expect(wrapper.emitted('click')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
