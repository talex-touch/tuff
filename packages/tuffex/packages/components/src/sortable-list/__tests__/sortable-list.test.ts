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

/** Row text only: `wrapper.text()` also swallows the visually hidden status. */
function order(wrapper: ReturnType<typeof mount>): string {
  return wrapper.findAll('.tx-sortable-list__item').map(row => row.text().trim()).join(' ')
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

  it('previews the move while the pointer crosses, not only on drop', async () => {
    // The whole drag used to be invisible: the source row dimmed to 0.65 and
    // nothing else moved until the pointer was released.
    const wrapper = mount(TxSortableList, { props: { modelValue: items } })
    const rows = () => wrapper.findAll('.tx-sortable-list__item')

    await rows()[0]?.element.dispatchEvent(dragEvent('dragstart', rows()[0]?.element))
    await rows()[1]?.element.dispatchEvent(dragEvent('dragover', rows()[1]?.element))
    await wrapper.vm.$nextTick()

    expect(order(wrapper)).toBe('two one three')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([[items[1], items[0], items[2]]])
    // One completed reorder, not one event per row crossed.
    expect(wrapper.emitted('reorder')).toBeUndefined()
  })

  it('keeps a drag that ends outside the list', async () => {
    const wrapper = mount(TxSortableList, { props: { modelValue: items } })
    const rows = () => wrapper.findAll('.tx-sortable-list__item')

    await rows()[0]?.element.dispatchEvent(dragEvent('dragstart', rows()[0]?.element))
    await rows()[2]?.element.dispatchEvent(dragEvent('dragover', rows()[2]?.element))
    await rows()[0]?.element.dispatchEvent(dragEvent('dragend', rows()[0]?.element))

    // The rows moved under the pointer; snapping them back would undo a
    // reorder the user watched happen.
    expect(wrapper.emitted('reorder')?.[0]).toEqual([
      { from: 0, to: 2, items: [items[1], items[2], items[0]] },
    ])
  })

  describe('keyboard reordering', () => {
    function keydown(wrapper: ReturnType<typeof mount>, index: number, key: string) {
      return wrapper.findAll('.tx-sortable-list__item')[index]!.trigger('keydown', { key })
    }

    it('moves a held row with the arrow keys and reports one move on drop', async () => {
      const wrapper = mount(TxSortableList, { props: { modelValue: items } })

      await keydown(wrapper, 0, ' ')
      expect(wrapper.findAll('.tx-sortable-list__item')[0]!.classes())
        .toContain('tx-sortable-list__item--grabbed')

      await keydown(wrapper, 0, 'ArrowDown')
      await keydown(wrapper, 1, 'ArrowDown')
      expect(order(wrapper)).toBe('two three one')

      await keydown(wrapper, 2, ' ')
      expect(wrapper.emitted('reorder')?.at(-1)).toEqual([
        { from: 0, to: 2, items: [items[1], items[2], items[0]] },
      ])
      expect(wrapper.find('.tx-sortable-list__item--grabbed').exists()).toBe(false)
    })

    it('puts the order back on escape', async () => {
      const wrapper = mount(TxSortableList, { props: { modelValue: items } })

      await keydown(wrapper, 0, ' ')
      await keydown(wrapper, 0, 'ArrowDown')
      expect(order(wrapper)).toBe('two one three')

      await keydown(wrapper, 1, 'Escape')
      expect(order(wrapper)).toBe('one two three')
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([items])
      expect(wrapper.emitted('reorder')).toBeUndefined()
    })

    it('moves focus rather than rows when nothing is held', async () => {
      const wrapper = mount(TxSortableList, { props: { modelValue: items }, attachTo: document.body })

      await keydown(wrapper, 0, 'ArrowDown')

      expect(order(wrapper)).toBe('one two three')
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
      wrapper.unmount()
    })

    it('refuses to walk a held row past either end', async () => {
      const top = mount(TxSortableList, { props: { modelValue: items } })
      await keydown(top, 0, ' ')
      await keydown(top, 0, 'ArrowUp')
      expect(order(top)).toBe('one two three')
      expect(top.emitted('update:modelValue')).toBeUndefined()

      // The bottom end needs its own case: `move(arr, 2, 3)` on a 3-item list
      // lands the row back where it started, so the order looks right while the
      // component still reports a change that never happened.
      const bottom = mount(TxSortableList, { props: { modelValue: items } })
      await keydown(bottom, 2, ' ')
      await keydown(bottom, 2, 'ArrowDown')
      expect(order(bottom)).toBe('one two three')
      expect(bottom.emitted('update:modelValue')).toBeUndefined()
    })

    it('keeps one tab stop for the whole list', () => {
      const wrapper = mount(TxSortableList, { props: { modelValue: items } })

      expect(wrapper.findAll('.tx-sortable-list__item').map(r => r.attributes('tabindex')))
        .toEqual(['0', '-1', '-1'])
    })

    it('announces what happened', async () => {
      const wrapper = mount(TxSortableList, { props: { modelValue: items } })
      const status = () => wrapper.find('.tx-sortable-list__status')

      expect(status().attributes('aria-live')).toBe('polite')

      await keydown(wrapper, 0, ' ')
      expect(status().text()).toContain('one, grabbed. Position 1 of 3.')

      await keydown(wrapper, 0, 'ArrowDown')
      expect(status().text()).toBe('one, moved to position 2 of 3.')
    })

    it('takes announcement templates from labels', async () => {
      const wrapper = mount(TxSortableList, {
        props: {
          modelValue: items,
          itemLabel: (item: { id: string, title: string }) => item.title,
          labels: { grabbed: '{item} picked up ({position}/{size})' },
        },
      })

      await wrapper.findAll('.tx-sortable-list__item')[0]!.trigger('keydown', { key: ' ' })
      expect(wrapper.find('.tx-sortable-list__status').text()).toBe('One picked up (1/3)')
    })

    it('stays put while disabled', async () => {
      const wrapper = mount(TxSortableList, { props: { modelValue: items, disabled: true } })

      await keydown(wrapper, 0, ' ')
      await keydown(wrapper, 0, 'ArrowDown')

      expect(order(wrapper)).toBe('one two three')
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
      expect(wrapper.findAll('.tx-sortable-list__item').map(r => r.attributes('tabindex')))
        .toEqual(['-1', '-1', '-1'])
    })
  })

  it('grows a grip the drag can start from in handle mode', () => {
    // `handle` looked for `[data-tx-sort-handle]` but the default row rendered
    // none, so turning it on made the list undraggable with no way to tell.
    const wrapper = mount(TxSortableList, { props: { modelValue: items, handle: true } })
    const grip = wrapper.find('.tx-sortable-list__grip')

    expect(grip.exists()).toBe(true)
    expect(grip.attributes('data-tx-sort-handle')).toBe('true')
    expect(grip.attributes('aria-label')).toBe('Reorder one')
  })

  it('hands the handle attributes to a custom item slot', () => {
    const wrapper = mount(TxSortableList, {
      props: { modelValue: items, handle: true },
      slots: {
        item: `<template #item="{ handleAttrs }"><i class="grip" v-bind="handleAttrs" /></template>`,
      },
    })

    expect(wrapper.find('.grip').attributes('data-tx-sort-handle')).toBe('true')
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

  it('does not reorder or emit when disabled mid-drag before drop', async () => {
    const wrapper = mount(TxSortableList, {
      props: {
        modelValue: items,
      },
    })
    const rows = wrapper.findAll('.tx-sortable-list__item')

    // Start a real drag while enabled so draggingId is actually set (the
    // existing disabled test only ever blocks at dragstart, masking onDrop).
    await rows[0]?.element.dispatchEvent(dragEvent('dragstart', rows[0]?.element))
    expect(rows[0]?.classes()).toContain('tx-sortable-list__item--dragging')

    // Flip to disabled mid-drag, then drop on another item.
    await wrapper.setProps({ disabled: true })
    await rows[2]?.element.dispatchEvent(dragEvent('drop', rows[2]?.element))

    // Drop must be fully ignored while disabled, and drag state cleared.
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('reorder')).toBeUndefined()
    expect(wrapper.find('.tx-sortable-list__item--dragging').exists()).toBe(false)
  })
})
