import type { InsightPage } from '../src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxInsightCards from '../src/TxInsightCards.vue'
import TxInsightMetric from '../src/TxInsightMetric.vue'

const PAGES: InsightPage[] = [
  { key: 'compare', prose: 'Rocky Road is the worst performer.', suggestion: 'Should I rebalance flavors?' },
  { key: 'anomaly', prose: 'Unusually high freezer bill.', suggestion: 'Get tips on cutting freezer costs' },
  { key: 'allocation', prose: 'Heavily invested in Vanilla.' },
]

describe('txInsightCards', () => {
  it('heads the pager with the title and the page count', () => {
    const wrapper = mount(TxInsightCards, { props: { pages: PAGES } })

    expect(wrapper.find('.tx-bui-insight-cards__title').text()).toBe('Insights')
    expect(wrapper.find('.tx-bui-insight-cards__count').text()).toBe('3')
  })

  it('names both step buttons for assistive tech', () => {
    const wrapper = mount(TxInsightCards, { props: { pages: PAGES } })
    const steps = wrapper.findAll('.tx-bui-insight-cards__step')

    expect(steps[0]!.attributes('aria-label')).toBe('Previous insight')
    expect(steps[1]!.attributes('aria-label')).toBe('Next insight')
  })

  it('pages itself when the host does not bind activeIndex', async () => {
    const wrapper = mount(TxInsightCards, { props: { pages: PAGES } })

    await wrapper.findAll('.tx-bui-insight-cards__step')[1]!.trigger('click')

    expect(wrapper.emitted('update:activeIndex')).toEqual([[1]])
    expect(wrapper.emitted('change')?.[0]).toEqual([PAGES[1], 1])
    expect(wrapper.find('.tx-bui-insight-cards__prose').text()).toBe('Unusually high freezer bill.')
  })

  it('lets a bound activeIndex own the page', async () => {
    const wrapper = mount(TxInsightCards, { props: { pages: PAGES, activeIndex: 0 } })

    await wrapper.findAll('.tx-bui-insight-cards__step')[1]!.trigger('click')
    expect(wrapper.emitted('update:activeIndex')).toEqual([[1]])
    expect(wrapper.find('.tx-bui-insight-cards__prose').text()).toBe('Rocky Road is the worst performer.')

    await wrapper.setProps({ activeIndex: 1 })
    expect(wrapper.find('.tx-bui-insight-cards__prose').text()).toBe('Unusually high freezer bill.')
  })

  it('wraps around both ends by default', async () => {
    const wrapper = mount(TxInsightCards, { props: { pages: PAGES } })

    await wrapper.findAll('.tx-bui-insight-cards__step')[0]!.trigger('click')
    expect(wrapper.emitted('update:activeIndex')).toEqual([[2]])

    await wrapper.findAll('.tx-bui-insight-cards__step')[1]!.trigger('click')
    expect(wrapper.emitted('update:activeIndex')).toEqual([[2], [0]])
  })

  it('disables the ends when looping is off', async () => {
    const wrapper = mount(TxInsightCards, { props: { pages: PAGES, loop: false } })
    const steps = wrapper.findAll('.tx-bui-insight-cards__step')

    expect(steps[0]!.attributes('disabled')).toBeDefined()
    expect(steps[1]!.attributes('disabled')).toBeUndefined()

    await wrapper.setProps({ activeIndex: 2 })
    expect(wrapper.findAll('.tx-bui-insight-cards__step')[1]!.attributes('disabled')).toBeDefined()
  })

  it('clamps an out-of-range activeIndex instead of blanking the body', () => {
    const wrapper = mount(TxInsightCards, { props: { pages: PAGES, activeIndex: 99 } })
    expect(wrapper.find('.tx-bui-insight-cards__prose').text()).toBe('Heavily invested in Vanilla.')
  })

  it('renders the follow-up pill only for pages that carry one', async () => {
    const wrapper = mount(TxInsightCards, { props: { pages: PAGES, activeIndex: 0 } })
    const pill = wrapper.find('.tx-bui-insight-cards__follow-up')

    expect(pill.text()).toBe('Should I rebalance flavors?')
    await pill.trigger('click')
    expect(wrapper.emitted('followUp')?.[0]).toEqual([PAGES[0]])

    await wrapper.setProps({ activeIndex: 2 })
    expect(wrapper.find('.tx-bui-insight-cards__follow-up').exists()).toBe(false)
  })

  it('hands the active page to the card and prose slots', () => {
    const wrapper = mount(TxInsightCards, {
      props: { pages: PAGES, activeIndex: 1 },
      slots: {
        default: '<template #default="{ page, index }"><i class="card">{{ page.key }}:{{ index }}</i></template>',
        prose: '<template #prose="{ page }"><b class="rich">{{ page.key }}</b></template>',
      },
    })

    expect(wrapper.find('.card').text()).toBe('anomaly:1')
    expect(wrapper.find('.rich').text()).toBe('anomaly')
  })

  it('exposes imperative paging', async () => {
    const wrapper = mount(TxInsightCards, { props: { pages: PAGES } })
    const vm = wrapper.vm as unknown as { goTo: (i: number) => void, next: () => void }

    vm.goTo(2)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.tx-bui-insight-cards__prose').text()).toBe('Heavily invested in Vanilla.')

    vm.next()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:activeIndex')).toEqual([[2], [0]])
  })

  it('renders an empty pager without a body', () => {
    const wrapper = mount(TxInsightCards, { props: { pages: [] } })

    expect(wrapper.find('.tx-bui-insight-cards__body').exists()).toBe(false)
    expect(wrapper.find('.tx-bui-insight-cards__count').text()).toBe('0')
    for (const step of wrapper.findAll('.tx-bui-insight-cards__step'))
      expect(step.attributes('disabled')).toBeDefined()
  })
})

describe('txInsightMetric', () => {
  it('signs a rise with a plus and the positive tone', () => {
    const wrapper = mount(TxInsightMetric, { props: { label: 'Pistachio', value: 1.15 } })

    expect(wrapper.find('.tx-bui-insight-metric__value').text()).toBe('+1.15%')
    expect(wrapper.classes()).toContain('is-positive')
  })

  it('signs a fall with U+2212, never an ASCII hyphen', () => {
    const wrapper = mount(TxInsightMetric, { props: { label: 'Mint Chip', value: -4.41 } })
    const text = wrapper.find('.tx-bui-insight-metric__value').text()

    expect(text).toBe('−4.41%')
    expect(text).not.toContain('-')
    expect(wrapper.classes()).toContain('is-negative')
  })

  it('reads zero as neutral', () => {
    const wrapper = mount(TxInsightMetric, { props: { label: 'Flat', value: 0 } })

    expect(wrapper.find('.tx-bui-insight-metric__value').text()).toBe('0.00%')
    expect(wrapper.classes()).toContain('is-neutral')
  })

  it('honours unit and precision', () => {
    const wrapper = mount(TxInsightMetric, {
      props: { label: 'Usage', value: 96.4, unit: ' kWh', precision: 0 },
    })
    expect(wrapper.find('.tx-bui-insight-metric__value').text()).toBe('+96 kWh')
  })

  it('takes a pre-formatted headline and an explicit tone', () => {
    const wrapper = mount(TxInsightMetric, {
      props: { label: 'Spend', delta: '$2,112 spent', tone: 'neutral', value: -3 },
    })

    expect(wrapper.find('.tx-bui-insight-metric__value').text()).toBe('$2,112 spent')
    expect(wrapper.classes()).toContain('is-neutral')
  })

  it('accepts a custom formatter', () => {
    const wrapper = mount(TxInsightMetric, {
      props: { label: 'Delta', value: -2, formatter: (v: number) => `${v} pts` },
    })
    expect(wrapper.find('.tx-bui-insight-metric__value').text()).toBe('-2 pts')
  })

  it('renders the swatch and the mono detail line only when given', () => {
    const bare = mount(TxInsightMetric, { props: { label: 'Bare' } })
    expect(bare.find('.tx-bui-insight-metric__dot').exists()).toBe(false)
    expect(bare.find('.tx-bui-insight-metric__detail').exists()).toBe(false)
    expect(bare.find('.tx-bui-insight-metric__value').exists()).toBe(false)

    const full = mount(TxInsightMetric, {
      props: { label: 'Mint Chip', value: -4.41, detail: '−$2,377.66', color: 'var(--tx-bui-orange)' },
    })
    expect(full.find('.tx-bui-insight-metric__dot').attributes('style')).toContain('var(--tx-bui-orange)')
    expect(full.find('.tx-bui-insight-metric__detail').text()).toBe('−$2,377.66')
  })
})
