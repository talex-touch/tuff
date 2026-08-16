import type { TaskRowItem } from '../src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxTaskRows from '../src/TxTaskRows.vue'

const ROWS: TaskRowItem[] = [
  {
    id: 'verify',
    label: 'Verified vendor records',
    status: 'done',
    amount: '12 suppliers',
    details: [
      { label: 'Matched tax and contact IDs', meta: '12/12' },
      { label: 'Flagged stale records', meta: '0' },
    ],
  },
  {
    id: 'index',
    label: 'Build reorder task list',
    status: 'running',
    amount: '7 SKUs',
    index: 2,
    details: [{ label: 'Reading POS export', meta: '3 files' }],
  },
  {
    id: 'draft',
    label: 'Draft supplier emails',
    status: 'pending',
    amount: '2 messages',
    index: 3,
  },
]

describe('txTaskRows rendering', () => {
  it('renders one row per item with its label and amount', () => {
    const wrapper = mount(TxTaskRows, { props: { rows: ROWS } })

    const labels = wrapper.findAll('.tx-bui-task-rows__label')
    expect(labels.map(node => node.text())).toEqual([
      'Verified vendor records',
      'Build reorder task list',
      'Draft supplier emails',
    ])
    expect(wrapper.findAll('.tx-bui-task-rows__amount')[1]!.text()).toBe('7 SKUs')
  })

  it.each([
    ['capsules', 'is-capsules'],
    ['list', 'is-list'],
  ] as const)('marks the %s variant on the root', (variant, expected) => {
    const wrapper = mount(TxTaskRows, { props: { rows: ROWS, variant } })

    expect(wrapper.classes()).toContain(expected)
  })

  it('staggers row entrance through a per-row index variable', () => {
    const wrapper = mount(TxTaskRows, { props: { rows: ROWS } })

    const rows = wrapper.findAll('.tx-bui-task-rows__row')
    expect(rows[0]!.attributes('style')).toContain('--tx-bui-task-rows-index: 0')
    expect(rows[2]!.attributes('style')).toContain('--tx-bui-task-rows-index: 2')
  })

  it('exposes each row status for styling hooks', () => {
    const wrapper = mount(TxTaskRows, { props: { rows: ROWS } })

    expect(
      wrapper.findAll('.tx-bui-task-rows__row').map(node => node.attributes('data-status')),
    ).toEqual(['done', 'running', 'pending'])
  })
})

describe('txTaskRows badges', () => {
  it('marks finished and failed rows, and rings the rest', () => {
    const wrapper = mount(TxTaskRows, {
      props: {
        rows: [
          { id: 'a', label: 'A', status: 'done' },
          { id: 'b', label: 'B', status: 'error' },
          { id: 'c', label: 'C', status: 'running', index: 2 },
          { id: 'd', label: 'D', status: 'pending', index: 3 },
        ],
      },
    })

    expect(wrapper.findAll('.tx-bui-task-rows__mark.is-done')).toHaveLength(1)
    expect(wrapper.findAll('.tx-bui-task-rows__mark.is-error')).toHaveLength(1)

    const rings = wrapper.findAll('.tx-bui-task-rows__ring')
    expect(rings).toHaveLength(2)
    expect(rings[0]!.classes()).toContain('is-active')
    expect(rings[1]!.classes()).not.toContain('is-active')
  })

  it('draws the arc only while running, at a constant 28% of the ring', () => {
    const wrapper = mount(TxTaskRows, {
      props: {
        rows: [
          { id: 'c', label: 'C', status: 'running', index: 2 },
          { id: 'd', label: 'D', status: 'pending', index: 3 },
        ],
      },
    })

    const rings = wrapper.findAll('.tx-bui-task-rows__ring-track')
    expect(rings[0]!.findAll('circle')).toHaveLength(2)
    expect(rings[1]!.findAll('circle')).toHaveLength(1)

    const dash = rings[0]!.findAll('circle')[1]!.attributes('stroke-dasharray')!
    const [arc, gap] = dash.split(' ').map(Number)
    expect(arc! / (arc! + gap!)).toBeCloseTo(0.28, 5)
  })

  it('shows the ring index only when the row carries one', () => {
    const wrapper = mount(TxTaskRows, {
      props: {
        rows: [
          { id: 'c', label: 'C', status: 'running', index: 2 },
          { id: 'd', label: 'D', status: 'running' },
        ],
      },
    })

    const indices = wrapper.findAll('.tx-bui-task-rows__ring-index')
    expect(indices).toHaveLength(1)
    expect(indices[0]!.text()).toBe('2')
  })

  it('rebuilds the badge when the status changes so the pop-in replays', async () => {
    const wrapper = mount(TxTaskRows, {
      props: { rows: [{ id: 'a', label: 'A', status: 'done' }] },
    })

    const before = wrapper.find('.tx-bui-task-rows__mark').element
    await wrapper.setProps({ rows: [{ id: 'a', label: 'A', status: 'error' }] })
    const after = wrapper.find('.tx-bui-task-rows__mark').element

    expect(after).not.toBe(before)
    expect(wrapper.find('.tx-bui-task-rows__mark').classes()).toContain('is-error')
  })
})

describe('txTaskRows pills', () => {
  it('labels finished and failed rows, and leaves the others bare', () => {
    const wrapper = mount(TxTaskRows, {
      props: {
        rows: [
          { id: 'a', label: 'A', status: 'done' },
          { id: 'b', label: 'B', status: 'error' },
          { id: 'c', label: 'C', status: 'running' },
          { id: 'd', label: 'D', status: 'pending' },
        ],
      },
    })

    const pills = wrapper.findAll('.tx-bui-task-rows__pill')
    expect(pills).toHaveLength(2)
    expect(pills[0]!.text()).toBe('Completed')
    expect(pills[1]!.text()).toBe('Failed')
  })

  it('takes per-status copy and a per-row override', () => {
    const wrapper = mount(TxTaskRows, {
      props: {
        rows: [
          { id: 'a', label: 'A', status: 'done' },
          { id: 'c', label: 'C', status: 'running' },
          { id: 'd', label: 'D', status: 'pending', statusText: 'Waiting on approval' },
        ],
        doneText: '已完成',
        runningText: 'Running',
      },
    })

    const pills = wrapper.findAll('.tx-bui-task-rows__pill')
    expect(pills.map(node => node.text())).toEqual(['已完成', 'Running', 'Waiting on approval'])
  })

  it('turns the retry glyph on failed rows unless the row opts out', async () => {
    const wrapper = mount(TxTaskRows, {
      props: { rows: [{ id: 'b', label: 'B', status: 'error' }] },
    })

    expect(wrapper.find('.tx-bui-task-rows__retry').exists()).toBe(true)

    await wrapper.setProps({ rows: [{ id: 'b', label: 'B', status: 'error', retryable: false }] })
    expect(wrapper.find('.tx-bui-task-rows__retry').exists()).toBe(false)
  })
})

describe('txTaskRows disclosure', () => {
  it('wires each toggle to its own detail region', () => {
    const wrapper = mount(TxTaskRows, { props: { rows: ROWS } })

    const toggles = wrapper.findAll('.tx-bui-task-rows__toggle')
    const collapses = wrapper.findAll('.tx-bui-task-rows__collapse')

    expect(toggles[0]!.attributes('aria-controls')).toBe(collapses[0]!.attributes('id'))
    expect(toggles[1]!.attributes('aria-controls')).toBe(collapses[1]!.attributes('id'))
    expect(collapses[0]!.attributes('id')).not.toBe(collapses[1]!.attributes('id'))
  })

  it('opens a row on click and reports both events', async () => {
    const wrapper = mount(TxTaskRows, { props: { rows: ROWS } })

    const toggle = wrapper.findAll('.tx-bui-task-rows__toggle')[1]!
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.findAll('.tx-bui-task-rows__collapse')[1]!.attributes('inert')).toBe('true')

    await toggle.trigger('click')

    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('.tx-bui-task-rows__collapse')[1]!.classes()).toContain('is-open')
    expect(wrapper.findAll('.tx-bui-task-rows__collapse')[1]!.attributes('inert')).toBeUndefined()
    expect(wrapper.emitted('toggle')).toEqual([['index', true]])
    expect(wrapper.emitted('update:openIds')).toEqual([[['index']]])
  })

  it('starts from defaultOpenIds', () => {
    const wrapper = mount(TxTaskRows, {
      props: { rows: ROWS, defaultOpenIds: ['verify'] },
    })

    const collapses = wrapper.findAll('.tx-bui-task-rows__collapse')
    expect(collapses[0]!.classes()).toContain('is-open')
    expect(collapses[1]!.classes()).not.toContain('is-open')
  })

  it('lets a bound openIds own the open set', async () => {
    const wrapper = mount(TxTaskRows, { props: { rows: ROWS, openIds: ['verify'] } })

    expect(wrapper.findAll('.tx-bui-task-rows__collapse')[0]!.classes()).toContain('is-open')

    await wrapper.findAll('.tx-bui-task-rows__toggle')[1]!.trigger('click')
    expect(wrapper.emitted('update:openIds')).toEqual([[['verify', 'index']]])
    // The host has not written the new set back, so nothing moved.
    expect(wrapper.findAll('.tx-bui-task-rows__collapse')[1]!.classes()).not.toContain('is-open')

    await wrapper.setProps({ openIds: ['verify', 'index'] })
    expect(wrapper.findAll('.tx-bui-task-rows__collapse')[1]!.classes()).toContain('is-open')
  })

  it('closes an open row and drops it from the reported set', async () => {
    const wrapper = mount(TxTaskRows, {
      props: { rows: ROWS, defaultOpenIds: ['verify', 'index'] },
    })

    await wrapper.findAll('.tx-bui-task-rows__toggle')[0]!.trigger('click')

    expect(wrapper.emitted('toggle')).toEqual([['verify', false]])
    expect(wrapper.emitted('update:openIds')).toEqual([[['index']]])
    expect(wrapper.findAll('.tx-bui-task-rows__collapse')[0]!.classes()).not.toContain('is-open')
  })

  it('renders details with their own stagger index', () => {
    const wrapper = mount(TxTaskRows, {
      props: { rows: ROWS, defaultOpenIds: ['verify'] },
    })

    const details = wrapper.findAll('.tx-bui-task-rows__detail')
    expect(details).toHaveLength(3)
    expect(details[0]!.find('.tx-bui-task-rows__detail-label').text()).toBe('Matched tax and contact IDs')
    expect(details[0]!.find('.tx-bui-task-rows__detail-meta').text()).toBe('12/12')
    expect(details[1]!.attributes('style')).toContain('--tx-bui-task-rows-detail-index: 1')
  })

  it('omits the detail grid for rows that carry none', () => {
    const wrapper = mount(TxTaskRows, {
      props: { rows: [{ id: 'a', label: 'A', status: 'done' }] },
    })

    expect(wrapper.find('.tx-bui-task-rows__details').exists()).toBe(false)
  })
})

describe('txTaskRows slots', () => {
  it('replaces the badge and the detail line', () => {
    const wrapper = mount(TxTaskRows, {
      props: { rows: ROWS, defaultOpenIds: ['verify'] },
      slots: {
        badge: '<i class="custom-badge" />',
        detail: '<i class="custom-detail" />',
      },
    })

    expect(wrapper.findAll('.custom-badge')).toHaveLength(3)
    expect(wrapper.find('.tx-bui-task-rows__mark').exists()).toBe(false)
    // Every row's details are in the DOM — the collapse hides them by height,
    // it does not unmount them.
    expect(wrapper.findAll('.custom-detail')).toHaveLength(3)
  })

  it('places trailing host controls outside the toggle button', () => {
    const wrapper = mount(TxTaskRows, {
      props: { rows: [{ id: 'b', label: 'B', status: 'error' }] },
      slots: { trailing: '<button class="host-retry" type="button">Retry</button>' },
    })

    // Nesting a control inside the toggle would be invalid interactive content.
    expect(wrapper.find('.tx-bui-task-rows__toggle .host-retry').exists()).toBe(false)
    expect(wrapper.find('.tx-bui-task-rows__header .host-retry').exists()).toBe(true)
  })
})
