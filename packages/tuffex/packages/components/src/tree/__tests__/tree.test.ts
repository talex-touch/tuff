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
})
