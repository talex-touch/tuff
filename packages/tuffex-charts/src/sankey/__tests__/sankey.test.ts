import type { SankeyLinkData, SankeyNodeData } from '../src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { TxSankeyChart } from '../index'
import { computeSankeyLayout, resolveEdgeInset } from '../src/layout'

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
  })
})
