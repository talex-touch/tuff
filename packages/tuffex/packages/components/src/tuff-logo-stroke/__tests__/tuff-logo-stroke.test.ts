import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TuffLogoStroke, { TuffLogoStroke as InstalledTuffLogoStroke } from '../index'

describe('txTuffLogoStroke', () => {
  it('renders the once mode with size and duration variables', () => {
    const wrapper = mount(TuffLogoStroke, {
      props: {
        size: 84,
        durationMs: 2800,
      },
    })

    const svg = wrapper.find('svg')
    expect(svg.classes()).toContain('is-once')
    expect(svg.attributes('role')).toBe('img')
    expect(svg.attributes('aria-label')).toBe('Tuff logo stroke animation')
    expect(svg.attributes('style')).toContain('width: 84px;')
    expect(svg.attributes('style')).toContain('height: 84px;')
    expect(svg.attributes('style')).toContain('--tx-tuff-logo-duration: 2800ms;')
  })

  it('maps loop mode to breathe mode and supports string size', () => {
    const wrapper = mount(TuffLogoStroke, {
      props: {
        mode: 'loop',
        size: '5rem',
      },
    })

    const svg = wrapper.find('svg')
    expect(svg.classes()).toContain('is-breathe')
    expect(svg.classes()).not.toContain('is-once')
    expect(svg.attributes('style')).toContain('width: 5rem;')
    expect(svg.attributes('style')).toContain('height: 5rem;')
  })

  it('forwards palette props to gradients and strokes', () => {
    const wrapper = mount(TuffLogoStroke, {
      props: {
        strokeColor: '#3b82f6',
        fillStartColor: '#0ea5e9',
        fillEndColor: '#8b5cf6',
        outerStartColor: '#fb7185',
        outerEndColor: '#7e22ce',
      },
    })

    expect(wrapper.find('.tx-tuff-logo-stroke__outline').attributes('stroke')).toBe('#3b82f6')
    const stops = wrapper.findAll('stop')
    expect(stops[0].attributes('stop-color')).toBe('#0ea5e9')
    expect(stops[1].attributes('stop-color')).toBe('#8b5cf6')
    expect(stops[2].attributes('stop-color')).toBe('#fb7185')
    expect(stops[3].attributes('stop-color')).toBe('#7e22ce')
  })

  it('uses instance-scoped gradient and filter ids', () => {
    const wrapper = mount({
      components: { TuffLogoStroke },
      template: '<div><TuffLogoStroke /><TuffLogoStroke /></div>',
    })

    const gradients = wrapper.findAll('linearGradient')
    const filters = wrapper.findAll('filter')
    expect(gradients[0].attributes('id')).toBeTruthy()
    expect(gradients[1].attributes('id')).toBeTruthy()
    expect(gradients[0].attributes('id')).not.toBe(gradients[1].attributes('id'))
    expect(filters[0].attributes('id')).not.toBe(filters[1].attributes('id'))
  })

  it('registers the component through install', () => {
    const app = { component: vi.fn() }

    InstalledTuffLogoStroke.install?.(app as any)

    expect(app.component).toHaveBeenCalledWith('TxTuffLogoStroke', InstalledTuffLogoStroke)
  })
})
