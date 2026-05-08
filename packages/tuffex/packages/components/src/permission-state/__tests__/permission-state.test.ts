import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import TxPermissionState, { TxPermissionState as InstalledPermissionState } from '../index'

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

function mountPermissionState(options: Parameters<typeof mount<typeof TxPermissionState>>[1] = {}) {
  return mount(TxPermissionState, {
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

describe('txPermissionState', () => {
  it('forwards the permission variant and action props', () => {
    const wrapper = mountPermissionState({
      props: {
        title: 'Permission required',
        description: 'Request access to continue.',
        surface: 'card',
        primaryAction: { label: 'Request access', type: 'primary' },
      },
    })

    expect(wrapper.findComponent(EmptyStateStub).props()).toMatchObject({
      variant: 'permission',
      title: 'Permission required',
      description: 'Request access to continue.',
      surface: 'card',
      primaryAction: { label: 'Request access', type: 'primary' },
    })
  })

  it('forwards named slots to EmptyState', () => {
    const wrapper = mountPermissionState({
      slots: {
        icon: '<span class="custom-icon">Icon</span>',
        title: '<strong class="custom-title">Title</strong>',
        description: '<p class="custom-description">Description</p>',
        actions: '<button class="custom-action">Request</button>',
      },
    })

    expect(wrapper.find('.custom-icon').text()).toBe('Icon')
    expect(wrapper.find('.custom-title').text()).toBe('Title')
    expect(wrapper.find('.custom-description').text()).toBe('Description')
    expect(wrapper.find('.custom-action').text()).toBe('Request')
  })

  it('registers the component through install', () => {
    const app = { component: vi.fn() }

    InstalledPermissionState.install?.(app as any)

    expect(app.component).toHaveBeenCalledWith('TxPermissionState', InstalledPermissionState)
  })
})
