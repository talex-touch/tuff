import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import TxOfflineState, { TxOfflineState as InstalledOfflineState } from '../index'

const EmptyStateStub = defineComponent({
  name: 'TxEmptyState',
  props: {
    variant: { type: String, default: undefined },
    title: { type: String, default: undefined },
    description: { type: String, default: undefined },
    surface: { type: String, default: undefined },
    primaryAction: { type: Object, default: undefined },
  },
  setup(_, { slots }) {
    return () => h('section', { class: 'empty-state-stub' }, [
      slots.icon?.(),
      slots.title?.(),
      slots.description?.(),
      slots.actions?.(),
    ])
  },
})

function mountOfflineState(options: Parameters<typeof mount<typeof TxOfflineState>>[1] = {}) {
  return mount(TxOfflineState, {
    ...options,
    global: {
      ...(options.global ?? {}),
      stubs: {
        TxEmptyState: EmptyStateStub,
        ...(options.global?.stubs ?? {}),
      },
    },
  })
}

describe('txOfflineState', () => {
  it('forwards the offline variant and action props', () => {
    const wrapper = mountOfflineState({
      props: {
        title: 'Offline',
        description: 'Network connection lost.',
        surface: 'card',
        primaryAction: { label: 'Retry', type: 'primary' },
      },
    })

    expect(wrapper.findComponent(EmptyStateStub).props()).toMatchObject({
      variant: 'offline',
      title: 'Offline',
      description: 'Network connection lost.',
      surface: 'card',
      primaryAction: { label: 'Retry', type: 'primary' },
    })
  })

  it('forwards named slots to EmptyState', () => {
    const wrapper = mountOfflineState({
      slots: {
        icon: '<span class="custom-icon">Icon</span>',
        title: '<strong class="custom-title">Title</strong>',
        description: '<p class="custom-description">Description</p>',
        actions: '<button class="custom-action">Retry</button>',
      },
    })

    expect(wrapper.find('.custom-icon').text()).toBe('Icon')
    expect(wrapper.find('.custom-title').text()).toBe('Title')
    expect(wrapper.find('.custom-description').text()).toBe('Description')
    expect(wrapper.find('.custom-action').text()).toBe('Retry')
  })

  it('registers the component through install', () => {
    const app = { component: vi.fn() }

    InstalledOfflineState.install?.(app as any)

    expect(app.component).toHaveBeenCalledWith('TxOfflineState', InstalledOfflineState)
  })
})
