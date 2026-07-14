import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxTree from '../src/TxTree.vue'

describe('txTree', () => {
  const nodes = [
    { key: 'a', label: 'Alpha', children: [{ key: 'a-1', label: 'Alpha-1' }] },
    { key: 'b', label: 'Beta' },
  ]

  it('renders expanded nodes', () => {
    const wrapper = mount(TxTree, {
      props: { nodes, defaultExpandedKeys: ['a'] },
    })

    expect(wrapper.text()).toContain('Alpha-1')
  })

  it('emits selection', async () => {
    const wrapper = mount(TxTree, {
      props: { nodes },
    })

    const labels = wrapper.findAll('.tx-tree__label')
    const beta = labels.find(el => el.text() === 'Beta')
    await beta?.trigger('click')

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted?.[0][0]).toBe('b')
  })

  it('uses one roving tab stop and skips disabled items during keyboard navigation', async () => {
    const wrapper = mount(TxTree, {
      attachTo: document.body,
      props: {
        nodes: [
          { key: 'a', label: 'Alpha' },
          { key: 'disabled', label: 'Disabled', disabled: true },
          { key: 'b', label: 'Beta' },
        ],
      },
    })

    const items = wrapper.findAll<HTMLElement>('[role="treeitem"]')
    expect(items.map(item => item.attributes('tabindex'))).toEqual(['0', '-1', '-1'])
    expect(items[1]?.attributes('aria-disabled')).toBe('true')

    items[0]?.element.focus()
    await items[0]?.trigger('keydown', { key: 'ArrowDown' })

    expect(document.activeElement).toBe(items[2]?.element)
    expect(items.map(item => item.attributes('tabindex'))).toEqual(['-1', '-1', '0'])

    await items[2]?.trigger('keydown', { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[0]?.element)

    await items[0]?.trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(items[2]?.element)

    await items[2]?.trigger('keydown', { key: 'Home' })
    expect(document.activeElement).toBe(items[0]?.element)

    await items[0]?.trigger('keydown', { key: 'End' })

    await items[2]?.trigger('keydown', { key: ' ' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['b'])

    await items[2]?.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['b'])
    expect(wrapper.emitted('update:modelValue')).toHaveLength(2)

    wrapper.unmount()
  })

  it('supports tree expansion and parent-child navigation with arrow keys', async () => {
    const wrapper = mount(TxTree, {
      attachTo: document.body,
      props: { nodes },
    })

    let items = wrapper.findAll<HTMLElement>('[role="treeitem"]')
    const alpha = items[0]
    alpha?.element.focus()

    await alpha?.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('toggle')?.at(-1)).toEqual([{ key: 'a', expanded: true }])

    items = wrapper.findAll<HTMLElement>('[role="treeitem"]')
    await items[0]?.trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(items[1]?.element)

    await items[1]?.trigger('keydown', { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(items[0]?.element)

    await items[0]?.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('toggle')?.at(-1)).toEqual([{ key: 'a', expanded: false }])

    wrapper.unmount()
  })

  it('keeps nested caret and checkbox controls out of the tree tab sequence', () => {
    const wrapper = mount(TxTree, {
      props: { nodes, checkable: true, defaultExpandedKeys: ['a'] },
    })

    expect(wrapper.find('.tx-tree__caret').attributes('tabindex')).toBe('-1')
    expect(wrapper.find('.tx-checkbox').attributes('tabindex')).toBe('-1')
  })
})
