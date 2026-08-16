import type { AgentTraceRow } from '../src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxAgentTrace from '../src/TxAgentTrace.vue'

const STEPS: AgentTraceRow[] = [
  { id: 'read', primary: 'Reading flavor briefs' },
  { id: 'scan', primary: 'Scanning supplier lists' },
  { id: 'compare', primary: 'Comparing tasting notes', secondary: '6 flavors' },
]

const SOURCES: AgentTraceRow[] = [
  { id: 'joy', primary: 'Joy Cone', secondary: 'joycone.com', href: 'https://joycone.com/' },
  { id: 'webstaurant', primary: 'WebstaurantStore', secondary: 'webstaurantstore.com', href: 'https://www.webstaurantstore.com/' },
]

const TOOLS: AgentTraceRow[] = [
  { id: 'read', primary: 'Read', secondary: 'flavors.ts', mono: true },
  { id: 'edit', primary: 'Edit', secondary: 'ChurnSchedule.tsx', mono: true, added: 74, removed: 41 },
]

describe('txAgentTrace disclosure', () => {
  it('wires the header to the collapse region', () => {
    const wrapper = mount(TxAgentTrace, { props: { rows: STEPS } })

    const header = wrapper.find('.tx-bui-agent-trace__header')
    const collapse = wrapper.find('.tx-bui-agent-trace__collapse')

    expect(header.attributes('aria-expanded')).toBe('false')
    expect(header.attributes('aria-controls')).toBe(collapse.attributes('id'))
  })

  it('holds itself open while working and folds once settled', async () => {
    const wrapper = mount(TxAgentTrace, { props: { rows: STEPS, working: true } })

    expect(wrapper.find('.tx-bui-agent-trace__collapse').classes()).toContain('is-open')

    await wrapper.setProps({ working: false })
    expect(wrapper.find('.tx-bui-agent-trace__collapse').classes()).not.toContain('is-open')
  })

  it('lets a click override the automation from then on', async () => {
    const wrapper = mount(TxAgentTrace, { props: { rows: STEPS, working: true } })

    await wrapper.find('.tx-bui-agent-trace__header').trigger('click')
    expect(wrapper.emitted('toggle')).toEqual([[false]])
    expect(wrapper.find('.tx-bui-agent-trace__collapse').classes()).not.toContain('is-open')

    // Still working, but the reader closed it — automation must not reopen it.
    await wrapper.setProps({ working: true })
    expect(wrapper.find('.tx-bui-agent-trace__collapse').classes()).not.toContain('is-open')
  })

  it('lets a host-held userOpen outrank the internal override', async () => {
    const wrapper = mount(TxAgentTrace, { props: { rows: STEPS, userOpen: true } })

    await wrapper.find('.tx-bui-agent-trace__header').trigger('click')
    expect(wrapper.emitted('toggle')).toEqual([[false]])
    // The host has not fed the toggle back in, so the trace stays open.
    expect(wrapper.find('.tx-bui-agent-trace__collapse').classes()).toContain('is-open')

    await wrapper.setProps({ userOpen: false })
    expect(wrapper.find('.tx-bui-agent-trace__collapse').classes()).not.toContain('is-open')
  })

  it('honours defaultOpen ahead of the working fallback', () => {
    const wrapper = mount(TxAgentTrace, {
      props: { rows: STEPS, working: true, defaultOpen: false },
    })

    expect(wrapper.find('.tx-bui-agent-trace__collapse').classes()).not.toContain('is-open')
  })

  it('takes the collapsed rows out of the tab order', async () => {
    const wrapper = mount(TxAgentTrace, { props: { rows: SOURCES, variant: 'search' } })

    expect(wrapper.find('.tx-bui-agent-trace__collapse').attributes('inert')).toBe('true')

    await wrapper.find('.tx-bui-agent-trace__header').trigger('click')
    expect(wrapper.find('.tx-bui-agent-trace__collapse').attributes('inert')).toBeUndefined()
  })
})

describe('txAgentTrace header', () => {
  it('falls back to per-variant copy and replays the settled label', async () => {
    const wrapper = mount(TxAgentTrace, {
      props: { rows: SOURCES, variant: 'search', working: true },
    })

    const label = () => wrapper.find('.tx-bui-agent-trace__label')
    expect(label().text()).toBe('Searching the web')
    expect(label().classes()).toContain('is-working')

    await wrapper.setProps({ working: false })
    expect(label().text()).toBe('Searched the web')
    expect(label().classes()).not.toContain('is-working')
  })

  it('accepts explicit labels', async () => {
    const wrapper = mount(TxAgentTrace, {
      props: { rows: STEPS, working: true, activeLabel: '思考中', doneLabel: '思考了 4 秒' },
    })

    expect(wrapper.find('.tx-bui-agent-trace__label').text()).toBe('思考中')
    await wrapper.setProps({ working: false })
    expect(wrapper.find('.tx-bui-agent-trace__label').text()).toBe('思考了 4 秒')
  })

  it('marks the chevron open state', async () => {
    const wrapper = mount(TxAgentTrace, { props: { rows: STEPS } })

    expect(wrapper.find('.tx-bui-agent-trace__chevron').classes()).not.toContain('is-open')
    await wrapper.find('.tx-bui-agent-trace__header').trigger('click')
    expect(wrapper.find('.tx-bui-agent-trace__chevron').classes()).toContain('is-open')
  })
})

describe('txAgentTrace rows', () => {
  it('renders primary, secondary and the mono flag', () => {
    const wrapper = mount(TxAgentTrace, { props: { rows: TOOLS, variant: 'coding' } })

    const primaries = wrapper.findAll('.tx-bui-agent-trace__primary')
    expect(primaries.map(node => node.text())).toEqual(['Read', 'Edit'])

    const secondaries = wrapper.findAll('.tx-bui-agent-trace__secondary')
    expect(secondaries[0]!.text()).toBe('flavors.ts')
    expect(secondaries[0]!.classes()).toContain('is-mono')
  })

  it('writes diff counters with a real minus sign', () => {
    const wrapper = mount(TxAgentTrace, { props: { rows: TOOLS, variant: 'coding' } })

    expect(wrapper.find('.tx-bui-agent-trace__added').text()).toBe('+74')
    // U+2212 MINUS SIGN, not an ASCII hyphen.
    expect(wrapper.find('.tx-bui-agent-trace__removed').text()).toBe('−41')
  })

  it('staggers entrance through a per-row index variable', () => {
    const wrapper = mount(TxAgentTrace, { props: { rows: STEPS } })

    const items = wrapper.findAll('.tx-bui-agent-trace__item')
    expect(items[0]!.attributes('style')).toContain('--tx-bui-agent-trace-index: 0')
    expect(items[2]!.attributes('style')).toContain('--tx-bui-agent-trace-index: 2')
  })

  it('renders a query line and an overflow note', () => {
    const wrapper = mount(TxAgentTrace, {
      props: {
        rows: SOURCES,
        variant: 'search',
        query: 'best waffle cone supplier',
        moreLabel: '+7 more',
      },
    })

    expect(wrapper.find('.tx-bui-agent-trace__query').text()).toBe('best waffle cone supplier')
    expect(wrapper.find('.tx-bui-agent-trace__more').text()).toBe('+7 more')
  })

  it('exposes the variant for styling hooks', () => {
    const wrapper = mount(TxAgentTrace, { props: { rows: STEPS, variant: 'reasoning' } })

    expect(wrapper.attributes('data-variant')).toBe('reasoning')
  })

  it('replaces a row through the row slot', () => {
    const wrapper = mount(TxAgentTrace, {
      props: { rows: STEPS },
      slots: { row: '<span class="custom">{{ params.row.primary }}</span>' },
    })

    expect(wrapper.findAll('.custom')).toHaveLength(3)
    expect(wrapper.find('.tx-bui-agent-trace__primary').exists()).toBe(false)
  })
})

describe('txAgentTrace search variant', () => {
  it('renders links that hand navigation to the host', async () => {
    const wrapper = mount(TxAgentTrace, {
      props: { rows: SOURCES, variant: 'search', working: true },
    })

    const link = wrapper.find('a.tx-bui-agent-trace__row')
    expect(link.attributes('href')).toBe('https://joycone.com/')

    await link.trigger('click')
    expect(wrapper.emitted('open')).toEqual([[SOURCES[0]]])
  })

  it('falls back to a plain row when a source has no url', () => {
    const wrapper = mount(TxAgentTrace, {
      props: { rows: [{ id: 'x', primary: 'Unlinked' }], variant: 'search' },
    })

    expect(wrapper.find('a.tx-bui-agent-trace__row').exists()).toBe(false)
    expect(wrapper.find('div.tx-bui-agent-trace__row').exists()).toBe(true)
  })
})

describe('txAgentTrace coding variant', () => {
  it('selects and deselects a row when the host leaves selection unbound', async () => {
    const wrapper = mount(TxAgentTrace, { props: { rows: TOOLS, variant: 'coding' } })

    const row = () => wrapper.findAll('button.tx-bui-agent-trace__row')[0]!
    expect(row().attributes('aria-pressed')).toBe('false')

    await row().trigger('click')
    expect(wrapper.emitted('select')).toEqual([['read']])
    expect(row().attributes('aria-pressed')).toBe('true')
    expect(row().classes()).toContain('is-selected')

    await row().trigger('click')
    expect(wrapper.emitted('select')).toEqual([['read'], [null]])
    expect(row().attributes('aria-pressed')).toBe('false')
  })

  it('lets a bound selectedId own the selection', async () => {
    const wrapper = mount(TxAgentTrace, {
      props: { rows: TOOLS, variant: 'coding', selectedId: 'edit' },
    })

    const rows = () => wrapper.findAll('button.tx-bui-agent-trace__row')
    expect(rows()[1]!.attributes('aria-pressed')).toBe('true')

    await rows()[0]!.trigger('click')
    expect(wrapper.emitted('select')).toEqual([['read']])
    // The host has not written the new value back, so nothing moved.
    expect(rows()[1]!.attributes('aria-pressed')).toBe('true')

    await wrapper.setProps({ selectedId: 'read' })
    expect(rows()[0]!.attributes('aria-pressed')).toBe('true')
  })
})

describe('txAgentTrace steps glyphs', () => {
  it('spins the newest row while working and checks the rest', () => {
    const wrapper = mount(TxAgentTrace, { props: { rows: STEPS, working: true } })

    expect(wrapper.findAll('.tx-bui-agent-trace__spinner')).toHaveLength(1)
    expect(wrapper.findAll('.tx-bui-agent-trace__glyph')).toHaveLength(2)
  })

  it('checks every row once settled', () => {
    const wrapper = mount(TxAgentTrace, { props: { rows: STEPS, working: false } })

    expect(wrapper.findAll('.tx-bui-agent-trace__spinner')).toHaveLength(0)
    expect(wrapper.findAll('.tx-bui-agent-trace__glyph')).toHaveLength(3)
  })

  it('lets an explicit row status win over the positional default', () => {
    const wrapper = mount(TxAgentTrace, {
      props: {
        working: true,
        rows: [
          { id: 'a', primary: 'A', status: 'active' },
          { id: 'b', primary: 'B', status: 'error' },
          { id: 'c', primary: 'C', status: 'done' },
        ],
      },
    })

    expect(wrapper.findAll('.tx-bui-agent-trace__spinner')).toHaveLength(1)
    expect(wrapper.findAll('.tx-bui-agent-trace__glyph.is-error')).toHaveLength(1)
    expect(wrapper.findAll('.tx-bui-agent-trace__glyph')).toHaveLength(2)
  })

  it('draws no step glyphs outside the steps variant', () => {
    const wrapper = mount(TxAgentTrace, { props: { rows: TOOLS, variant: 'coding' } })

    expect(wrapper.find('.tx-bui-agent-trace__glyph').exists()).toBe(false)
    expect(wrapper.find('.tx-bui-agent-trace__spinner').exists()).toBe(false)
  })
})
