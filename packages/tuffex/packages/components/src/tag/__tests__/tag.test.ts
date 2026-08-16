import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxTag from '../src/TxTag.vue'

describe('txTag', () => {
  it('renders label, icon, configured small size, and style variables', () => {
    const wrapper = mount(TxTag, {
      props: {
        label: 'Beta',
        icon: 'i-carbon-star',
        color: '#2563eb',
        size: 'sm',
      },
    })

    // A tag is static metadata, not a live region: it must not carry role="status"
    // (implicit aria-live), which would make every tag re-announce on content change.
    expect(wrapper.attributes('role')).toBeUndefined()
    expect(wrapper.classes()).toContain('tx-tag--sm')
    expect(wrapper.find('.tx-tag__content').text()).toBe('Beta')
    expect(wrapper.find('.tx-tag__icon').classes()).toContain('i-carbon-star')
    expect(wrapper.attributes('style')).toContain('--tx-tag-color: #2563eb')
  })

  it('renders the shared pill treatment when requested', () => {
    const wrapper = mount(TxTag, {
      props: {
        label: 'Release',
        pill: true,
        size: 'md',
      },
    })

    expect(wrapper.classes()).toContain('pill')
  })

  it('uses default slot instead of label', () => {
    const wrapper = mount(TxTag, {
      props: {
        label: 'Fallback',
      },
      slots: {
        default: '<strong>Slot tag</strong>',
      },
    })

    expect(wrapper.find('.tx-tag__content').text()).toBe('Slot tag')
    expect(wrapper.find('strong').exists()).toBe(true)
  })

  it('keeps the outline recipe as the default so existing tags are untouched', () => {
    const wrapper = mount(TxTag, { props: { label: 'Beta', color: '#2563eb' } })
    const style = wrapper.attributes('style') ?? ''

    expect(wrapper.classes()).toContain('tx-tag--outline')
    expect(style).toContain('--tx-tag-bg: color-mix(in srgb, #2563eb 12%, transparent)')
    expect(style).toContain('--tx-tag-border: color-mix(in srgb, #2563eb 32%, transparent)')
    // Outline text is the raw hue, so the new text variable is a no-op here.
    expect(style).toContain('--tx-tag-text: #2563eb')
    expect(wrapper.find('.tx-tag__dot').exists()).toBe(false)
    expect(wrapper.find('.tx-tag__count').exists()).toBe(false)
  })

  it('strengthens the fill and pulls text toward ink in the soft variant', () => {
    const wrapper = mount(TxTag, { props: { label: 'To do', color: '#f09a2f', variant: 'soft' } })
    const style = wrapper.attributes('style') ?? ''

    expect(wrapper.classes()).toContain('tx-tag--soft')
    expect(style).toContain('--tx-tag-bg: color-mix(in srgb, #f09a2f 20%, transparent)')
    expect(style).toContain('--tx-tag-border: color-mix(in srgb, #f09a2f 34%, transparent)')
    expect(style).toContain('--tx-tag-text: color-mix(in srgb, #f09a2f 92%, var(--tx-text-color-primary, #303133))')
  })

  it('drops the hue entirely in the plain variant', () => {
    const wrapper = mount(TxTag, { props: { label: '+3', color: '#e3474c', variant: 'plain' } })
    const style = wrapper.attributes('style') ?? ''

    // An overflow counter that borrows a danger hue reads as danger.
    expect(style).toContain('--tx-tag-bg: var(--tx-fill-color-light, #f5f7fa)')
    expect(style).toContain('--tx-tag-border: var(--tx-border-color-light, #e4e7ed)')
    expect(style).toContain('--tx-tag-text: var(--tx-text-color-secondary, #909399)')
  })

  it('lets explicit background and border override any variant', () => {
    const wrapper = mount(TxTag, {
      props: { label: 'Custom', variant: 'soft', background: 'rebeccapurple', border: 'gold' },
    })
    const style = wrapper.attributes('style') ?? ''

    expect(style).toContain('--tx-tag-bg: rebeccapurple')
    expect(style).toContain('--tx-tag-border: gold')
  })

  it('renders a decorative leading dot at the configured size', () => {
    const wrapper = mount(TxTag, { props: { label: 'B2B', dot: '#f09a2f', dotSize: 5 } })
    const dot = wrapper.find('.tx-tag__dot')

    expect(dot.exists()).toBe(true)
    expect(dot.attributes('aria-hidden')).toBe('true')
    expect(dot.attributes('style')).toContain('background: rgb(240, 154, 47)')
    expect(wrapper.attributes('style')).toContain('--tx-tag-dot-size: 5px')
  })

  it('renders a count badge, including zero', () => {
    expect(mount(TxTag, { props: { label: 'All', count: 5 } }).find('.tx-tag__count').text()).toBe('5')
    expect(mount(TxTag, { props: { label: 'All', count: 0 } }).find('.tx-tag__count').text()).toBe('0')
    expect(mount(TxTag, { props: { label: 'All' } }).find('.tx-tag__count').exists()).toBe(false)
  })

  it('emits click and close without bubbling close to tag click', async () => {
    const wrapper = mount(TxTag, {
      props: {
        label: 'Vue',
        closable: true,
      },
    })

    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)

    await wrapper.find('.tx-tag__close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('blocks click and close when disabled', async () => {
    const wrapper = mount(TxTag, {
      props: {
        label: 'Disabled',
        closable: true,
        disabled: true,
      },
    })

    expect(wrapper.classes()).toContain('tx-tag--disabled')
    expect(wrapper.find('.tx-tag__close').attributes('disabled')).toBeDefined()

    await wrapper.trigger('click')
    await wrapper.find('.tx-tag__close').trigger('click')

    expect(wrapper.emitted('click')).toBeUndefined()
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('exposes a localizable close-button aria-label', () => {
    const wrapper = mount(TxTag, {
      props: { label: 'Vue', closable: true, closeAriaLabel: '移除标签' },
    })

    // Pre-fix the close button hardcoded aria-label="Remove tag" with no override.
    expect(wrapper.find('.tx-tag__close').attributes('aria-label')).toBe('移除标签')
  })
})
