import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import TxNoData, { TxNoData as InstalledNoData } from '../index'

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

function mountNoData(options: Parameters<typeof mount<typeof TxNoData>>[1] = {}) {
  return mount(TxNoData, {
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

describe('txNoData', () => {
  it('forwards the no-data variant and action props', () => {
    const wrapper = mountNoData({
      props: {
        title: 'No records',
        description: 'Create the first record to continue.',
        surface: 'card',
        primaryAction: { label: 'Create', type: 'primary' },
      },
    })

    expect(wrapper.findComponent(EmptyStateStub).props()).toMatchObject({
      variant: 'no-data',
      title: 'No records',
      description: 'Create the first record to continue.',
      surface: 'card',
      primaryAction: { label: 'Create', type: 'primary' },
    })
  })

  it('forwards named slots to EmptyState', () => {
    const wrapper = mountNoData({
      slots: {
        icon: '<span class="custom-icon">Icon</span>',
        title: '<strong class="custom-title">Title</strong>',
        description: '<p class="custom-description">Description</p>',
        actions: '<button class="custom-action">Create</button>',
      },
    })

    expect(wrapper.find('.custom-icon').text()).toBe('Icon')
    expect(wrapper.find('.custom-title').text()).toBe('Title')
    expect(wrapper.find('.custom-description').text()).toBe('Description')
    expect(wrapper.find('.custom-action').text()).toBe('Create')
  })

  it('registers the component through install', () => {
    const app = { component: vi.fn() }

    InstalledNoData.install?.(app as any)

    expect(app.component).toHaveBeenCalledWith('TxNoData', InstalledNoData)
  })
})
