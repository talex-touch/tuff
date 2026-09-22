import type { FlowEdge, FlowNode } from '../src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxFlowchart from '../src/TxFlowchart.vue'

const nodes: FlowNode[] = [
  { id: 'trigger', label: 'Trigger', tone: 'violet', x: 240, y: 20 },
  { id: 'branch', label: 'If / Else', tone: 'orange', x: 240, y: 180 },
]

const edges: FlowEdge[] = [{ from: 'trigger', to: 'branch' }]

describe('txFlowchart', () => {
  it('places a node by its horizontal centre, not its left edge', () => {
    const wrapper = mount(TxFlowchart, { props: { nodes, edges } })

    const first = wrapper.findAll('.tx-bui-flowchart__node')[0]!
    // `left` is the centre line; the -50% translate pulls the card back over it.
    expect(first.attributes('style')).toContain('left: 240px')
    expect(first.attributes('style')).toContain('top: 20px')
    expect(first.attributes('style')).toContain('width: 290px')
  })

  it('honours a per-node width over the component default', () => {
    const wrapper = mount(TxFlowchart, {
      props: { nodes: [{ ...nodes[0]!, width: 180 }], nodeWidth: 290 },
    })

    expect(wrapper.find('.tx-bui-flowchart__node').attributes('style')).toContain('width: 180px')
  })

  it('renders the category chip with its tone class, and omits it without a label', () => {
    const wrapper = mount(TxFlowchart, {
      props: { nodes: [nodes[0]!, { id: 'bare', x: 10, y: 10 }] },
    })

    const chips = wrapper.findAll('.tx-bui-flowchart__chip')
    expect(chips).toHaveLength(1)
    expect(chips[0]!.text()).toBe('Trigger')
    expect(chips[0]!.classes()).toContain('tx-bui-flowchart__chip--violet')
  })

  it('defaults an unspecified tone to neutral', () => {
    const wrapper = mount(TxFlowchart, {
      props: { nodes: [{ id: 'n', label: 'Step', x: 0, y: 0 }] },
    })

    expect(wrapper.find('.tx-bui-flowchart__chip').classes())
      .toContain('tx-bui-flowchart__chip--neutral')
  })

  it('draws one connector per edge, from the source x to the target x', () => {
    const wrapper = mount(TxFlowchart, { props: { nodes, edges } })

    const paths = wrapper.findAll('.tx-bui-flowchart__edge')
    expect(paths).toHaveLength(1)
    // Both nodes share x = 240, so the path starts and ends on that line.
    expect(paths[0]!.attributes('d')).toMatch(/^M 240 /)
    expect(paths[0]!.attributes('d')).toContain('240 180')
  })

  it('skips an edge naming a node that is not on the canvas', () => {
    const wrapper = mount(TxFlowchart, {
      props: { nodes, edges: [{ from: 'trigger', to: 'ghost' }, { from: 'nobody', to: 'branch' }] },
    })

    // Drawing these would streak a line to the origin across the whole surface.
    expect(wrapper.findAll('.tx-bui-flowchart__edge')).toHaveLength(0)
  })

  it('marks a dashed edge without affecting the others', () => {
    const wrapper = mount(TxFlowchart, {
      props: {
        nodes: [...nodes, { id: 'third', x: 240, y: 320 }],
        edges: [{ from: 'trigger', to: 'branch', dashed: true }, { from: 'branch', to: 'third' }],
      },
    })

    const paths = wrapper.findAll('.tx-bui-flowchart__edge')
    expect(paths[0]!.classes()).toContain('is-dashed')
    expect(paths[1]!.classes()).not.toContain('is-dashed')
  })

  it('renders the dot grid by default and drops it when asked', () => {
    expect(mount(TxFlowchart, { props: { nodes } }).find('.tx-bui-flowchart').classes())
      .toContain('is-dotted')
    expect(mount(TxFlowchart, { props: { nodes, dots: false } }).find('.tx-bui-flowchart').classes())
      .not.toContain('is-dotted')
  })

  it('exposes the grid pitch as a custom property so the dots and the snap step agree', () => {
    const wrapper = mount(TxFlowchart, { props: { nodes, grid: 16 } })

    expect(wrapper.find('.tx-bui-flowchart').attributes('style'))
      .toContain('--tx-bui-flow-grid: 16px')
  })

  it('only marks nodes draggable when the component allows it', () => {
    const off = mount(TxFlowchart, { props: { nodes } })
    expect(off.find('.tx-bui-flowchart__node').classes()).not.toContain('is-draggable')

    const on = mount(TxFlowchart, { props: { nodes, draggable: true } })
    expect(on.find('.tx-bui-flowchart__node').classes()).toContain('is-draggable')
  })

  it('lets a single node opt out of dragging', () => {
    const wrapper = mount(TxFlowchart, {
      props: {
        nodes: [nodes[0]!, { ...nodes[1]!, draggable: false }],
        draggable: true,
      },
    })

    const all = wrapper.findAll('.tx-bui-flowchart__node')
    expect(all[0]!.classes()).toContain('is-draggable')
    expect(all[1]!.classes()).not.toContain('is-draggable')
  })

  it('emits node-click on click and on Enter / Space', async () => {
    const wrapper = mount(TxFlowchart, { props: { nodes } })
    const node = wrapper.findAll('.tx-bui-flowchart__node')[0]!

    await node.trigger('click')
    await node.trigger('keydown', { key: 'Enter' })
    await node.trigger('keydown', { key: ' ' })

    const fired = wrapper.emitted('node-click')
    expect(fired).toHaveLength(3)
    expect((fired![0]![0] as { id: string }).id).toBe('trigger')
  })

  it('ignores keys that are not Enter or Space', async () => {
    const wrapper = mount(TxFlowchart, { props: { nodes } })

    await wrapper.find('.tx-bui-flowchart__node').trigger('keydown', { key: 'a' })

    expect(wrapper.emitted('node-click')).toBeUndefined()
  })

  it('gives every node a tab stop and labels the canvas', () => {
    const wrapper = mount(TxFlowchart, { props: { nodes, ariaLabel: 'Order workflow' } })

    const canvas = wrapper.find('.tx-bui-flowchart')
    expect(canvas.attributes('role')).toBe('group')
    expect(canvas.attributes('aria-label')).toBe('Order workflow')
    for (const node of wrapper.findAll('.tx-bui-flowchart__node'))
      expect(node.attributes('tabindex')).toBe('0')
  })

  it('hides the connector layer from assistive tech', () => {
    const wrapper = mount(TxFlowchart, { props: { nodes, edges } })

    expect(wrapper.find('.tx-bui-flowchart__edges').attributes('aria-hidden')).toBe('true')
  })

  it('renders the node slot per node with its index', () => {
    const wrapper = mount(TxFlowchart, {
      props: { nodes },
      slots: { node: `<template #node="{ node, index }"><b class="body">{{ index }}:{{ node.id }}</b></template>` },
    })

    expect(wrapper.findAll('.body').map(b => b.text())).toEqual(['0:trigger', '1:branch'])
  })

  it('lets the label slot replace the chip entirely', () => {
    const wrapper = mount(TxFlowchart, {
      props: { nodes },
      slots: { label: `<template #label="{ node }"><i class="mine">{{ node.id }}</i></template>` },
    })

    expect(wrapper.findAll('.mine')).toHaveLength(2)
    expect(wrapper.find('.tx-bui-flowchart__chip').exists()).toBe(false)
  })

  it('applies the declared canvas height', () => {
    const wrapper = mount(TxFlowchart, { props: { nodes, height: 420 } })

    expect(wrapper.find('.tx-bui-flowchart').attributes('style')).toContain('height: 420px')
  })

  it('never writes to the nodes array it was handed', async () => {
    const owned: FlowNode[] = [{ id: 'a', x: 100, y: 50 }]
    const wrapper = mount(TxFlowchart, { props: { nodes: owned, draggable: true } })

    await wrapper.find('.tx-bui-flowchart__node').trigger('click')

    // The component is controlled: positions only change when the host writes them.
    expect(owned[0]).toEqual({ id: 'a', x: 100, y: 50 })
  })
})
