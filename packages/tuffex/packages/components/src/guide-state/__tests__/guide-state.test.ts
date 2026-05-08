import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import TxGuideState, { TxGuideState as InstalledGuideState } from '../index'

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

function mountGuideState(options: Parameters<typeof mount<typeof TxGuideState>>[1] = {}) {
  return mount(TxGuideState, {
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

describe('txGuideState', () => {
  it('forwards the guide variant and action props', () => {
    const wrapper = mountGuideState({
      props: {
        title: 'Create your first workspace',
        description: 'Follow the setup steps.',
        surface: 'card',
        primaryAction: { label: 'Get Started', type: 'primary' },
      },
    })

    expect(wrapper.findComponent(EmptyStateStub).props()).toMatchObject({
      variant: 'guide',
      title: 'Create your first workspace',
      description: 'Follow the setup steps.',
      surface: 'card',
      primaryAction: { label: 'Get Started', type: 'primary' },
    })
  })

  it('forwards named slots to EmptyState', () => {
    const wrapper = mountGuideState({
      slots: {
        icon: '<span class="custom-icon">Icon</span>',
        title: '<strong class="custom-title">Title</strong>',
        description: '<p class="custom-description">Description</p>',
        actions: '<button class="custom-action">Start</button>',
      },
    })

    expect(wrapper.find('.custom-icon').text()).toBe('Icon')
    expect(wrapper.find('.custom-title').text()).toBe('Title')
    expect(wrapper.find('.custom-description').text()).toBe('Description')
    expect(wrapper.find('.custom-action').text()).toBe('Start')
  })

  it('registers the component through install', () => {
    const app = { component: vi.fn() }

    InstalledGuideState.install?.(app as any)

    expect(app.component).toHaveBeenCalledWith('TxGuideState', InstalledGuideState)
  })
})
