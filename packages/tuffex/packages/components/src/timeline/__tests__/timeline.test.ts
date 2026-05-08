import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxTimelineItem from '../src/TxTimelineItem.vue'
import TxTimeline from '../src/TxTimeline.vue'

describe('txTimeline', () => {
  it('provides list semantics and vertical layout by default', () => {
    const wrapper = mount(TxTimeline, {
      slots: {
        default: `
          <TxTimelineItem title="Created" time="09:00" color="primary">Created event</TxTimelineItem>
          <TxTimelineItem title="Done" time="10:00" color="success">Done event</TxTimelineItem>
        `,
      },
      global: {
        components: { TxTimelineItem },
      },
    })

    expect(wrapper.attributes('role')).toBe('list')
    expect(wrapper.classes()).toContain('tx-timeline--vertical')
    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(2)
  })

  it('passes horizontal layout to timeline items', () => {
    const wrapper = mount(TxTimeline, {
      props: {
        layout: 'horizontal',
      },
      slots: {
        default: '<TxTimelineItem title="Build" />',
      },
      global: {
        components: { TxTimelineItem },
      },
    })

    expect(wrapper.classes()).toContain('tx-timeline--horizontal')
    expect(wrapper.find('.tx-timeline-item').classes()).toContain('tx-timeline-item--horizontal')
  })

  it('renders title, time, default slot, icon, and semantic color', () => {
    const wrapper = mount(TxTimelineItem, {
      props: {
        title: 'Build',
        time: '12:00',
        icon: 'i-carbon-checkmark',
        color: 'success',
      },
      slots: {
        default: 'Build completed',
      },
    })

    expect(wrapper.text()).toContain('Build')
    expect(wrapper.text()).toContain('12:00')
    expect(wrapper.text()).toContain('Build completed')
    expect(wrapper.find('.tx-timeline-item__icon').exists()).toBe(true)
    expect(wrapper.find('.tx-timeline-item__dot').classes()).toContain('tx-timeline-item__dot--success')
  })

  it('applies active state to both item and dot', () => {
    const wrapper = mount(TxTimelineItem, {
      props: {
        title: 'Current',
        active: true,
      },
    })

    expect(wrapper.classes()).toContain('tx-timeline-item--active')
    expect(wrapper.find('.tx-timeline-item__dot').classes()).toContain('tx-timeline-item__dot--active')
  })
})
