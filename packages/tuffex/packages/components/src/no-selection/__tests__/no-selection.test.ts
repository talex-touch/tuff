import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import TxNoSelection, { TxNoSelection as InstalledNoSelection } from '../index'

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

function mountNoSelection(options: Parameters<typeof mount<typeof TxNoSelection>>[1] = {}) {
  return mount(TxNoSelection, {
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

describe('txNoSelection', () => {
  it('forwards the no-selection variant and action props', () => {
    const wrapper = mountNoSelection({
      props: {
        title: 'No selection',
        description: 'Select an item to inspect it.',
        surface: 'card',
        primaryAction: { label: 'Create item', type: 'primary' },
      },
    })

    expect(wrapper.findComponent(EmptyStateStub).props()).toMatchObject({
      variant: 'no-selection',
      title: 'No selection',
      description: 'Select an item to inspect it.',
      surface: 'card',
      primaryAction: { label: 'Create item', type: 'primary' },
    })
  })

  it('forwards named slots to EmptyState', () => {
    const wrapper = mountNoSelection({
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

    InstalledNoSelection.install?.(app as any)

    expect(app.component).toHaveBeenCalledWith('TxNoSelection', InstalledNoSelection)
  })
})
