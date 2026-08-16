import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxDotIndicator from '../src/TxDotIndicator.vue'

describe('txDotIndicator', () => {
  it('renders the dot and label with the configured colour and size', () => {
    const wrapper = mount(TxDotIndicator, {
      props: { color: 'var(--tx-bui-green)', label: 'Very strong', size: 8 },
    })

    expect(wrapper.classes()).toContain('tx-bui-dot-indicator')
    expect(wrapper.find('.tx-bui-dot-indicator__label').text()).toBe('Very strong')
    expect(wrapper.attributes('style')).toContain('--tx-bui-dot-indicator-color: var(--tx-bui-green)')
    expect(wrapper.attributes('style')).toContain('--tx-bui-dot-indicator-size: 8px')
  })

  it('hides itself from assistive tech when it carries no text at all', () => {
    const wrapper = mount(TxDotIndicator, { props: { color: '#f09a2f' } })

    // A bare coloured dot means nothing to a screen reader; announcing an empty
    // element is worse than announcing nothing.
    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(wrapper.attributes('role')).toBeUndefined()
    expect(wrapper.find('.tx-bui-dot-indicator__label').exists()).toBe(false)
  })

  it('becomes an image with a name when only ariaLabel is given', () => {
    const wrapper = mount(TxDotIndicator, {
      props: { color: '#f09a2f', ariaLabel: 'Needs review' },
    })

    expect(wrapper.attributes('role')).toBe('img')
    expect(wrapper.attributes('aria-label')).toBe('Needs review')
    expect(wrapper.attributes('aria-hidden')).toBeUndefined()
  })

  it('lets a visible label speak for the dot instead of duplicating it', () => {
    const wrapper = mount(TxDotIndicator, {
      props: { label: 'Weak', ariaLabel: 'Weak' },
    })

    expect(wrapper.attributes('role')).toBeUndefined()
    expect(wrapper.attributes('aria-label')).toBeUndefined()
    expect(wrapper.attributes('aria-hidden')).toBeUndefined()
  })

  it('renders slot content in place of the label', () => {
    const wrapper = mount(TxDotIndicator, {
      props: { label: 'Fallback' },
      slots: { default: '<strong>44% average</strong>' },
    })

    expect(wrapper.find('.tx-bui-dot-indicator__label').text()).toBe('44% average')
    expect(wrapper.find('strong').exists()).toBe(true)
  })
})
