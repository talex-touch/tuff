import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxWorkingIndicator from '../src/TxWorkingIndicator.vue'
import { formatElapsed } from '../src/use-elapsed'

describe('formatElapsed', () => {
  it('reads tenths of a second below a minute', () => {
    expect(formatElapsed(0)).toBe('0.0s')
    expect(formatElapsed(1200)).toBe('1.2s')
    expect(formatElapsed(59_900)).toBe('59.9s')
  })

  it('splits into minutes and seconds at a minute', () => {
    expect(formatElapsed(60_000)).toBe('1m 0.0s')
    expect(formatElapsed(123_000)).toBe('2m 3.0s')
  })

  it('never rounds a sub-minute reading up to 60.0s', () => {
    // 59.97s floors to 59.9 rather than showing "60.0s" for one tick.
    expect(formatElapsed(59_970)).toBe('59.9s')
  })

  it('treats a start in the future as zero', () => {
    expect(formatElapsed(-500)).toBe('0.0s')
  })
})

describe('txWorkingIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the nine-cell grid, the label and the elapsed readout', () => {
    const wrapper = mount(TxWorkingIndicator)

    expect(wrapper.findAll('.tx-bui-working-indicator__cell')).toHaveLength(9)
    expect(wrapper.find('.tx-bui-working-indicator__label').text()).toBe('Working')
    expect(wrapper.find('.tx-bui-working-indicator__elapsed').text()).toBe('0.0s')
    expect(wrapper.attributes('role')).toBe('status')
  })

  it('keeps the decorative grid and the ticking readout out of the a11y tree', () => {
    const wrapper = mount(TxWorkingIndicator)

    expect(wrapper.find('.tx-bui-working-indicator__grid').attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('.tx-bui-working-indicator__elapsed').attributes('aria-hidden')).toBe('true')
  })

  it.each([
    ['drive', 'is-drive'],
    ['dots', 'is-dots'],
    ['orbit', 'is-orbit'],
  ] as const)('marks the %s variant on the root', (variant, expected) => {
    const wrapper = mount(TxWorkingIndicator, { props: { variant } })

    expect(wrapper.classes()).toContain(expected)
  })

  it('advances the readout from wall clock', async () => {
    const wrapper = mount(TxWorkingIndicator)

    vi.advanceTimersByTime(1200)
    await nextTick()
    expect(wrapper.find('.tx-bui-working-indicator__elapsed').text()).toBe('1.2s')

    vi.advanceTimersByTime(121_800)
    await nextTick()
    expect(wrapper.find('.tx-bui-working-indicator__elapsed').text()).toBe('2m 3.0s')
  })

  it('counts from startedAt so a remount does not reset the clock', async () => {
    const wrapper = mount(TxWorkingIndicator, {
      props: { startedAt: Date.now() - 4500 },
    })

    vi.advanceTimersByTime(100)
    await nextTick()
    expect(wrapper.find('.tx-bui-working-indicator__elapsed').text()).toBe('4.6s')
  })

  it('re-bases the clock when startedAt changes', async () => {
    const wrapper = mount(TxWorkingIndicator, {
      props: { startedAt: Date.now() - 9000 },
    })

    await wrapper.setProps({ startedAt: Date.now() })
    await nextTick()
    expect(wrapper.find('.tx-bui-working-indicator__elapsed').text()).toBe('0.0s')
  })

  it('hides the readout and stops the interval when showElapsed is off', async () => {
    const wrapper = mount(TxWorkingIndicator, { props: { showElapsed: false } })

    expect(wrapper.find('.tx-bui-working-indicator__elapsed').exists()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)

    await wrapper.setProps({ showElapsed: true })
    expect(vi.getTimerCount()).toBe(1)
  })

  it('clears the interval on unmount', () => {
    const wrapper = mount(TxWorkingIndicator)

    expect(vi.getTimerCount()).toBe(1)
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('accepts a custom elapsed formatter', async () => {
    const wrapper = mount(TxWorkingIndicator, {
      props: {
        startedAt: Date.now() - 2000,
        elapsedFormatter: (ms: number) => `已用 ${Math.round(ms / 1000)} 秒`,
      },
    })

    vi.advanceTimersByTime(100)
    await nextTick()
    expect(wrapper.find('.tx-bui-working-indicator__elapsed').text()).toBe('已用 2 秒')
  })

  it('takes a custom label and a label slot', () => {
    expect(
      mount(TxWorkingIndicator, { props: { label: 'Churning' } })
        .find('.tx-bui-working-indicator__label')
        .text(),
    ).toBe('Churning')

    expect(
      mount(TxWorkingIndicator, { slots: { label: '<em>Indexing</em>' } })
        .find('.tx-bui-working-indicator__label em')
        .exists(),
    ).toBe(true)
  })

  it('only names the status region when a name is given', () => {
    expect(mount(TxWorkingIndicator).attributes('aria-label')).toBeUndefined()
    expect(
      mount(TxWorkingIndicator, { props: { ariaLabel: 'Indexing the vault' } })
        .attributes('aria-label'),
    ).toBe('Indexing the vault')
  })
})
