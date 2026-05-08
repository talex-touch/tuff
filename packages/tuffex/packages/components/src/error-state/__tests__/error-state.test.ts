import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import TxErrorState, { TxErrorState as InstalledErrorState } from '../index'

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

function mountErrorState(options: Parameters<typeof mount<typeof TxErrorState>>[1] = {}) {
  return mount(TxErrorState, {
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

describe('txErrorState', () => {
  it('forwards the error variant and action props', () => {
    const wrapper = mountErrorState({
      props: {
        title: 'Failed to load data',
        description: 'Please retry.',
        surface: 'card',
        primaryAction: { label: 'Retry', type: 'primary' },
      },
    })

    expect(wrapper.findComponent(EmptyStateStub).props()).toMatchObject({
      variant: 'error',
      title: 'Failed to load data',
      description: 'Please retry.',
      surface: 'card',
      primaryAction: { label: 'Retry', type: 'primary' },
    })
  })

  it('forwards named slots to EmptyState', () => {
    const wrapper = mountErrorState({
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

    InstalledErrorState.install?.(app as any)

    expect(app.component).toHaveBeenCalledWith('TxErrorState', InstalledErrorState)
  })
})
