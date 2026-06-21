import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import TxSelect from '../src/TxSelect.vue'
import TxSelectItem from '../src/TxSelectItem.vue'

const PopoverStub = defineComponent({
  name: 'TxPopover',
  props: {
    modelValue: { type: Boolean, default: false },
    eager: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  template: '<div><slot name="reference" /><div v-if="modelValue || eager"><slot /></div></div>',
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

  it('reflects selected label before the dropdown is opened', async () => {
    const wrapper = mountSelect({ modelValue: 'gamma' })
    await nextTick()

    expect(wrapper.find('.tuff-select__trigger input').element.value).toBe('Gamma Slot')
  })

  it('supports direct options for selected labels without slot registration', async () => {
    const wrapper = mount(TxSelect, {
      props: {
        modelValue: 'beta',
        options: [
          { value: 'alpha', label: 'Alpha' },
          { value: 'beta', label: 'Beta' },
        ],
      },
      global: {
        stubs: { TxPopover: PopoverStub },
      },
    })

    expect(wrapper.find('.tuff-select__trigger input').element.value).toBe('Beta')

    await wrapper.setProps({
      options: [
        { value: 'gamma', label: 'Gamma' },
      ],
    })

    expect(wrapper.find('.tuff-select__trigger input').element.value).toBe('')
  })

  it('keeps selected state consistent for numeric string values', async () => {
    const wrapper = mount(TxSelect, {
      props: {
        modelValue: '1',
      },
      slots: {
        default: '<TxSelectItem :value="1" label="One" />',
      },
      global: {
        stubs: { TxPopover: PopoverStub },
        components: { TxSelectItem },
      },
    })
    await nextTick()

    expect(wrapper.find('.tuff-select__trigger input').element.value).toBe('One')
    expect(wrapper.findComponent(TxSelectItem).classes()).toContain('is-selected')
  })

  it('renders loading and empty states', async () => {
    const wrapper = mount(TxSelect, {
      props: {
        options: [],
        loading: true,
        loadingText: 'Searching',
        emptyText: 'Nothing',
      },
      global: {
        stubs: { TxPopover: PopoverStub },
      },
    })

    expect(wrapper.text()).toContain('Searching')

    await wrapper.setProps({ loading: false })

    expect(wrapper.text()).toContain('Nothing')
  })

  it('supports multiple tags and removing selected values', async () => {
    const wrapper = mount(TxSelect, {
      props: {
        multiple: true,
        modelValue: ['alpha', 'gamma'],
        options: [
          { value: 'alpha', label: 'Alpha' },
          { value: 'gamma', label: 'Gamma' },
        ],
      },
      global: {
        stubs: { TxPopover: PopoverStub },
      },
    })

    expect(wrapper.findAll('.tuff-select__tag-label').map(item => item.text())).toEqual(['Alpha', 'Gamma'])

    await wrapper.find('.tuff-select__tag-remove').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['gamma']])
  })

  it('toggles multiple direct options without closing into a scalar', async () => {
    const wrapper = mount(TxSelect, {
      props: {
        multiple: true,
        modelValue: ['alpha'],
        options: [
          { value: 'alpha', label: 'Alpha' },
          { value: 'beta', label: 'Beta' },
        ],
      },
      global: {
        stubs: { TxPopover: PopoverStub },
      },
    })

    await wrapper.findAll('.tuff-select__option')[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['alpha', 'beta']])

    await wrapper.setProps({ modelValue: ['alpha', 'beta'] })
    await wrapper.findAll('.tuff-select__option')[0].trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([['beta']])
  })

  it('creates custom multiple options from the inline input', async () => {
    const wrapper = mount(TxSelect, {
      props: {
        multiple: true,
        searchable: true,
        allowCreate: true,
        modelValue: [],
      },
      global: {
        stubs: { TxPopover: PopoverStub },
      },
    })

    const input = wrapper.find('.tuff-select__multi-input')
    await input.setValue('Delta')
    await input.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('create')?.[0]).toEqual([{ value: 'Delta', label: 'Delta' }])
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['Delta']])
  })

  it('renders grouped options and footer slot', () => {
    const wrapper = mount(TxSelect, {
      props: {
        options: [
          {
            label: 'Manager',
            options: [
              { value: 'jack', label: 'Jack' },
              { value: 'lucy', label: 'Lucy' },
            ],
          },
        ],
      },
      slots: {
        footer: '<button class="custom-footer">Custom footer</button>',
      },
      global: {
        stubs: { TxPopover: PopoverStub },
      },
    })

    expect(wrapper.find('.tuff-select__group-label').text()).toBe('Manager')
    expect(wrapper.find('.custom-footer').text()).toBe('Custom footer')
  })

  it('applies status classes', () => {
    const wrapper = mount(TxSelect, {
      props: {
        status: 'error',
      },
      global: {
        stubs: { TxPopover: PopoverStub },
      },
    })

    expect(wrapper.find('.tuff-select').classes()).toContain('is-status-error')
  })
})
