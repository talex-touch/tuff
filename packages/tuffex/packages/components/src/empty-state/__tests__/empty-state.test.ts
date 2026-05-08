import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxEmptyState from '../src/TxEmptyState.vue'

describe('txEmptyState', () => {
  it('renders variant defaults and layout classes', () => {
    const wrapper = mount(TxEmptyState, {
      props: {
        variant: 'search-empty',
        layout: 'horizontal',
        align: 'start',
        size: 'large',
        surface: 'card',
      },
    })

    expect(wrapper.text()).toContain('No results')
    expect(wrapper.text()).toContain('Try a different keyword or filter.')
    expect(wrapper.classes()).toContain('tx-empty-state--layout-horizontal')
    expect(wrapper.classes()).toContain('tx-empty-state--align-start')
    expect(wrapper.classes()).toContain('tx-empty-state--size-large')
    expect(wrapper.classes()).toContain('tx-empty-state--card')
    expect(wrapper.find('.tx-empty-state__illustration').attributes('data-variant')).toBe('search-empty')
  })

  it('lets explicit title and description replace preset text', () => {
    const wrapper = mount(TxEmptyState, {
      props: {
        variant: 'no-data',
        title: 'No invoices',
        description: 'Create an invoice to start billing.',
      },
    })

    expect(wrapper.text()).toContain('No invoices')
    expect(wrapper.text()).toContain('Create an invoice to start billing.')
    expect(wrapper.text()).not.toContain('No data available yet.')
  })

  it('uses custom slots instead of generated icon, text, and actions', () => {
    const wrapper = mount(TxEmptyState, {
      props: {
        variant: 'custom',
        primaryAction: { label: 'Create' },
      },
      slots: {
        icon: '<span class="custom-icon">Custom icon</span>',
        title: '<strong>Custom title</strong>',
        description: '<em>Custom description</em>',
        actions: '<button>Custom action</button>',
      },
    })

    expect(wrapper.find('.custom-icon').text()).toBe('Custom icon')
    expect(wrapper.find('.tx-empty-state__title').text()).toBe('Custom title')
    expect(wrapper.find('.tx-empty-state__description').text()).toBe('Custom description')
    expect(wrapper.find('.tx-empty-state__actions').text()).toBe('Custom action')
    expect(wrapper.text()).not.toContain('Create')
  })

  it('emits action events and forwards action props', async () => {
    const wrapper = mount(TxEmptyState, {
      props: {
        primaryAction: {
          label: 'Retry',
          type: 'primary',
          size: 'large',
          icon: 'i-carbon-renew',
        },
        secondaryAction: {
          label: 'Dismiss',
          disabled: true,
        },
        actionSize: 'small',
      },
    })

    const buttons = wrapper.findAll('button')

    expect(buttons).toHaveLength(2)
    expect(buttons[0].text()).toContain('Dismiss')
    expect(buttons[0].attributes('disabled')).toBeDefined()
    expect(buttons[0].classes()).toContain('tx-size-sm')
    expect(buttons[1].text()).toContain('Retry')
    expect(buttons[1].classes()).toContain('variant-primary')
    expect(buttons[1].classes()).toContain('tx-size-lg')
    expect(buttons[1].find('.tx-button__icon').classes()).toContain('i-carbon-renew')

    await buttons[0].trigger('click')
    await buttons[1].trigger('click')

    expect(wrapper.emitted('secondary')).toBeUndefined()
    expect(wrapper.emitted('primary')).toHaveLength(1)
  })

  it('shows a spinner only when loading has no custom icon source', () => {
    const loading = mount(TxEmptyState, {
      props: {
        loading: true,
        variant: 'loading',
      },
    })

    expect(loading.findComponent({ name: 'TxSpinner' }).exists()).toBe(true)
    expect(loading.find('.tx-empty-state__illustration').exists()).toBe(false)

    const withIcon = mount(TxEmptyState, {
      props: {
        loading: true,
        icon: 'i-carbon-search',
      },
    })

    expect(withIcon.findComponent({ name: 'TxSpinner' }).exists()).toBe(false)
    expect(withIcon.find('.tx-empty-state__icon .i-carbon-search').exists()).toBe(true)
  })

  it('hides the icon area when icon is explicitly null', () => {
    const wrapper = mount(TxEmptyState, {
      props: {
        icon: null,
      },
    })

    expect(wrapper.find('.tx-empty-state__icon').exists()).toBe(false)
  })
})
