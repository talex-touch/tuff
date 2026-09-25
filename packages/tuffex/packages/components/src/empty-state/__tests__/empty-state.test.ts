import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxEmptyState from '../src/TxEmptyState.vue'
import txEmptyStateSource from '../src/TxEmptyState.vue?raw'

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

  it('draws the error illustration as a window with a rippling danger badge', () => {
    const wrapper = mount(TxEmptyState, { props: { variant: 'error' } })
    const illustration = wrapper.find('.tx-empty-state__illustration')

    expect(illustration.attributes('data-variant')).toBe('error')
    expect(illustration.find('.tx-empty-state__error-window').exists()).toBe(true)
    expect(illustration.find('.tx-empty-state__error-badge').exists()).toBe(true)
    expect(illustration.find('.tx-empty-state__error-mark').exists()).toBe(true)
    // Two rings half a cycle apart; they used to be two static, unstyled circles.
    expect(illustration.findAll('.tx-empty-state__error-pulse')).toHaveLength(2)
    expect(illustration.find('.tx-empty-state__error-pulse--late').exists()).toBe(true)
  })

  it('styles the error ripple and stops it under reduced motion', () => {
    expect(txEmptyStateSource).toMatch(/\.tx-empty-state__error-pulse \{[^}]*animation: tx-empty-state-error-ripple/)
    expect(txEmptyStateSource).toContain('@keyframes tx-empty-state-error-ripple')
    // The still frame is the window and its badge: the rings rest at opacity 0.
    expect(txEmptyStateSource).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.tx-empty-state__error-pulse \{\s*animation: none;/,
    )
  })

  it('stops every illustration animation under reduced motion on a complete frame', () => {
    const style = txEmptyStateSource
      .slice(txEmptyStateSource.indexOf('<style'))
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const reducedBlocks = [...style.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)]
      .map(match => match[1]!)
      .join('\n')
    const stopped = new Set(
      [...reducedBlocks.matchAll(/([^{}]+)\{\s*animation: none;/g)]
        .flatMap(match => match[1]!.split(',').map(selector => selector.trim())),
    )
    const animated = [...style.matchAll(/\n([^{}\n@][^{}]*)\{[^}]*animation: tx-empty-state-/g)]
      .flatMap(match => match[1]!.split(',').map(selector => selector.trim()))
      .filter(Boolean)

    expect(animated.length).toBeGreaterThan(15)
    for (const selector of animated) {
      // The dust modifiers (`--1/2/3`) sit on elements that also carry the base class.
      const base = selector.replace(/--\d$/, '')
      expect(stopped.has(selector) || stopped.has(base), `${selector} has no reduced-motion stop`).toBe(true)
    }

    // Parts the animation draws rest on its last frame, not on its hidden start.
    expect(reducedBlocks).toMatch(/\.tx-empty-state__chart-line,\s*\.tx-empty-state__offline-slash \{\s*stroke-dashoffset: 0;/)
    expect(reducedBlocks).toMatch(/\.tx-empty-state__chart-dot \{\s*opacity: 1;/)
    expect(reducedBlocks).toMatch(/\.tx-empty-state__chart-marks \{\s*opacity: 0\.6;/)
    expect(reducedBlocks).toMatch(/\.tx-empty-state__search-bubble \{\s*transform: scale\(1\) translate\(-50%, -10px\);/)
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
