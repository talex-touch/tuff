import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import TxSearchEmpty, { TxSearchEmpty as InstalledSearchEmpty } from '../index'

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

function mountSearchEmpty(options: Parameters<typeof mount<typeof TxSearchEmpty>>[1] = {}) {
  return mount(TxSearchEmpty, {
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

describe('txSearchEmpty', () => {
  it('forwards the search-empty variant and action props', () => {
    const wrapper = mountSearchEmpty({
      props: {
        title: 'No results',
        description: 'Try another keyword or filter.',
        surface: 'card',
        primaryAction: { label: 'Clear filters' },
      },
    })

    expect(wrapper.findComponent(EmptyStateStub).props()).toMatchObject({
      variant: 'search-empty',
      title: 'No results',
      description: 'Try another keyword or filter.',
      surface: 'card',
      primaryAction: { label: 'Clear filters' },
    })
  })

  it('forwards named slots to EmptyState', () => {
    const wrapper = mountSearchEmpty({
      slots: {
        icon: '<span class="custom-icon">Icon</span>',
        title: '<strong class="custom-title">Title</strong>',
        description: '<p class="custom-description">Description</p>',
        actions: '<button class="custom-action">Clear</button>',
      },
    })

    expect(wrapper.find('.custom-icon').text()).toBe('Icon')
    expect(wrapper.find('.custom-title').text()).toBe('Title')
    expect(wrapper.find('.custom-description').text()).toBe('Description')
    expect(wrapper.find('.custom-action').text()).toBe('Clear')
  })

  it('registers the component through install', () => {
    const app = { component: vi.fn() }

    InstalledSearchEmpty.install?.(app as any)

    expect(app.component).toHaveBeenCalledWith('TxSearchEmpty', InstalledSearchEmpty)
  })
})
