import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import TuffFlatButton, { TuffFlatButton as NamedFlatButton } from '../index'

describe('tuffFlatButton', () => {
  it('renders a native button with default slot content', () => {
    const wrapper = mount(TuffFlatButton, {
      slots: {
        default: 'Default',
      },
    })

    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('type')).toBe('button')
    expect(wrapper.text()).toContain('Default')
    expect(wrapper.classes()).toContain('tuff-flat-button')
    expect(wrapper.classes()).toContain('fake-background')
    expect(wrapper.attributes('disabled')).toBeUndefined()
  })

  it('renders primary and mini states', () => {
    const wrapper = mount(TuffFlatButton, {
      props: {
        primary: true,
        mini: true,
      },
    })

    expect(wrapper.classes()).toContain('is-primary')
    expect(wrapper.classes()).not.toContain('fake-background')
    expect(wrapper.classes()).toContain('is-mini')
  })

  it('emits native click events when enabled', async () => {
    const wrapper = mount(TuffFlatButton)

    await wrapper.trigger('click')

    expect(wrapper.emitted('click')).toHaveLength(1)
    expect(wrapper.emitted('click')?.[0][0]).toBeInstanceOf(MouseEvent)
  })

  it('uses native disabled semantics for disabled and loading states', async () => {
    const disabled = mount(TuffFlatButton, {
      props: {
        disabled: true,
      },
    })

    expect(disabled.attributes('disabled')).toBeDefined()
    expect(disabled.classes()).toContain('is-disabled')
    await disabled.trigger('click')
    expect(disabled.emitted('click')).toBeUndefined()

    const loading = mount(TuffFlatButton, {
      props: {
        loading: true,
      },
    })

    expect(loading.attributes('disabled')).toBeDefined()
    expect(loading.classes()).toContain('is-loading')
    expect(loading.find('.tx-flat-button__loading').exists()).toBe(true)
    expect(loading.find('.tx-flat-button__spinner').exists()).toBe(true)
    await loading.trigger('click')
    expect(loading.emitted('click')).toBeUndefined()
  })

  it('does not submit forms by default', () => {
    const wrapper = mount({
      components: { TuffFlatButton },
      template: '<form><TuffFlatButton>Action</TuffFlatButton></form>',
    })

    expect(wrapper.find('button').attributes('type')).toBe('button')
  })

  it('registers the component through install', () => {
    const app = createApp({})
    const component = vi.spyOn(app, 'component')

    app.use(NamedFlatButton)

    expect(component).toHaveBeenCalledWith('TuffFlatButton', NamedFlatButton)
  })
})
