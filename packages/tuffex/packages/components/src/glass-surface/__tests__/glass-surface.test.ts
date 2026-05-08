import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxGlassSurface from '../src/TxGlassSurface.vue'

describe('txGlassSurface', () => {
  it('normalizes numeric dimensions and renders slot content', () => {
    const wrapper = mount(TxGlassSurface, {
      props: {
        width: 320,
        height: 160,
        borderRadius: 18,
      },
      slots: {
        default: '<span>Glass content</span>',
      },
    })

    const style = wrapper.attributes('style')

    expect(style).toContain('width: 320px')
    expect(style).toContain('height: 160px')
    expect(style).toContain('border-radius: 18px')
    expect(wrapper.text()).toContain('Glass content')
  })

  it('uses solid fallback when backdrop-filter support is unavailable', () => {
    const wrapper = mount(TxGlassSurface, {
      props: {
        blur: 14,
      },
    })

    const style = wrapper.attributes('style')

    expect(style).toContain('background: rgb(var(--tx-surface-refraction-mask-rgb, 255 255 255) / 0.4)')
    expect(style).toContain('border: 1px solid')
  })

  it('forwards displacement channel props to SVG filter nodes', async () => {
    const wrapper = mount(TxGlassSurface, {
      props: {
        distortionScale: -120,
        redOffset: 1,
        greenOffset: 2,
        blueOffset: 3,
        xChannel: 'B',
        yChannel: 'R',
        displace: 0.8,
      },
    })

    await wrapper.vm.$nextTick()
    const maps = wrapper.findAll('feDisplacementMap')
    const blur = wrapper.find('feGaussianBlur')

    expect(maps[0].attributes('scale')).toBe('-119')
    expect(maps[1].attributes('scale')).toBe('-118')
    expect(maps[2].attributes('scale')).toBe('-117')
    expect(maps.every(map => map.attributes('xChannelSelector') === 'B')).toBe(true)
    expect(maps.every(map => map.attributes('yChannelSelector') === 'R')).toBe(true)
    expect(blur.attributes('stdDeviation')).toBe('0.8')
  })
})
