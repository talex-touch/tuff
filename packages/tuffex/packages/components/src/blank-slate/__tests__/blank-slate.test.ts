import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import TxBlankSlate, { TxBlankSlate as InstalledBlankSlate } from '../index'

const EmptyStateStub = defineComponent({
  name: 'TxEmptyState',
  props: {
    variant: { type: String, default: undefined },
    size: { type: String, default: undefined },
    layout: { type: String, default: undefined },
    surface: { type: String, default: undefined },
    title: { type: String, default: undefined },
    description: { type: String, default: undefined },
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

function mountBlankSlate(options: Parameters<typeof mount<typeof TxBlankSlate>>[1] = {}) {
  return mount(TxBlankSlate, {
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

describe('txBlankSlate', () => {
  it('forwards blank-slate variant with onboarding defaults', () => {
    const wrapper = mountBlankSlate({
      props: {
        title: 'Create project',
        description: 'Start with a focused workspace.',
        primaryAction: { label: 'Create', type: 'primary' },
      },
    })

    const empty = wrapper.findComponent(EmptyStateStub)
    expect(empty.props()).toMatchObject({
      variant: 'blank-slate',
      size: 'large',
      layout: 'vertical',
      surface: 'plain',
      title: 'Create project',
      description: 'Start with a focused workspace.',
      primaryAction: { label: 'Create', type: 'primary' },
    })
  })

  it('lets explicit layout props override BlankSlate defaults', () => {
    const wrapper = mountBlankSlate({
      props: {
        size: 'small',
        layout: 'horizontal',
        surface: 'card',
      },
    })

    expect(wrapper.findComponent(EmptyStateStub).props()).toMatchObject({
      variant: 'blank-slate',
      size: 'small',
      layout: 'horizontal',
      surface: 'card',
    })
  })

  it('forwards named slots to EmptyState', () => {
    const wrapper = mountBlankSlate({
      slots: {
        icon: '<span class="custom-icon">Icon</span>',
        title: '<strong class="custom-title">Title</strong>',
        description: '<p class="custom-description">Description</p>',
        actions: '<button class="custom-action">Action</button>',
      },
    })

    expect(wrapper.find('.custom-icon').text()).toBe('Icon')
    expect(wrapper.find('.custom-title').text()).toBe('Title')
    expect(wrapper.find('.custom-description').text()).toBe('Description')
    expect(wrapper.find('.custom-action').text()).toBe('Action')
  })

  it('registers the component through install', () => {
    const app = { component: vi.fn() }

    InstalledBlankSlate.install?.(app as any)

    expect(app.component).toHaveBeenCalledWith('TxBlankSlate', InstalledBlankSlate)
  })
})
