import type { RecommendationOption } from '../src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxRecommendationCard from '../src/TxRecommendationCard.vue'

function options(): RecommendationOption[] {
  return [
    {
      key: 'high',
      text: 'Reorder waffle cones from cone_king with lead time 7_days.',
      short: 'Reorder from cone_king · 7-day lead',
      confidence: 'high',
      label: 'High confidence',
      cta: 'Accept',
      ctaTone: 'accent',
    },
    {
      key: 'review',
      text: 'Switch vanilla to vanilla_madagascar for peak season.',
      short: 'Switch to vanilla_madagascar',
      confidence: 'medium',
      label: 'Needs review',
      cta: 'Configure',
    },
    {
      key: 'none',
      text: 'Fall back to a full restock across every SKU.',
      short: 'Full restock across every SKU',
      confidence: 'none',
      label: 'No signal',
      cta: 'Accept full restock',
    },
  ]
}

function mountCard(props: Record<string, unknown> = {}) {
  return mount(TxRecommendationCard, {
    props: { title: 'Want me to place this restock order?', options: options(), ...props },
  })
}

describe('txRecommendationCard', () => {
  it('promotes the first option by default and shows its rationale', () => {
    const wrapper = mountCard()

    expect(wrapper.find('.tx-bui-recommendation-card__title').text()).toBe('Want me to place this restock order?')
    expect(wrapper.find('.tx-bui-recommendation-card__body').text()).toContain('cone_king')
    expect(wrapper.find('.tx-bui-recommendation-card__confidence-label').text()).toBe('High confidence')
  })

  it('derives meter fill from the confidence level', () => {
    const wrapper = mountCard()

    const footerMeter = wrapper.find('.tx-bui-recommendation-card__confidence .tx-bui-signal-meter')
    expect(footerMeter.findAll('.tx-bui-signal-meter__bar.is-filled')).toHaveLength(3)
    expect(footerMeter.attributes('style')).toContain('--tx-bui-signal-meter-tone: var(--tx-bui-green')
  })

  it('lets an explicit signal and tone override the confidence mapping', () => {
    const wrapper = mountCard({
      options: [{ key: 'x', short: 'x', label: 'Custom', confidence: 'none', signal: 2, tone: 'hotpink' }],
    })

    const meter = wrapper.find('.tx-bui-recommendation-card__confidence .tx-bui-signal-meter')
    expect(meter.findAll('.tx-bui-signal-meter__bar.is-filled')).toHaveLength(2)
    expect(meter.attributes('style')).toContain('--tx-bui-signal-meter-tone: hotpink')
  })

  it('lists only the alternatives, never the promoted option', () => {
    const wrapper = mountCard()
    const alts = wrapper.findAll('.tx-bui-recommendation-card__alt')

    expect(alts).toHaveLength(2)
    expect(alts.map(alt => alt.find('.tx-bui-recommendation-card__alt-text').text())).toEqual([
      'Switch to vanilla_madagascar',
      'Full restock across every SKU',
    ])
  })

  it('toggles the drawer through an accessible control', async () => {
    const wrapper = mountCard()
    const toggle = wrapper.find('.tx-bui-recommendation-card__alternatives')
    const drawer = wrapper.find('.tx-bui-recommendation-card__drawer')

    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.attributes('aria-controls')).toBe(drawer.attributes('id'))
    expect(drawer.classes()).not.toContain('is-open')

    await toggle.trigger('click')
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([true])
    expect(wrapper.find('.tx-bui-recommendation-card__drawer').classes()).toContain('is-open')
  })

  it('keeps the collapsed drawer out of the tab order', async () => {
    const wrapper = mountCard()
    const clip = () => wrapper.find('.tx-bui-recommendation-card__drawer-clip')

    expect(clip().attributes('inert')).toBeDefined()

    await wrapper.find('.tx-bui-recommendation-card__alternatives').trigger('click')
    expect(clip().attributes('inert')).toBeUndefined()
  })

  it('promotes a picked alternative and retracts the drawer', async () => {
    const wrapper = mountCard()

    await wrapper.find('.tx-bui-recommendation-card__alternatives').trigger('click')
    await wrapper.findAll('.tx-bui-recommendation-card__alt')[0]!.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['review'])
    expect(wrapper.emitted('select')?.[0]?.[0]).toMatchObject({ key: 'review' })
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
    expect(wrapper.find('.tx-bui-recommendation-card__confidence-label').text()).toBe('Needs review')
    expect(wrapper.find('.tx-bui-recommendation-card__accept').text()).toBe('Configure')
  })

  it('confirms and reports the accepted option', async () => {
    const wrapper = mountCard()

    await wrapper.find('.tx-bui-recommendation-card__accept').trigger('click')

    expect(wrapper.emitted('accept')?.[0]?.[0]).toMatchObject({ key: 'high' })
    expect(wrapper.emitted('update:accepted')?.at(-1)).toEqual([true])

    const button = wrapper.find('.tx-bui-recommendation-card__accept')
    expect(button.text()).toBe('Accepted')
    expect(button.classes()).toContain('is-accepted')
  })

  it('drops the accepted state when a different option is promoted', async () => {
    const wrapper = mountCard()

    await wrapper.find('.tx-bui-recommendation-card__accept').trigger('click')
    await wrapper.find('.tx-bui-recommendation-card__alternatives').trigger('click')
    await wrapper.findAll('.tx-bui-recommendation-card__alt')[0]!.trigger('click')

    expect(wrapper.emitted('update:accepted')?.at(-1)).toEqual([false])
    expect(wrapper.find('.tx-bui-recommendation-card__accept').classes()).not.toContain('is-accepted')
  })

  it('maps the cta tone onto the primary action', async () => {
    const wrapper = mountCard()
    expect(wrapper.find('.tx-bui-recommendation-card__accept').classes()).toContain('is-tone-accent')

    await wrapper.setProps({ modelValue: 'review' })
    expect(wrapper.find('.tx-bui-recommendation-card__accept').classes()).toContain('is-tone-ink')
  })

  it('honours controlled selection and accepted state', async () => {
    const wrapper = mountCard({ modelValue: 'none', accepted: true })

    expect(wrapper.find('.tx-bui-recommendation-card__confidence-label').text()).toBe('No signal')
    expect(wrapper.find('.tx-bui-recommendation-card__accept').text()).toBe('Accepted')

    await wrapper.find('.tx-bui-recommendation-card__alternatives').trigger('click')
    await wrapper.findAll('.tx-bui-recommendation-card__alt')[0]!.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['high'])
    // The pinned prop still decides what renders.
    expect(wrapper.find('.tx-bui-recommendation-card__confidence-label').text()).toBe('No signal')
  })

  it('falls back to the generic accept wording when an option omits its cta', () => {
    const wrapper = mountCard({ options: [{ key: 'x', short: 'x', label: 'Unknown' }] })
    expect(wrapper.find('.tx-bui-recommendation-card__accept').text()).toBe('Accept')
  })

  it('renders nothing when there are no options', () => {
    const wrapper = mountCard({ options: [] })
    expect(wrapper.find('.tx-bui-recommendation-card').exists()).toBe(false)
  })

  it('lets the body slot carry rich markup', () => {
    const wrapper = mount(TxRecommendationCard, {
      props: { title: 't', options: options() },
      slots: { body: '<span>Reorder from <code>cone_king</code></span>' },
    })

    expect(wrapper.find('.tx-bui-recommendation-card__body code').text()).toBe('cone_king')
  })
})
