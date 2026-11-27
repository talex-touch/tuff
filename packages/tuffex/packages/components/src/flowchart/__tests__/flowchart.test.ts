import type { FlowEdge, FlowNode } from '../src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import {
  computeEdgeGeometry,
  computeFitViewport,
  computeMinimapProjection,
  computeSnapGuides,
} from '../src/geometry'
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

  it('supports lines, cross and none background patterns', () => {
    expect(mount(TxFlowchart, { props: { nodes, background: 'lines' } }).find('.tx-bui-flowchart').classes())
      .toContain('tx-bui-flowchart--bg-lines')
    expect(mount(TxFlowchart, { props: { nodes, background: 'cross' } }).find('.tx-bui-flowchart').classes())
      .toContain('tx-bui-flowchart--bg-cross')
    const none = mount(TxFlowchart, { props: { nodes, background: 'none' } }).find('.tx-bui-flowchart')
    expect(none.classes()).toContain('tx-bui-flowchart--bg-none')
    expect(none.classes()).not.toContain('is-dotted')
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

  it('renders edge tone, animated dashes, pulse beams, markers and midpoint labels', async () => {
    const wrapper = mount(TxFlowchart, {
      props: {
        nodes,
        edges: [
          {
            from: 'trigger',
            to: 'branch',
            tone: 'green',
            animated: true,
            pulse: true,
            label: '24ms',
            markerEnd: 'arrow',
          },
        ],
      },
    })

    const edge = wrapper.find('.tx-bui-flowchart__edge')
    expect(edge.classes()).toContain('tx-bui-flowchart__edge--green')
    expect(edge.classes()).toContain('is-animated')
    expect(edge.classes()).toContain('is-dashed')
    expect(edge.classes()).toContain('is-pulse')
    expect(wrapper.find('.tx-bui-flowchart__edge-beam').exists()).toBe(true)
    expect(wrapper.find('.tx-bui-flowchart__edge-glow').exists()).toBe(true)
    expect(wrapper.find('.tx-bui-flowchart__edge-arrow--green').exists()).toBe(true)

    const labelBtn = wrapper.find('.tx-bui-flowchart__edge-label')
    expect(labelBtn.text()).toBe('24ms')
    expect(labelBtn.classes()).toContain('tx-bui-flowchart__edge-label--green')

    await labelBtn.trigger('click')
    expect(wrapper.emitted('edge-click')).toHaveLength(1)
  })

  it('renders node status rings, selection state, ports and structured default cards', () => {
    const wrapper = mount(TxFlowchart, {
      props: {
        nodes: [
          {
            id: 'a',
            label: 'Step',
            tone: 'accent',
            status: 'running',
            title: 'Build',
            description: 'Compile package',
            meta: '1.2s',
            badge: 'CI',
            x: 160,
            y: 40,
          },
          {
            id: 'b',
            label: 'Deploy',
            tone: 'green',
            status: 'success',
            title: 'Production',
            x: 440,
            y: 40,
          },
        ],
        edges: [{ from: 'a', to: 'b', pulse: true, tone: 'accent' }],
        direction: 'horizontal',
        ports: true,
        selectedId: 'a',
      },
    })

    const nodeEls = wrapper.findAll('.tx-bui-flowchart__node')
    expect(nodeEls[0]!.classes()).toContain('is-status-running')
    expect(nodeEls[0]!.classes()).toContain('is-selected')
    expect(nodeEls[0]!.attributes('aria-selected')).toBe('true')
    expect(nodeEls[1]!.classes()).toContain('is-status-success')

    expect(wrapper.find('.tx-bui-flowchart').classes()).toContain('tx-bui-flowchart--horizontal')
    expect(nodeEls[0]!.find('.tx-bui-flowchart__port--out.is-live').exists()).toBe(true)
    expect(nodeEls[0]!.find('.tx-bui-flowchart__port--in').exists()).toBe(false)
    expect(nodeEls[1]!.find('.tx-bui-flowchart__port--in.is-live').exists()).toBe(true)
    expect(nodeEls[0]!.find('.tx-bui-flowchart__title').text()).toBe('Build')
    expect(nodeEls[0]!.find('.tx-bui-flowchart__badge').text()).toBe('CI')
    expect(nodeEls[0]!.find('.tx-bui-flowchart__meta').text()).toBe('1.2s')
  })

  it('renders zoom HUD controls, minimap, and exposes viewport methods', async () => {
    const wrapper = mount(TxFlowchart, {
      props: {
        nodes,
        edges,
        controls: true,
        minimap: true,
        pannable: true,
        zoomable: true,
        labels: {
          zoomIn: '放大',
          zoomOut: '缩小',
          fitView: '适应视图',
          resetView: '重置缩放',
          minimap: '缩略图',
        },
      },
    })

    expect(wrapper.find('.tx-bui-flowchart__minimap').attributes('aria-label')).toBe('缩略图')
    expect(wrapper.findAll('.tx-bui-flowchart__minimap-node')).toHaveLength(2)

    const zoomInBtn = wrapper.find('button[aria-label="放大"]')
    const resetBtn = wrapper.find('button[aria-label="重置缩放"]')
    expect(resetBtn.text()).toBe('100%')

    await zoomInBtn.trigger('click')
    expect(resetBtn.text()).toBe('115%')
    expect(wrapper.emitted('viewport-change')).toHaveLength(1)

    await resetBtn.trigger('click')
    expect(resetBtn.text()).toBe('100%')

    const vm = wrapper.vm as unknown as {
      fitView: () => void
      getViewport: () => { x: number, y: number, zoom: number }
    }
    vm.fitView()
    expect(vm.getViewport().zoom).toBeGreaterThan(0)
  })

  it('renders empty slot when nodes array is empty and emits canvas-click on backdrop', async () => {
    const wrapper = mount(TxFlowchart, {
      props: { nodes: [] },
      slots: { empty: '<span class="empty-copy">No steps</span>' },
    })

    expect(wrapper.find('.empty-copy').text()).toBe('No steps')
    await wrapper.find('.tx-bui-flowchart').trigger('click')
    expect(wrapper.emitted('canvas-click')).toHaveLength(1)
  })
})

describe('flowchart geometry helpers', () => {
  const topBox = { id: 'a', x: 200, y: 20, width: 220, height: 80, cardTopOffset: 30, cardMidOffsetY: 55 }
  const bottomBox = { id: 'b', x: 380, y: 220, width: 220, height: 80, cardTopOffset: 30, cardMidOffsetY: 55 }

  it('computes bezier, smoothstep and straight connectors with arrowheads and midpoints', () => {
    const bezier = computeEdgeGeometry(topBox, bottomBox, 'vertical', 'bezier', 'arrow')
    expect(bezier.d).toMatch(/^M 200 100 C /)
    expect(bezier.d).toContain('380 250')
    expect(bezier.arrowPath).toMatch(/^M /)
    expect(bezier.labelX).toBe(290)

    const step = computeEdgeGeometry(topBox, bottomBox, 'vertical', 'smoothstep', 'dot')
    expect(step.d).toContain('Q ')
    expect(step.dot).toEqual({ cx: 380, cy: 247.5 })

    const straight = computeEdgeGeometry(topBox, bottomBox, 'horizontal', 'straight', 'arrow')
    expect(straight.d).toBe('M 310 75 L 270 275')
    expect(straight.arrowPath).toMatch(/^M /)
  })

  it('handles horizontal smoothstep forward and backward detour paths cleanly', () => {
    const left = { id: 'l', x: 120, y: 100, width: 180, height: 80, cardMidOffsetY: 40 }
    const right = { id: 'r', x: 420, y: 180, width: 180, height: 80, cardMidOffsetY: 40 }

    const forward = computeEdgeGeometry(left, right, 'horizontal', 'smoothstep', 'arrow')
    expect(forward.d).toMatch(/^M 210 140/)
    expect(forward.d).toContain('330 220')

    const backward = computeEdgeGeometry(right, left, 'horizontal', 'smoothstep', 'arrow')
    expect(backward.d).toContain('Q ')
    expect(backward.arrowPath).toBeDefined()
  })

  it('detects alignment snap guides within threshold', () => {
    const guides = computeSnapGuides(
      { id: 'dragged', x: 202, y: 180, width: 200, height: 70 },
      [
        { id: 'peer1', x: 200, y: 20, width: 200, height: 70 },
        { id: 'peer2', x: 460, y: 183, width: 200, height: 70 },
      ],
      6,
    )
    expect(guides).toHaveLength(2)
    expect(guides.find(g => g.axis === 'x')?.position).toBe(200)
    expect(guides.find(g => g.axis === 'y')?.position).toBe(183)
  })

  it('computes bounded fitView and minimap projection', () => {
    const boxes = [
      { id: 'a', x: 100, y: 40, width: 220, height: 80 },
      { id: 'b', x: 900, y: 40, width: 220, height: 80 },
    ]
    const fit = computeFitViewport(boxes, 600, 360, 0.45, 1.75, 36)
    expect(fit.zoom).toBeLessThan(1)
    expect(fit.zoom).toBeGreaterThanOrEqual(0.45)

    const minimap = computeMinimapProjection(boxes, 600, 360, fit)
    expect(minimap.spanX).toBeGreaterThan(0)
    expect(minimap.spanY).toBeGreaterThan(0)
    expect(minimap.viewBox.split(' ')).toHaveLength(4)
  })
})
