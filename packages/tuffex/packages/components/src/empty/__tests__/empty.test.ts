import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxEmpty from '../src/TxEmpty.vue'

const EmptyStateStub = {
  name: 'TxEmptyState',
  props: {
    variant: { type: String, default: '' },
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    icon: { type: String, default: '' },
    size: { type: String, default: '' },
    surface: { type: String, default: '' },
    layout: { type: String, default: '' },
  },
  template: `
    <section
      class="empty-state-stub"
      :data-variant="variant"
      :data-title="title"
      :data-description="description"
      :data-icon="icon"
      :data-size="size"
      :data-surface="surface"
      :data-layout="layout"
    >
      <div class="slot-icon"><slot name="icon" /></div>
      <div class="slot-title"><slot name="title" /></div>
      <div class="slot-description"><slot name="description" /></div>
      <div class="slot-actions"><slot name="actions" /></div>
    </section>
  `,
}

function mountEmpty(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(TxEmpty, {
    props,
    slots,
    global: {
      stubs: {
        TxEmptyState: EmptyStateStub,
      },
    },
  })
}

describe('txEmpty', () => {
  it('forwards empty-state defaults and text props', () => {
    const wrapper = mountEmpty({
      title: 'No results',
      description: 'Try another filter.',
      iconClass: 'i-carbon-search',
    })
    const state = wrapper.find('.empty-state-stub')

    expect(state.attributes('data-variant')).toBe('empty')
    expect(state.attributes('data-title')).toBe('No results')
    expect(state.attributes('data-description')).toBe('Try another filter.')
    expect(state.attributes('data-icon')).toBe('i-carbon-search')
    expect(state.attributes('data-size')).toBe('medium')
    expect(state.attributes('data-surface')).toBe('card')
    expect(state.attributes('data-layout')).toBe('vertical')
  })

  it('uses small empty-state size in compact mode', () => {
    const wrapper = mountEmpty({ compact: true })

    expect(wrapper.find('.empty-state-stub').attributes('data-size')).toBe('small')
  })

  it('maps wrapper slots to EmptyState slots', () => {
    const wrapper = mountEmpty({}, {
      icon: '<span>Custom icon</span>',
      title: '<strong>Custom title</strong>',
      description: '<em>Custom description</em>',
      action: '<button>Retry</button>',
    })

    expect(wrapper.find('.slot-icon').text()).toBe('Custom icon')
    expect(wrapper.find('.slot-title').text()).toBe('Custom title')
    expect(wrapper.find('.slot-description').text()).toBe('Custom description')
    expect(wrapper.find('.slot-actions').text()).toBe('Retry')
  })
})
