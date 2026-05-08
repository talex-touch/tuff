import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TxSortableList from '../src/TxSortableList.vue'

const items = [
  { id: 'one', title: 'One' },
  { id: 'two', title: 'Two' },
  { id: 'three', title: 'Three' },
]

function dragEvent(type: string, target?: EventTarget | null) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent
  Object.defineProperty(event, 'target', {
    configurable: true,
    value: target,
  })
  Object.defineProperty(event, 'dataTransfer', {
    configurable: true,
    value: {
      setData: vi.fn(),
      setDragImage: vi.fn(),
    },
  })
  return event
}

describe('txSortableList', () => {
  it('renders list semantics and item slot props', () => {
    const wrapper = mount(TxSortableList, {
      props: {
        modelValue: items,
      },
      slots: {
        item: '<template #item="{ item, dragging }"><div class="row">{{ item.title }}:{{ dragging }}</div></template>',
      },
    })

    const rows = wrapper.findAll('.tx-sortable-list__item')

    expect(wrapper.attributes('role')).toBe('list')
    expect(rows).toHaveLength(3)
    expect(rows[0]?.attributes('role')).toBe('listitem')
    expect(rows[0]?.attributes('draggable')).toBe('true')
    expect(wrapper.findAll('.row').map(row => row.text())).toEqual([
      'One:false',
      'Two:false',
      'Three:false',
    ])
  })

  it('falls back to rendering item ids when no item slot is provided', () => {
    const wrapper = mount(TxSortableList, {
      props: {
        modelValue: items,
      },
    })

    expect(wrapper.findAll('.tx-sortable-list__default').map(row => row.text())).toEqual([
      'one',
      'two',
      'three',
    ])
  })

  it('emits reordered items when an item is dragged and dropped on another item', async () => {
    const wrapper = mount(TxSortableList, {
      props: {
        modelValue: items,
      },
    })
    const rows = wrapper.findAll('.tx-sortable-list__item')

    await rows[0]?.element.dispatchEvent(dragEvent('dragstart', rows[0]?.element))
    expect(rows[0]?.classes()).toContain('tx-sortable-list__item--dragging')

    await rows[2]?.element.dispatchEvent(dragEvent('dragover', rows[2]?.element))
    expect(rows[2]?.classes()).toContain('tx-sortable-list__item--over')

    await rows[2]?.element.dispatchEvent(dragEvent('drop', rows[2]?.element))

    const expected = [items[1], items[2], items[0]]
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([expected])
    expect(wrapper.emitted('reorder')?.[0]).toEqual([{ from: 0, to: 2, items: expected }])
    expect(wrapper.find('.tx-sortable-list__item--dragging').exists()).toBe(false)
    expect(wrapper.find('.tx-sortable-list__item--over').exists()).toBe(false)
  })

  it('does not emit when dropped on the same item', async () => {
    const wrapper = mount(TxSortableList, {
      props: {
        modelValue: items,
      },
    })
    const rows = wrapper.findAll('.tx-sortable-list__item')

    await rows[1]?.element.dispatchEvent(dragEvent('dragstart', rows[1]?.element))
    await rows[1]?.element.dispatchEvent(dragEvent('drop', rows[1]?.element))

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('reorder')).toBeUndefined()
  })

  it('blocks drag and drop while disabled', async () => {
    const wrapper = mount(TxSortableList, {
      props: {
        modelValue: items,
        disabled: true,
      },
    })
    const rows = wrapper.findAll('.tx-sortable-list__item')
    const event = dragEvent('dragstart', rows[0]?.element)
    const preventDefault = vi.spyOn(event, 'preventDefault')

    await rows[0]?.element.dispatchEvent(event)
    await rows[1]?.element.dispatchEvent(dragEvent('dragover', rows[1]?.element))
    await rows[1]?.element.dispatchEvent(dragEvent('drop', rows[1]?.element))

    expect(rows[0]?.attributes('draggable')).toBe('false')
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('reorder')).toBeUndefined()
  })

  it('requires a handle target when handle mode is enabled', async () => {
    const wrapper = mount(TxSortableList, {
      props: {
        modelValue: items,
        handle: true,
      },
      slots: {
        item: `
          <template #item="{ item }">
            <button class="drag-handle" data-tx-sort-handle="true">{{ item.title }}</button>
            <span class="content">{{ item.id }}</span>
          </template>
        `,
      },
    })
    const rows = wrapper.findAll('.tx-sortable-list__item')

    const contentEvent = dragEvent('dragstart', wrapper.find('.content').element)
    const preventDefault = vi.spyOn(contentEvent, 'preventDefault')
    await rows[0]?.element.dispatchEvent(contentEvent)
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.tx-sortable-list__item--dragging').exists()).toBe(false)

    await rows[0]?.element.dispatchEvent(dragEvent('dragstart', wrapper.find('.drag-handle').element))
    expect(rows[0]?.classes()).toContain('tx-sortable-list__item--dragging')
  })

  it('clears drag state on dragend', async () => {
    const wrapper = mount(TxSortableList, {
      props: {
        modelValue: items,
      },
    })
    const row = wrapper.find('.tx-sortable-list__item')

    await row.element.dispatchEvent(dragEvent('dragstart', row.element))
    expect(row.classes()).toContain('tx-sortable-list__item--dragging')

    await row.trigger('dragend')

    expect(wrapper.find('.tx-sortable-list__item--dragging').exists()).toBe(false)
  })
})
