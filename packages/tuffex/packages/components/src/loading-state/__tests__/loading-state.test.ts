import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import TxLoadingState, { TxLoadingState as InstalledLoadingState } from '../index'

const EmptyStateStub = defineComponent({
  name: 'TxEmptyState',
  props: {
    variant: { type: String, default: undefined },
    title: { type: String, default: undefined },
    description: { type: String, default: undefined },
    loading: { type: Boolean, default: undefined },
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

function mountLoadingState(options: Parameters<typeof mount<typeof TxLoadingState>>[1] = {}) {
  return mount(TxLoadingState, {
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

describe('txLoadingState', () => {
  it('forwards the loading variant and explicit props', () => {
    const wrapper = mountLoadingState({
      props: {
        title: 'Loading workspace',
        description: 'Fetching official plugins.',
        loading: true,
        primaryAction: { label: 'Cancel' },
      },
    })

    expect(wrapper.findComponent(EmptyStateStub).props()).toMatchObject({
      variant: 'loading',
      title: 'Loading workspace',
      description: 'Fetching official plugins.',
      loading: true,
      primaryAction: { label: 'Cancel' },
    })
  })

  it('forwards named slots to EmptyState', () => {
    const wrapper = mountLoadingState({
      slots: {
        icon: '<span class="custom-icon">Icon</span>',
        title: '<strong class="custom-title">Title</strong>',
        description: '<p class="custom-description">Description</p>',
        actions: '<button class="custom-action">Cancel</button>',
      },
    })

    expect(wrapper.find('.custom-icon').text()).toBe('Icon')
    expect(wrapper.find('.custom-title').text()).toBe('Title')
    expect(wrapper.find('.custom-description').text()).toBe('Description')
    expect(wrapper.find('.custom-action').text()).toBe('Cancel')
  })

  it('registers the component through install', () => {
    const app = { component: vi.fn() }

    InstalledLoadingState.install?.(app as any)

    expect(app.component).toHaveBeenCalledWith('TxLoadingState', InstalledLoadingState)
  })
})
