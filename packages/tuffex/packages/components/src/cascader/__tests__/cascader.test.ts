import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import TxCascader from '../src/TxCascader.vue'

const PopoverStub = defineComponent({
  name: 'TxPopover',
  props: {
    modelValue: { type: Boolean, default: false },
    placement: { type: String, default: '' },
    trigger: { type: String, default: '' },
    matchReferenceWidth: { type: Boolean, default: undefined },
    minWidth: { type: Number, default: undefined },
    maxWidth: { type: Number, default: undefined },
    disabled: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'open', 'close'],
  template: '<div class="popover-stub" :data-open="modelValue"><slot name="reference" /><div><slot /></div></div>',
})

describe('txCascader', () => {
  const options = [
    { value: 'a', label: 'Alpha', leaf: true },
    { value: 'b', label: 'Beta', leaf: true },
  ]

  it('emits selection for a leaf item', async () => {
    const wrapper = mount(TxCascader, {
      props: { options },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    const items = wrapper.findAll('.tx-cascader__item')
    const beta = items.find(item => item.text().includes('Beta'))
    await beta?.trigger('click')

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted?.[0][0]).toEqual(['b'])
    expect(wrapper.emitted('change')?.[0][0]).toEqual(['b'])
  })

  it('shows empty state when search has no hits', async () => {
    const wrapper = mount(TxCascader, {
      props: { options },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    const input = wrapper.find('input')
    await input.setValue('zzz')
    await nextTick()

    expect(wrapper.find('.tx-cascader__empty').exists()).toBe(true)
  })

  it('toggles paths in multiple mode and clears to an empty array', async () => {
    const wrapper = mount(TxCascader, {
      props: {
        multiple: true,
        modelValue: [['a']],
        options,
      },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    const beta = wrapper.findAll('.tx-cascader__item').find(item => item.text().includes('Beta'))
    await beta?.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0][0]).toEqual([['a'], ['b']])

    await wrapper.setProps({ modelValue: [['a'], ['b']] })
    await wrapper.find('.tx-cascader__clear').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[1][0]).toEqual([])
  })

  it('blocks disabled trigger and disabled node interactions', async () => {
    const wrapper = mount(TxCascader, {
      props: {
        options: [
          { value: 'a', label: 'Alpha', leaf: true },
          { value: 'b', label: 'Beta', leaf: true, disabled: true },
        ],
      },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    const beta = wrapper.findAll('.tx-cascader__item').find(item => item.text().includes('Beta'))
    await beta?.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await wrapper.setProps({ disabled: true })
    await wrapper.find('.tx-cascader').trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('open')).toBeUndefined()
  })

  it('loads missing children for non-leaf nodes and selects the loaded leaf', async () => {
    const load = vi.fn(async () => [
      { value: 'a-1', label: 'Alpha child', leaf: true },
    ])

    const wrapper = mount(TxCascader, {
      props: {
        options: [{ value: 'a', label: 'Alpha' }],
        load,
        expandTrigger: 'click',
      },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    await wrapper.find('.tx-cascader__item').trigger('click')
    await nextTick()

    expect(load).toHaveBeenCalledWith({ value: 'a', label: 'Alpha' }, 1)
    expect(wrapper.text()).toContain('Alpha child')

    const child = wrapper.findAll('.tx-cascader__item').find(item => item.text().includes('Alpha child'))
    await child?.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0][0]).toEqual(['a', 'a-1'])
  })

  it('surfaces a rejected load instead of leaving an unhandled rejection', async () => {
    const failure = new Error('offline')
    const load = vi.fn(async () => {
      throw failure
    })
    const onUnhandled = vi.fn()
    process.on('unhandledRejection', onUnhandled)

    const wrapper = mount(TxCascader, {
      props: {
        options: [{ value: 'a', label: 'Alpha' }],
        load,
        expandTrigger: 'click',
      },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    await wrapper.find('.tx-cascader__item').trigger('click')
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    process.off('unhandledRejection', onUnhandled)

    expect(onUnhandled).not.toHaveBeenCalled()
    expect(wrapper.emitted('load-error')?.[0]?.[0]).toMatchObject({
      path: ['a'],
      error: failure,
    })

    // Nothing is cached for a failed path, so expanding again retries.
    await wrapper.find('.tx-cascader__item').trigger('click')
    await nextTick()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('exposes open, close, toggle, clear, setValue and getValue helpers', async () => {
    const wrapper = mount(TxCascader, {
      props: {
        modelValue: ['a'],
        options,
      },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    wrapper.vm.open()
    await nextTick()
    expect(wrapper.find('.tx-cascader').classes()).toContain('is-open')

    wrapper.vm.close()
    await nextTick()
    expect(wrapper.find('.tx-cascader').classes()).not.toContain('is-open')

    wrapper.vm.toggle()
    await nextTick()
    expect(wrapper.find('.tx-cascader').classes()).toContain('is-open')

    wrapper.vm.clear()
    wrapper.vm.setValue(['b'])

    expect(wrapper.emitted('update:modelValue')?.[0][0]).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')?.[1][0]).toEqual(['b'])
    expect(wrapper.vm.getValue()).toEqual(['a'])
  })
})

describe('txCascader anchored levels', () => {
  const nested = [
    {
      value: 'plugins',
      label: 'Plugins',
      children: [
        { value: 'installed', label: 'Installed', leaf: true },
        { value: 'updates', label: 'Updates', leaf: true },
      ],
    },
    { value: 'system', label: 'System', leaf: true },
  ]

  function mountNested(props: Record<string, unknown> = {}) {
    return mount(TxCascader, {
      attachTo: document.body,
      props: { options: nested, ...props },
      global: { stubs: { TxPopover: PopoverStub } },
    })
  }

  it('gives each branch its own panel instead of one multi-column panel', () => {
    const wrapper = mountNested()

    // The columns-in-one-panel layout is gone: a level renders its own rows and
    // hands the next level to a panel anchored on the row that opens it.
    expect(wrapper.find('.tx-cascader__columns').exists()).toBe(false)
    expect(wrapper.find('.tx-cascader__col').exists()).toBe(false)

    const levels = wrapper.findAll('[data-cascader-level]')
    expect(levels.length).toBe(2)

    const branchPanel = wrapper.find('.tx-cascader__branch-panel')
    expect(branchPanel.exists()).toBe(true)
    expect(branchPanel.find('[data-cascader-level]').exists()).toBe(true)
    expect(branchPanel.text()).toContain('Installed')

    // A leaf carries no panel of its own.
    expect(wrapper.findAll('.tx-cascader__branch')).toHaveLength(1)

    wrapper.unmount()
  })

  it('exposes exactly one listbox per level and none on the wrapping panel', async () => {
    const wrapper = mountNested()

    // The panel also carrying role="listbox" would nest one listbox inside
    // another, which is not a valid tree for an option.
    expect(wrapper.find('.tx-cascader__panel').attributes('role')).toBeUndefined()
    expect(wrapper.find('[data-cascader-level]').attributes('role')).toBe('listbox')

    await wrapper.find('input').setValue('Installed')
    await nextTick()

    const searchList = wrapper.find('.tx-cascader__search-list')
    expect(searchList.attributes('role')).toBe('listbox')
    expect(searchList.find('[role="option"]').exists()).toBe(true)
    expect(wrapper.find('[data-cascader-level]').exists()).toBe(false)

    wrapper.unmount()
  })

  it('anchors a child panel to its parent row rather than to the field', () => {
    const wrapper = mountNested()
    const branch = wrapper.findAllComponents(PopoverStub)
      .find(popover => popover.props('placement') === 'right-start')

    expect(branch).toBeDefined()
    expect(branch!.props('trigger')).toBe('hover')
    // The field's width says nothing about how wide a level's labels are.
    expect(branch!.props('matchReferenceWidth')).toBe(false)
    expect(branch!.props('minWidth')).toBe(200)

    wrapper.unmount()
  })

  it('follows expandTrigger when choosing how a branch opens', () => {
    const wrapper = mountNested({ expandTrigger: 'click' })
    const branch = wrapper.findAllComponents(PopoverStub)
      .find(popover => popover.props('placement') === 'right-start')

    expect(branch!.props('trigger')).toBe('click')

    wrapper.unmount()
  })

  it('marks a branch row as an expandable option and reflects its open state', async () => {
    const wrapper = mountNested()
    const branchRow = wrapper.findAll('[data-cascader-row]')
      .find(row => row.text().includes('Plugins'))!

    expect(branchRow.attributes('role')).toBe('option')
    expect(branchRow.attributes('aria-haspopup')).toBe('listbox')
    expect(branchRow.attributes('aria-expanded')).toBe('false')

    await branchRow.trigger('click')
    expect(branchRow.attributes('aria-expanded')).toBe('true')

    // A leaf is a leaf: nothing to expand into.
    const leafRow = wrapper.findAll('[data-cascader-row]')
      .find(row => row.text().includes('System'))!
    expect(leafRow.attributes('aria-haspopup')).toBeUndefined()
    expect(leafRow.attributes('aria-expanded')).toBeUndefined()

    wrapper.unmount()
  })

  it('moves focus within a level and opens a branch with ArrowRight', async () => {
    const wrapper = mountNested()
    const rootLevel = wrapper.find('[data-cascader-level]')
    const rootRows = rootLevel.findAll('[data-cascader-row]')
      .filter(row => row.element.closest('[data-cascader-level]') === rootLevel.element)

    expect(rootRows).toHaveLength(2);
    (rootRows[0].element as HTMLElement).focus()

    await rootLevel.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(rootRows[1].element)

    // Wraps, so the roving focus never dead-ends at either edge.
    await rootLevel.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(rootRows[0].element)

    await rootLevel.trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(rootRows[1].element);

    (rootRows[0].element as HTMLElement).focus()
    await rootLevel.trigger('keydown', { key: 'ArrowRight' })
    expect(rootRows[0].attributes('aria-expanded')).toBe('true')

    wrapper.unmount()
  })

  it('closes a child level with ArrowLeft and hands focus back to its row', async () => {
    const wrapper = mountNested()
    const branchRow = wrapper.findAll('[data-cascader-row]')
      .find(row => row.text().includes('Plugins'))!

    await branchRow.trigger('click')
    expect(branchRow.attributes('aria-expanded')).toBe('true')

    const childLevel = wrapper.find('.tx-cascader__branch-panel [data-cascader-level]')
    const childRow = childLevel.findAll('[data-cascader-row]')[0];
    (childRow.element as HTMLElement).focus()

    await childLevel.trigger('keydown', { key: 'ArrowLeft' })
    await nextTick()

    expect(branchRow.attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(branchRow.element)

    // ArrowLeft at the root has no parent to return to and must not be eaten.
    const rootLevel = wrapper.find('[data-cascader-level]')
    await rootLevel.trigger('keydown', { key: 'ArrowLeft' })
    expect(branchRow.attributes('aria-expanded')).toBe('false')

    wrapper.unmount()
  })

  it('keeps every row on the trail to the open panel lit', async () => {
    const wrapper = mountNested()
    const branchRow = wrapper.findAll('[data-cascader-row]')
      .find(row => row.text().includes('Plugins'))!

    await branchRow.trigger('click')
    const childRow = wrapper.find('.tx-cascader__branch-panel [data-cascader-row]')
    await childRow.trigger('click')
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.[0][0]).toEqual(['plugins', 'installed'])

    await wrapper.setProps({ modelValue: ['plugins', 'installed'] })
    // The parent stays active while its child is the selection, so the path
    // reads as a trail rather than a single highlighted row.
    expect(branchRow.classes()).toContain('is-active')

    wrapper.unmount()
  })
})
