import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import Button from '../src/button.vue'

describe('TxButton', () => {
  it('renders correctly', () => {
    const wrapper = mount(Button, {
      slots: {
        default: 'Test Button'
      }
    })
    
    expect(wrapper.text()).toBe('Test Button')
    expect(wrapper.classes()).toContain('tx-button')
  })

  it('renders different types', () => {
    const wrapper = mount(Button, {
      props: {
        type: 'primary'
      }
    })
    
    expect(wrapper.classes()).toContain('tx-button--primary')
  })

  it('renders different sizes', () => {
    const wrapper = mount(Button, {
      props: {
        size: 'large'
      }
    })
    
    expect(wrapper.classes()).toContain('tx-button--large')
  })

  it('handles disabled state', () => {
    const wrapper = mount(Button, {
      props: {
        disabled: true
      }
    })
    
    expect(wrapper.classes()).toContain('tx-button--disabled')
    expect(wrapper.attributes('disabled')).toBeDefined()
  })

  it('handles loading state', () => {
    const wrapper = mount(Button, {
      props: {
        loading: true
      }
    })
    
    expect(wrapper.classes()).toContain('tx-button--loading')
    expect(wrapper.find('.tx-button__loading-icon').exists()).toBe(true)
  })

  it('emits click event', async () => {
    const wrapper = mount(Button)
    
    await wrapper.trigger('click')
    
    expect(wrapper.emitted('click')).toBeTruthy()
  })

  it('does not emit click when disabled', async () => {
    const wrapper = mount(Button, {
      props: {
        disabled: true
      }
    })
    
    await wrapper.trigger('click')
    
    expect(wrapper.emitted('click')).toBeFalsy()
  })

  it('does not emit click when loading', async () => {
    const wrapper = mount(Button, {
      props: {
        loading: true
      }
    })
    
    await wrapper.trigger('click')
    
    expect(wrapper.emitted('click')).toBeFalsy()
  })

  it('renders with icon', () => {
    const wrapper = mount(Button, {
      props: {
        icon: 'search'
      }
    })
    
    expect(wrapper.find('.tx-button__icon').exists()).toBe(true)
    expect(wrapper.find('.tx-icon-search').exists()).toBe(true)
  })

  it('renders circle button correctly', () => {
    const wrapper = mount(Button, {
      props: {
        circle: true,
        icon: 'edit'
      }
    })
    
    expect(wrapper.classes()).toContain('tx-button--circle')
  })

  it('renders plain button correctly', () => {
    const wrapper = mount(Button, {
      props: {
        plain: true,
        type: 'primary'
      }
    })
    
    expect(wrapper.classes()).toContain('tx-button--plain')
    expect(wrapper.classes()).toContain('tx-button--primary')
  })

  it('renders round button correctly', () => {
    const wrapper = mount(Button, {
      props: {
        round: true
      }
    })
    
    expect(wrapper.classes()).toContain('tx-button--round')
  })

  it('sets correct native type', () => {
    const wrapper = mount(Button, {
      props: {
        nativeType: 'submit'
      }
    })
    
    expect(wrapper.attributes('type')).toBe('submit')
  })
})
