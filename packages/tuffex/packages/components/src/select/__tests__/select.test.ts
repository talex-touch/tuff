import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import TxSelect from '../src/TxSelect.vue'
import TxSelectItem from '../src/TxSelectItem.vue'

const PopoverStub = defineComponent({
  name: 'TxPopover',
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  template: '<div><slot name="reference" /><div><slot /></div></div>',
})

function mountSelect(props: Record<string, unknown> = {}) {
  return mount({
    components: { TxSelect, TxSelectItem },
    data: () => ({ value: props.modelValue ?? '' }),
    template: `
      <TxSelect v-model="value" v-bind="props" @search="$emit('search', $event)">
        <TxSelectItem value="alpha" label="Alpha" />
        <TxSelectItem value="beta" label="Beta" disabled />
        <TxSelectItem value="gamma">Gamma Slot</TxSelectItem>
      </TxSelect>
    `,
    setup() {
      return { props }
    },
  }, {
    global: {
      stubs: { TxPopover: PopoverStub },
    },
  })
}

describe('txSelect', () => {
  it('selects enabled options and emits v-model/change', async () => {
    const wrapper = mount(TxSelect, {
      slots: {
        default: '<TxSelectItem value="alpha" label="Alpha" />',
      },
      global: {
        stubs: { TxPopover: PopoverStub },
        components: { TxSelectItem },
      },
    })

    await wrapper.findComponent(TxSelectItem).trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['alpha'])
    expect(wrapper.emitted('change')?.[0]).toEqual(['alpha'])
  })

  it('does not select disabled options', async () => {
    const wrapper = mount(TxSelect, {
      global: {
        stubs: { TxPopover: PopoverStub },
        components: { TxSelectItem },
      },
      slots: {
        default: '<TxSelectItem value="beta" label="Beta" disabled />',
      },
    })

    await wrapper.findComponent(TxSelectItem).trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('change')).toBeUndefined()
  })

  it('filters local options when searchable', async () => {
    const wrapper = mountSelect({ searchable: true })
    const input = wrapper.find('.tuff-select__search input')

    await input.setValue('Gamma')

    const items = wrapper.findAllComponents(TxSelectItem)
    expect(items[0].isVisible()).toBe(false)
    expect(items[2].isVisible()).toBe(true)
  })

  it('emits search while remote editable input is open', async () => {
    const wrapper = mount(TxSelect, {
      props: {
        remote: true,
        editable: true,
      },
      global: {
        stubs: { TxPopover: PopoverStub },
        components: { TxSelectItem },
      },
      slots: {
        default: '<TxSelectItem value="alpha" label="Alpha" />',
      },
    })

    const triggerInput = wrapper.find('.tuff-select__trigger input')
    await triggerInput.trigger('focus')
    await triggerInput.setValue('query')

    expect(wrapper.emitted('search')?.[0]).toEqual(['query'])
  })
})
