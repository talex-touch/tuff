import type { Component } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxTransition from '../src/TxTransition.vue'
import TxTransitionFade from '../src/TxTransitionFade.vue'
import TxTransitionRebound from '../src/TxTransitionRebound.vue'
import TxTransitionSlideFade from '../src/TxTransitionSlideFade.vue'
import TxTransitionSmoothSize from '../src/TxTransitionSmoothSize.vue'

function mountTransition(component: Component, options: Record<string, unknown>) {
  return mount(component, options)
}

describe('txTransition', () => {
  it('maps presets to transition names and timing CSS variables', () => {
    const wrapper = mountTransition(TxTransition, {
      props: {
        preset: 'slide-fade',
        duration: 260,
        easing: 'linear',
        appear: false,
        mode: 'in-out',
      },
      attrs: {
        class: 'external-transition',
        style: 'color: red;',
        'data-track': 'panel',
      },
      slots: {
        default: '<span>Panel</span>',
      },
    })

    expect(wrapper.classes()).toEqual(expect.arrayContaining(['tx-transition', 'external-transition']))
    expect(wrapper.attributes('style')).toContain('--tx-transition-duration: 260ms')
    expect(wrapper.attributes('style')).toContain('--tx-transition-easing: linear')
    expect(wrapper.attributes('style')).toContain('color: red')
    expect(wrapper.attributes('data-track')).toBeUndefined()
    expect(wrapper.findComponent({ name: 'Transition' }).props()).toMatchObject({
      name: 'tx-slide-fade',
      appear: false,
      mode: 'in-out',
    })
    expect(wrapper.text()).toBe('Panel')
  })

  it('renders TransitionGroup with the configured tag when group is enabled', () => {
    const wrapper = mountTransition(TxTransition, {
      props: {
        preset: 'rebound',
        group: true,
        tag: 'ul',
      },
      attrs: {
        'data-list': 'items',
      },
      slots: {
        default: '<li>Alpha</li><li>Beta</li>',
      },
    })

    expect(wrapper.findComponent({ name: 'TransitionGroup' }).props()).toMatchObject({
      name: 'tx-rebound',
      tag: 'ul',
      appear: true,
    })
    expect(wrapper.attributes('data-list')).toBeUndefined()
    expect(wrapper.text()).toContain('Alpha')
    expect(wrapper.text()).toContain('Beta')
  })

  it('uses the smooth-size component for non-group smooth-size preset', () => {
    const wrapper = mountTransition(TxTransition, {
      props: {
        preset: 'smooth-size',
        duration: 320,
        easing: 'ease-out',
        appear: false,
        mode: 'in-out',
      },
      attrs: {
        id: 'smooth-panel',
      },
      slots: {
        default: '<span>Sized panel</span>',
      },
    })
    const smooth = wrapper.findComponent(TxTransitionSmoothSize)

    expect(smooth.exists()).toBe(true)
    expect(smooth.props()).toMatchObject({
      duration: 320,
      easing: 'ease-out',
      appear: false,
      mode: 'in-out',
    })
    expect(smooth.attributes('id')).toBe('smooth-panel')
    expect(wrapper.text()).toBe('Sized panel')
  })

  it('forwards smooth-size sizing props through TxAutoSizer', () => {
    const wrapper = mountTransition(TxTransitionSmoothSize, {
      props: {
        width: true,
        height: false,
        duration: 280,
        easing: 'ease-in',
        motion: 'rebound',
        appear: false,
        mode: 'in-out',
      },
      attrs: {
        class: 'size-motion',
        style: 'opacity: 0.8;',
        'data-size': 'card',
      },
      slots: {
        default: '<strong>Auto sized</strong>',
      },
    })
    const autoSizer = wrapper.findComponent({ name: 'TxAutoSizer' })
    const transition = wrapper.find('.tx-transition')

    expect(autoSizer.props()).toMatchObject({
      width: true,
      height: false,
      durationMs: 280,
      easing: 'ease-in',
      outerClass: 'overflow-hidden',
    })
    expect(autoSizer.attributes('data-size')).toBe('card')
    expect(transition.classes()).toEqual(expect.arrayContaining(['tx-transition', 'tx-transition-smooth-size', 'size-motion']))
    expect(transition.attributes('style')).toContain('--tx-transition-duration: 280ms')
    expect(transition.attributes('style')).toContain('--tx-transition-easing: ease-in')
    expect(transition.attributes('style')).toContain('opacity: 0.8')
    expect(wrapper.findComponent({ name: 'Transition' }).props()).toMatchObject({
      name: 'tx-rebound',
      appear: false,
      mode: 'in-out',
    })
  })

  it('semantic components pin their preset while forwarding attrs and slots', () => {
    const cases = [
      [TxTransitionFade, 'tx-fade'],
      [TxTransitionSlideFade, 'tx-slide-fade'],
      [TxTransitionRebound, 'tx-rebound'],
    ] as const

    for (const [component, name] of cases) {
      const wrapper = mountTransition(component, {
        attrs: {
          mode: 'in-out',
          'data-kind': name,
        },
        slots: {
          default: `<span>${name}</span>`,
        },
      })

      expect(wrapper.findComponent({ name: 'Transition' }).props()).toMatchObject({
        name,
        mode: 'in-out',
      })
      expect(wrapper.attributes('data-kind')).toBeUndefined()
      expect(wrapper.text()).toBe(name)
    }
  })
})
