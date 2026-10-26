import type { SankeyLinkData, SankeyNodeData } from '../src/sankey/src/types'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { TxSankeyChart } from '../src/sankey'
import { computeSankeyLayout, offsetSankeyLayout, resolveEdgeInset } from '../src/sankey/src/layout'

const nodes: SankeyNodeData[] = [
  { name: 'Source A', value: 30 },
  { name: 'Source B', color: '#123456' },
  { name: 'Target', tooltipData: { Apps: 3 } },
]
const links: SankeyLinkData[] = [
  { source: 0, target: 2, value: 20 },
  { source: 1, target: 2, value: 10, isDrillable: true },
]

describe('sankey layout', () => {
  it('resolves pixel and percent edge insets', () => {
    expect(resolveEdgeInset(24, 400)).toBe(24)
    expect(resolveEdgeInset('5%', 400)).toBe(20)
    expect(resolveEdgeInset('bogus', 400)).toBe(0)
  })

  it('positions nodes into columns and links between them', () => {
    const layout = computeSankeyLayout(nodes, links, {
      width: 400,
      height: 300,
      nodeWidth: 8,
      nodePadding: 10,
      left: 0,
      right: 0,
    })
    expect(layout).not.toBeNull()
    expect(layout!.nodes).toHaveLength(3)
    expect(layout!.links).toHaveLength(2)

    const [a, b, target] = layout!.nodes
    // Sources sit in the left column, the target in the right one.
    expect(a!.x0).toBeLessThan(target!.x0)
    expect(b!.x0).toBe(a!.x0)
    expect(target!.x1).toBeLessThanOrEqual(400)
    // Ribbon widths scale with value: 20 vs 10.
    expect(layout!.links[0]!.width).toBeGreaterThan(layout!.links[1]!.width)
    expect(layout!.links[0]!.path).toMatch(/^M/)
  })

  it('moves nodes by offset and re-stacks their ribbons in d3-sankey order', () => {
    const base = computeSankeyLayout(nodes, links, {
      width: 400,
      height: 300,
      nodeWidth: 8,
      nodePadding: 10,
      left: 0,
      right: 0,
    })!
    expect(offsetSankeyLayout(base, new Map())).toBe(base)
    const [a, b, target] = base.nodes
    const [toA, toB] = base.links
    expect(a!.y0).toBeLessThan(b!.y0)
    // The ribbon ends d3-sankey stacked, which re-stacking has to reproduce.
    expect(toA!.y0).toBeCloseTo(a!.y0 + toA!.breadth / 2)
    expect(toA!.y1).toBeCloseTo(target!.y0 + toA!.breadth / 2)
    expect(toB!.y1).toBeCloseTo(target!.y0 + toA!.breadth + toB!.breadth / 2)

    const moved = offsetSankeyLayout(base, new Map([[0, 30]]))
    expect(moved.nodes[0]!.y0).toBeCloseTo(a!.y0 + 30)
    expect(moved.nodes[1]).toBe(b)
    expect(moved.links[0]!.y0).toBeCloseTo(a!.y0 + 30 + toA!.breadth / 2)
    expect(moved.links[0]!.path).not.toBe(toA!.path)

    // Lifted above A, B's ribbon enters the target on top.
    const lifted = offsetSankeyLayout(base, new Map([[1, a!.y0 - b!.y1 - 5]]))
    expect(lifted.links[1]!.y1).toBeCloseTo(target!.y0 + toB!.breadth / 2)
    expect(lifted.links[0]!.y1).toBeCloseTo(target!.y0 + toB!.breadth + toA!.breadth / 2)
  })

  it('keeps the ribbon order d3-sankey chose through a first move', () => {
    // d3-sankey stacks the ribbons entering n5 from n3 and n4 against the order
    // of their sources here, so re-sorting from the first move would jump them.
    const graphNodes: SankeyNodeData[] = Array.from({ length: 7 }, (_, index) => ({ name: `n${index}` }))
    const graphLinks: SankeyLinkData[] = [
      { source: 0, target: 2, value: 4 },
      { source: 1, target: 4, value: 15 },
      { source: 1, target: 2, value: 15 },
      { source: 2, target: 5, value: 25 },
      { source: 2, target: 6, value: 29 },
      { source: 3, target: 5, value: 9 },
      { source: 4, target: 5, value: 25 },
    ]
    const base = computeSankeyLayout(graphNodes, graphLinks, {
      width: 400,
      height: 300,
      nodeWidth: 8,
      nodePadding: 10,
      left: 0,
      right: 0,
    })!
    const entering = base.links.filter(link => link.targetIndex === 5).sort((a, b) => a.y1 - b.y1)
    const sourceTops = entering.map(link => base.nodes[link.sourceIndex]!.y0)
    expect(sourceTops).not.toEqual([...sourceTops].sort((a, b) => a - b))

    for (const node of base.nodes) {
      const moved = offsetSankeyLayout(base, new Map([[node.index, 0.001]]))
      moved.links.forEach((link, index) => {
        expect(Math.abs(link.y0 - base.links[index]!.y0)).toBeLessThan(0.01)
        expect(Math.abs(link.y1 - base.links[index]!.y1)).toBeLessThan(0.01)
      })
    }
  })

  it('degrades to null on circular input instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const layout = computeSankeyLayout(
      [{ name: 'a' }, { name: 'b' }],
      [
        { source: 0, target: 1, value: 1 },
        { source: 1, target: 0, value: 1 },
      ],
      { width: 400, height: 300, nodeWidth: 8, nodePadding: 10, left: 0, right: 0 },
    )
    expect(layout).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('txSankeyChart', () => {
  function mountChart(extra: Record<string, unknown> = {}) {
    return mount(TxSankeyChart, {
      props: { nodes, links, width: 400, ...extra } as never,
    })
  }

  it('renders nodes, links and value labels', () => {
    const wrapper = mountChart()
    expect(wrapper.findAll('.tx-sankey__node')).toHaveLength(3)
    expect(wrapper.findAll('.tx-sankey__link')).toHaveLength(2)
    // Any node has a value → values shown by default; 30 formatted via toLocaleString.
    expect(wrapper.find('.tx-sankey__label-value').text()).toBe((30).toLocaleString())
  })

  it('honours explicit colors, then the categorical palette', () => {
    const wrapper = mountChart({ linkColor: 'gray' })
    const rects = wrapper.findAll('.tx-sankey__node')
    expect(rects[0]!.attributes('fill')).toBe('var(--tx-chart-categorical-1, #4290F0)')
    expect(rects[1]!.attributes('fill')).toBe('#123456')
    const link = wrapper.findAll('.tx-sankey__link')[0]!
    expect(link.attributes('stroke')).toBe('#D1D5DB')
  })

  it('uses per-link gradients in gradient mode', () => {
    const wrapper = mountChart()
    expect(wrapper.findAll('linearGradient')).toHaveLength(2)
    const link = wrapper.findAll('.tx-sankey__link')[0]!
    expect(link.attributes('stroke')).toMatch(/^url\(#tx-sankey-\d+-link-0\)$/)
  })

  it('emits node and link clicks with the original data', async () => {
    const wrapper = mountChart()
    await wrapper.findAll('.tx-sankey__node')[1]!.trigger('click')
    await wrapper.findAll('.tx-sankey__link')[1]!.trigger('click')
    expect(wrapper.emitted('nodeClick')![0]![0]).toEqual(nodes[1])
    expect(wrapper.emitted('linkClick')![0]![0]).toEqual(links[1])
  })

  it('shows a tooltip with value and tooltipData rows on node hover', async () => {
    const wrapper = mountChart()
    await wrapper.findAll('.tx-sankey__node')[2]!.trigger('pointerenter')
    const tooltip = wrapper.find('.tx-sankey__tooltip')
    expect(tooltip.exists()).toBe(true)
    expect(tooltip.text()).toContain('Target')
    expect(tooltip.text()).toContain('Apps')

    await wrapper.findAll('.tx-sankey__node')[2]!.trigger('pointerleave')
    expect(wrapper.find('.tx-sankey__tooltip').exists()).toBe(false)
  })

  it('describes links as source → target in the tooltip', async () => {
    const wrapper = mountChart()
    await wrapper.findAll('.tx-sankey__link')[0]!.trigger('pointerenter')
    expect(wrapper.find('.tx-sankey__tooltip').text()).toContain('Source A → Target')
    expect(wrapper.find('.tx-sankey__tooltip-key').text()).toBe('Value')
  })

  it('takes the tooltip wording from labels', async () => {
    const drillable = [nodes[0]!, nodes[1]!, { ...nodes[2]!, isDrillable: true, childCount: 4 }]
    const wrapper = mountChart({ nodes: drillable, labels: { value: '数值', items: (count: number) => `${count} 项` } })
    await wrapper.findAll('.tx-sankey__link')[0]!.trigger('pointerenter')
    expect(wrapper.find('.tx-sankey__tooltip-key').text()).toBe('数值')

    await wrapper.findAll('.tx-sankey__link')[0]!.trigger('pointerleave')
    await wrapper.findAll('.tx-sankey__node')[2]!.trigger('pointerenter')
    expect(wrapper.find('.tx-sankey__tooltip-drill').text()).toBe('4 项')
  })
})

/** Dispatches a pointer event at a chosen time; jsdom has no PointerEvent. */
function firePointer(
  target: Element,
  type: string,
  { x, y, t, buttons }: { x: number, y: number, t: number, buttons?: number },
): void {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'timeStamp', { value: t })
  Object.assign(event, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    button: 0,
    buttons: buttons ?? (type === 'pointerup' || type === 'pointercancel' ? 0 : 1),
    pointerType: 'mouse',
    isPrimary: true,
  })
  target.dispatchEvent(event)
}

describe('sankey node dragging', () => {
  const originalMatchMedia = window.matchMedia
  let reduce = false

  beforeEach(() => {
    reduce = false
    window.matchMedia = ((query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    window.matchMedia = originalMatchMedia
  })

  function mountChart() {
    return mount(TxSankeyChart, { props: { nodes, links, width: 400, height: 300 } as never })
  }

  function nodeY(wrapper: ReturnType<typeof mountChart>, index: number): number {
    return Number(wrapper.findAll('.tx-sankey__node')[index]!.attributes('y'))
  }

  it('drags a node 1:1 from the press, re-routes its ribbon and swallows the click', async () => {
    const wrapper = mountChart()
    const node = wrapper.findAll('.tx-sankey__node')[0]!
    const start = nodeY(wrapper, 0)
    const path = wrapper.findAll('.tx-sankey__link')[0]!.attributes('d')
    await node.trigger('pointerenter')
    expect(wrapper.find('.tx-sankey__tooltip').exists()).toBe(true)

    firePointer(node.element, 'pointerdown', { x: 10, y: 100, t: 0 })
    firePointer(wrapper.element, 'pointermove', { x: 12, y: 102, t: 16 })
    await nextTick()
    expect(nodeY(wrapper, 0)).toBe(start)
    firePointer(wrapper.element, 'pointermove', { x: 14, y: 130, t: 32 })
    await nextTick()
    expect(nodeY(wrapper, 0)).toBeCloseTo(start + 30)
    expect(wrapper.findAll('.tx-sankey__link')[0]!.attributes('d')).not.toBe(path)
    expect(wrapper.classes()).toContain('is-dragging')
    // The tooltip steps aside while the dragged node keeps its adjacency emphasis.
    expect(wrapper.find('.tx-sankey__tooltip').exists()).toBe(false)
    expect(wrapper.findAll('.tx-sankey__node')[1]!.classes()).toContain('is-dimmed')

    firePointer(wrapper.element, 'pointerup', { x: 14, y: 130, t: 48 })
    await node.trigger('click')
    expect(wrapper.emitted('nodeClick')).toBeUndefined()
    expect(nodeY(wrapper, 0)).toBeCloseTo(start + 30)
    expect(wrapper.classes()).not.toContain('is-dragging')

    // A press that stays put is a click again.
    firePointer(node.element, 'pointerdown', { x: 14, y: 130, t: 100 })
    firePointer(node.element, 'pointerup', { x: 14, y: 130, t: 120 })
    await node.trigger('click')
    expect(wrapper.emitted('nodeClick')).toHaveLength(1)
  })

  it('lets go of a node whose release it never heard about', async () => {
    const wrapper = mountChart()
    const node = wrapper.findAll('.tx-sankey__node')[0]!
    const start = nodeY(wrapper, 0)
    firePointer(node.element, 'pointerdown', { x: 10, y: 100, t: 0 })
    firePointer(wrapper.element, 'pointermove', { x: 10, y: 130, t: 16 })
    await nextTick()
    expect(nodeY(wrapper, 0)).toBeCloseTo(start + 30)
    // A mouse let go outside the window never says so; moving on without the button is hover.
    firePointer(wrapper.element, 'pointermove', { x: 10, y: 200, t: 32, buttons: 0 })
    await nextTick()
    expect(wrapper.classes()).not.toContain('is-dragging')
    expect(nodeY(wrapper, 0)).toBeCloseTo(start + 30)
  })

  it('keeps moved nodes through a new array of the same data and starts over on different data', async () => {
    const wrapper = mountChart()
    const node = wrapper.findAll('.tx-sankey__node')[0]!
    const start = nodeY(wrapper, 0)
    firePointer(node.element, 'pointerdown', { x: 10, y: 100, t: 0 })
    firePointer(wrapper.element, 'pointermove', { x: 10, y: 130, t: 16 })
    firePointer(wrapper.element, 'pointerup', { x: 10, y: 130, t: 32 })
    await nextTick()
    expect(nodeY(wrapper, 0)).toBeCloseTo(start + 30)

    await wrapper.setProps({ nodes: nodes.map(item => ({ ...item })), links: links.map(item => ({ ...item })) })
    expect(nodeY(wrapper, 0)).toBeCloseTo(start + 30)

    const changed = links.map((item, index) => (index === 0 ? { ...item, value: item.value + 5 } : item))
    await wrapper.setProps({ links: changed })
    const fresh = mount(TxSankeyChart, { props: { nodes, links: changed, width: 400, height: 300 } as never })
    expect(nodeY(wrapper, 0)).toBeCloseTo(nodeY(fresh, 0))
  })

  it('keeps a dragged node inside the plot', async () => {
    const wrapper = mountChart()
    const node = wrapper.findAll('.tx-sankey__node')[0]!
    firePointer(node.element, 'pointerdown', { x: 10, y: 100, t: 0 })
    firePointer(wrapper.element, 'pointermove', { x: 10, y: -500, t: 16 })
    await nextTick()
    expect(nodeY(wrapper, 0)).toBeCloseTo(8)
    firePointer(wrapper.element, 'pointermove', { x: 10, y: 900, t: 32 })
    await nextTick()
    const rect = wrapper.findAll('.tx-sankey__node')[0]!
    expect(Number(rect.attributes('y')) + Number(rect.attributes('height'))).toBeCloseTo(300 - 8)
  })

  it('springs the node back on Escape and every node home on a background double-click', async () => {
    const wrapper = mountChart()
    const node = wrapper.findAll('.tx-sankey__node')[0]!
    const start = nodeY(wrapper, 0)
    firePointer(node.element, 'pointerdown', { x: 10, y: 100, t: 0 })
    firePointer(wrapper.element, 'pointermove', { x: 10, y: 140, t: 16 })
    await nextTick()
    await node.trigger('keydown', { key: 'Escape' })
    vi.advanceTimersByTime(100)
    await nextTick()
    const halfway = nodeY(wrapper, 0)
    expect(halfway).toBeGreaterThan(start)
    expect(halfway).toBeLessThan(start + 40)
    vi.advanceTimersByTime(1000)
    await nextTick()
    expect(nodeY(wrapper, 0)).toBeCloseTo(start)
    // The drag that Escape ended does not move the node any more.
    firePointer(wrapper.element, 'pointermove', { x: 10, y: 200, t: 32 })
    firePointer(wrapper.element, 'pointerup', { x: 10, y: 200, t: 48 })
    await nextTick()
    expect(nodeY(wrapper, 0)).toBeCloseTo(start)

    firePointer(node.element, 'pointerdown', { x: 10, y: 100, t: 100 })
    firePointer(wrapper.element, 'pointermove', { x: 10, y: 130, t: 116 })
    firePointer(wrapper.element, 'pointerup', { x: 10, y: 130, t: 132 })
    await nextTick()
    // A double-click on a node is not a reset; one on the background is.
    await wrapper.findAll('.tx-sankey__node')[1]!.trigger('dblclick')
    vi.advanceTimersByTime(1000)
    await nextTick()
    expect(nodeY(wrapper, 0)).toBeCloseTo(start + 30)
    await wrapper.find('.tx-sankey__svg').trigger('dblclick')
    vi.advanceTimersByTime(1000)
    await nextTick()
    expect(nodeY(wrapper, 0)).toBeCloseTo(start)
  })

  it('jumps back without the spring under reduced motion', async () => {
    reduce = true
    const wrapper = mountChart()
    const node = wrapper.findAll('.tx-sankey__node')[0]!
    const start = nodeY(wrapper, 0)
    firePointer(node.element, 'pointerdown', { x: 10, y: 100, t: 0 })
    firePointer(wrapper.element, 'pointermove', { x: 10, y: 140, t: 16 })
    await nextTick()
    // The dragged node still follows the pointer.
    expect(nodeY(wrapper, 0)).toBeCloseTo(start + 40)
    await node.trigger('keydown', { key: 'Escape' })
    expect(nodeY(wrapper, 0)).toBeCloseTo(start)
  })

  it('moves a focused node with Alt + arrows and selects it with Enter', async () => {
    const wrapper = mountChart()
    const node = wrapper.findAll('.tx-sankey__node')[0]!
    expect(node.attributes('tabindex')).toBe('0')
    expect(node.attributes('role')).toBe('button')
    expect(node.attributes('aria-label')).toBe(`Source A, ${(30).toLocaleString()}`)
    expect(node.attributes('aria-describedby')).toBe(wrapper.find('.tx-sankey__instructions').attributes('id'))
    const start = nodeY(wrapper, 0)
    await node.trigger('keydown', { key: 'ArrowDown', altKey: true })
    expect(nodeY(wrapper, 0)).toBeCloseTo(start + 8)
    await node.trigger('keydown', { key: 'ArrowDown' })
    expect(nodeY(wrapper, 0)).toBeCloseTo(start + 8)
    await node.trigger('keydown', { key: 'ArrowUp', altKey: true })
    expect(nodeY(wrapper, 0)).toBeCloseTo(start)
    await node.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('nodeClick')![0]![0]).toEqual(nodes[0])
  })
})
