import type { FineTuneValues } from '../src/types'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import TxFineTuneCard from '../src/TxFineTuneCard.vue'
import TxFineTuneChipSelect from '../src/TxFineTuneChipSelect.vue'

// An open chip-select holds a capture-phase document pointerdown listener; left
// mounted it would keep closing itself over the next test's assertions.
enableAutoUnmount(afterEach)

const DEFAULTS: FineTuneValues = {
  layout: 'row',
  width: 324,
  height: 96,
  radius: 28,
  opacity: 100,
  type: null,
}

const TYPE_OPTIONS = [
  { value: 'seasonal', label: 'Seasonal' },
  { value: 'classic', label: 'Classic' },
  { value: 'limited', label: 'Limited' },
]

function mountCard(props: Record<string, unknown> = {}) {
  return mount(TxFineTuneCard, {
    props: { values: { ...DEFAULTS }, defaults: DEFAULTS, typeOptions: TYPE_OPTIONS, ...props },
    attachTo: document.body,
  })
}

describe('txFineTuneCard', () => {
  it('lays out the header, three layout options and four numeric fields', () => {
    const wrapper = mountCard()

    expect(wrapper.find('.tx-bui-fine-tune-card__title').text()).toBe('Fine-tune')
    expect(wrapper.findAll('.tx-flat-radio-item')).toHaveLength(3)
    expect(wrapper.findAll('.tx-bui-scrub-field')).toHaveLength(4)
    expect(wrapper.findAll('.tx-bui-scrub-field__handle').map(h => h.text()))
      .toEqual(['W', 'H', 'Radius', 'Opacity'])
  })

  it('shimmers Adjust until a value leaves its baseline, then flips to Edited', async () => {
    const wrapper = mountCard()

    expect(wrapper.find('.tx-bui-fine-tune-card__adjust-label').text()).toBe('Adjust')
    expect(wrapper.find('.tx-bui-fine-tune-card__edited').exists()).toBe(false)

    await wrapper.setProps({ values: { ...DEFAULTS, radius: 12 } })

    expect(wrapper.find('.tx-bui-fine-tune-card__edited').text()).toBe('Edited')
    expect(wrapper.find('.tx-bui-fine-tune-card__adjust').exists()).toBe(false)
  })

  it('mounts a fresh badge node on each flip so its pop-in replays', async () => {
    const wrapper = mountCard({ edited: false })
    const before = wrapper.find('.tx-bui-fine-tune-card__adjust').element

    await wrapper.setProps({ edited: true })
    const edited = wrapper.find('.tx-bui-fine-tune-card__edited').element
    expect(edited).not.toBe(before)

    await wrapper.setProps({ edited: false })
    expect(wrapper.find('.tx-bui-fine-tune-card__adjust').element).not.toBe(before)
  })

  it('lets the host force the header state', () => {
    const wrapper = mountCard({ edited: true })
    expect(wrapper.find('.tx-bui-fine-tune-card__edited').exists()).toBe(true)
  })

  it('stays on Adjust with no baseline to compare against', async () => {
    const wrapper = mountCard({ defaults: undefined, values: { ...DEFAULTS, width: 1 } })
    expect(wrapper.find('.tx-bui-fine-tune-card__adjust').exists()).toBe(true)
  })

  it('tints only the fields that moved off their baseline', async () => {
    const wrapper = mountCard({ values: { ...DEFAULTS, height: 120 } })
    const fields = wrapper.findAll('.tx-bui-scrub-field')

    expect(fields[0]!.classes()).not.toContain('is-active')
    expect(fields[1]!.classes()).toContain('is-active')
  })

  it('marks the layout choice on the radio group', () => {
    const wrapper = mountCard({ values: { ...DEFAULTS, layout: 'grid' } })
    const items = wrapper.findAll('.tx-flat-radio-item')

    expect(items[2]!.attributes('aria-checked')).toBe('true')
    expect(items[0]!.attributes('aria-checked')).toBe('false')
    expect(items.map(item => item.attributes('aria-label')))
      .toEqual(['row layout', 'col layout', 'grid layout'])
    expect(wrapper.find('.tx-flat-radio').attributes('role')).toBe('radiogroup')
  })

  it('overrides the radio geometry to the BUI ladder', () => {
    // TxFlatRadio sets these variables through its own :style binding. The card
    // relies on Vue merging fallthrough style last — if that order ever flips,
    // the control silently renders at tuffex's 24px `sm` height instead.
    const style = mountCard().find('.tx-flat-radio').attributes('style') ?? ''

    expect(style).toContain('--tx-flat-radio-height: 28px')
    expect(style).toContain('--tx-flat-radio-padding: 2px')
    expect(style).toContain('--tx-flat-radio-item-radius: 6px')
    expect(style).toContain('background: var(--tx-bui-field, #f2f2f3)')
  })

  it('emits the whole object plus the changed key when the layout changes', async () => {
    const wrapper = mountCard()

    await wrapper.findAll('.tx-flat-radio-item')[1]!.trigger('click')

    expect(wrapper.emitted('update:values')?.[0]).toEqual([{ ...DEFAULTS, layout: 'col' }])
    expect(wrapper.emitted('change')?.[0]).toEqual(['layout', 'col'])
  })

  it('routes a scrubbed field back through the same value object', async () => {
    const wrapper = mountCard()

    await wrapper.findAll('.tx-bui-scrub-field__handle')[2]!.trigger('keydown', { key: 'ArrowUp' })

    expect(wrapper.emitted('update:values')?.[0]).toEqual([{ ...DEFAULTS, radius: 29 }])
    expect(wrapper.emitted('change')?.[0]).toEqual(['radius', 29])
  })

  it('gives each numeric field its own bounds', () => {
    const wrapper = mountCard({ ranges: { radius: { min: 0, max: 12 } } })
    const handles = wrapper.findAll('.tx-bui-scrub-field__handle')

    expect(handles[0]!.attributes('aria-valuemin')).toBe('40')
    expect(handles[0]!.attributes('aria-valuemax')).toBe('999')
    expect(handles[2]!.attributes('aria-valuemax')).toBe('12')
    expect(handles[3]!.attributes('aria-valuetext')).toBe('100%')
  })

  it('renames fields and section headings for a non-English host', () => {
    const wrapper = mountCard({
      title: '风味卡片',
      layoutLabel: '布局',
      typeLabel: '类型',
      fieldLabels: { width: '宽', height: '高' },
    })

    expect(wrapper.find('.tx-bui-fine-tune-card__title').text()).toBe('风味卡片')
    expect(wrapper.find('.tx-bui-fine-tune-card__section-title').text()).toBe('布局')
    expect(wrapper.find('.tx-bui-fine-tune-card__footer-label').text()).toBe('类型')
    expect(wrapper.findAll('.tx-bui-scrub-field__handle')[0]!.text()).toBe('宽')
  })

  it('disables every control at once', () => {
    const wrapper = mountCard({ disabled: true })

    expect(wrapper.find('.tx-flat-radio').classes()).toContain('is-disabled')
    expect(wrapper.findAll('.tx-bui-scrub-field')[0]!.classes()).toContain('is-disabled')
    expect(wrapper.find('.tx-bui-chip-select__trigger').attributes('disabled')).toBeDefined()
  })

  it('picks a type through the footer select', async () => {
    const wrapper = mountCard()

    await wrapper.find('.tx-bui-chip-select__trigger').trigger('click')
    await wrapper.findAll('.tx-bui-chip-select__option')[1]!.trigger('click')

    expect(wrapper.emitted('update:values')?.[0]).toEqual([{ ...DEFAULTS, type: 'classic' }])
  })
})

describe('txFineTuneChipSelect', () => {
  function mountSelect(props: Record<string, unknown> = {}) {
    return mount(TxFineTuneChipSelect, {
      props: { modelValue: null, options: TYPE_OPTIONS, placeholder: 'Select type', ...props },
      attachTo: document.body,
    })
  }

  it('shows the placeholder until something is selected', async () => {
    const wrapper = mountSelect()
    expect(wrapper.find('.tx-bui-chip-select__value').text()).toBe('Select type')
    expect(wrapper.find('.tx-bui-chip-select__trigger').classes()).toContain('is-placeholder')

    await wrapper.setProps({ modelValue: 'limited' })
    expect(wrapper.find('.tx-bui-chip-select__value').text()).toBe('Limited')
    expect(wrapper.find('.tx-bui-chip-select__trigger').classes()).not.toContain('is-placeholder')
  })

  it('exposes the select-only combobox contract', async () => {
    const wrapper = mountSelect({ ariaLabel: 'Type' })
    const trigger = wrapper.find('.tx-bui-chip-select__trigger')

    expect(trigger.attributes('role')).toBe('combobox')
    expect(trigger.attributes('aria-haspopup')).toBe('listbox')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(trigger.attributes('aria-label')).toBe('Type')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)

    await trigger.trigger('click')

    expect(trigger.attributes('aria-expanded')).toBe('true')
    const listbox = wrapper.find('[role="listbox"]')
    expect(listbox.attributes('id')).toBe(trigger.attributes('aria-controls'))
    expect(wrapper.findAll('[role="option"]')).toHaveLength(3)
    expect(wrapper.findAll('[role="option"]')[0]!.attributes('aria-selected')).toBe('false')
  })

  it('walks the options with the arrow keys and reports the cursor', async () => {
    const wrapper = mountSelect()
    const trigger = wrapper.find('.tx-bui-chip-select__trigger')

    await trigger.trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
    const options = wrapper.findAll('[role="option"]')
    expect(trigger.attributes('aria-activedescendant')).toBe(options[0]!.attributes('id'))

    await trigger.trigger('keydown', { key: 'ArrowDown' })
    expect(trigger.attributes('aria-activedescendant')).toBe(options[1]!.attributes('id'))
    expect(wrapper.findAll('[role="option"]')[1]!.classes()).toContain('is-active')

    await trigger.trigger('keydown', { key: 'End' })
    expect(trigger.attributes('aria-activedescendant')).toBe(options[2]!.attributes('id'))

    await trigger.trigger('keydown', { key: 'ArrowDown' })
    expect(trigger.attributes('aria-activedescendant')).toBe(options[0]!.attributes('id'))
  })

  it('opens on the current selection rather than the first option', async () => {
    const wrapper = mountSelect({ modelValue: 'limited' })
    const trigger = wrapper.find('.tx-bui-chip-select__trigger')

    await trigger.trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.findAll('[role="option"]')[2]!.classes()).toContain('is-active')
    expect(wrapper.findAll('[role="option"]')[2]!.attributes('aria-selected')).toBe('true')
  })

  it('commits with Enter and closes back onto the trigger', async () => {
    const wrapper = mountSelect()
    const trigger = wrapper.find('.tx-bui-chip-select__trigger')

    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await trigger.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('update:modelValue')).toEqual([['classic']])
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
  })

  it('closes on Escape without changing the value', async () => {
    const wrapper = mountSelect()
    const trigger = wrapper.find('.tx-bui-chip-select__trigger')

    await trigger.trigger('click')
    await trigger.trigger('keydown', { key: 'Escape' })

    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(document.activeElement).toBe(trigger.element)
  })

  it('closes on a pointer press outside itself', async () => {
    const wrapper = mountSelect()

    await wrapper.find('.tx-bui-chip-select__trigger').trigger('click')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)

    // jsdom ships no PointerEvent constructor; the listener only reads target.
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
  })

  it('stays open for a press on its own menu', async () => {
    const wrapper = mountSelect()

    await wrapper.find('.tx-bui-chip-select__trigger').trigger('click')
    wrapper.find('.tx-bui-chip-select__option').element
      .dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
  })

  it('closes when focus leaves for another control', async () => {
    const wrapper = mountSelect()
    const outside = document.createElement('button')
    document.body.appendChild(outside)

    await wrapper.find('.tx-bui-chip-select__trigger').trigger('click')
    await wrapper.trigger('focusout', { relatedTarget: outside })

    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
    outside.remove()
  })

  it('ignores everything while disabled', async () => {
    const wrapper = mountSelect({ disabled: true })
    const trigger = wrapper.find('.tx-bui-chip-select__trigger')

    await trigger.trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
  })
})
