import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mount } from '@vue/test-utils'
import * as sass from 'sass'
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import TxCard from '../../card/src/TxCard.vue'
import TxBaseSurface from '../src/TxBaseSurface.vue'

const here = dirname(fileURLToPath(import.meta.url))

const GlassSurfaceStub = defineComponent({
  name: 'TxGlassSurface',
  template: '<div class="tx-glass-surface-stub" />',
})

const stubs = { TxGlassSurface: GlassSurfaceStub }

function layerOrder(root: Element): string[] {
  return [...root.children].map((child) => {
    const layer = [...child.classList].find(name => name.startsWith('tx-base-surface__layer--'))
    return layer?.slice('tx-base-surface__layer--'.length) ?? [...child.classList][0] ?? child.tagName
  })
}

describe('txBaseSurface flowLight', () => {
  it('lays the flow light above the veil and under the edge', () => {
    const wrapper = mount(TxBaseSurface, {
      props: { mode: 'refraction', flowLight: 'rim', overlayOpacity: 0.4 },
      // Real transitions, so each layer is a direct child as it is in the browser.
      global: { stubs: { ...stubs, transition: false } },
    })

    const order = layerOrder(wrapper.element)
    expect(order).toContain('mask')
    expect(order.indexOf('flow-light')).toBe(order.indexOf('mask') + 1)
    expect(order.indexOf('flow-light')).toBeLessThan(order.indexOf('refraction-edge'))
    expect(order.at(-1)).toBe('tx-base-surface__content')
    expect(wrapper.find('.tx-base-surface__layer--flow-light').classes()).toContain('tx-flow-light--rim')
  })

  it.each(['pure', 'mask', 'blur', 'glass', 'refraction'] as const)('can light a %s surface', (mode) => {
    const wrapper = mount(TxBaseSurface, { props: { mode, flowLight: 'corners' }, global: { stubs } })
    expect(wrapper.find('.tx-base-surface__layer--flow-light.tx-flow-light--corners').exists()).toBe(true)
  })

  it('stays off unless asked, and with false', async () => {
    const wrapper = mount(TxBaseSurface, { props: { mode: 'refraction' }, global: { stubs } })
    expect(wrapper.find('.tx-flow-light').exists()).toBe(false)
    await wrapper.setProps({ flowLight: false })
    expect(wrapper.find('.tx-flow-light').exists()).toBe(false)
    await wrapper.setProps({ flowLight: 'aurora' })
    expect(wrapper.find('.tx-flow-light--aurora').exists()).toBe(true)
  })

  it('hands its intensity to the light', () => {
    const wrapper = mount(TxBaseSurface, {
      props: { mode: 'pure', flowLight: 'aurora', flowLightIntensity: 0.4 },
      global: { stubs },
    })
    const light = wrapper.find('.tx-flow-light').element as HTMLElement
    expect(light.style.getPropertyValue('--tx-flow-light-intensity')).toBe('0.4')
  })

  it('stacks the layer at the veil\'s level, under the edge', () => {
    const scss = readFileSync(resolve(here, '../src/style/index.scss'), 'utf8')
    const css = sass.compileString(scss).css.replace(/\s+/g, ' ')
    const zIndexOf = (layer: string) => {
      const at = css.indexOf(`.tx-base-surface .tx-base-surface__layer--${layer} {`)
      expect(at, `${layer} rule`).toBeGreaterThan(-1)
      return Number(css.slice(at).match(/z-index: (\d+)/)?.[1])
    }
    // Same level as the mask and later in the DOM: on top of it, still under the edge.
    expect(zIndexOf('flow-light')).toBe(zIndexOf('mask'))
    expect(zIndexOf('flow-light')).toBeLessThan(zIndexOf('refraction-edge'))
  })
})

describe('txCard flowLight', () => {
  it('passes the flow light to its surface, whatever the background', () => {
    const wrapper = mount(TxCard, {
      props: { background: 'pure', flowLight: 'aurora', flowLightIntensity: 0.6 },
      slots: { default: 'Body' },
      global: { stubs },
    })
    const light = wrapper.find('.tx-card__surface .tx-flow-light--aurora')
    expect(light.exists()).toBe(true)
    expect((light.element as HTMLElement).style.getPropertyValue('--tx-flow-light-intensity')).toBe('0.6')
  })

  it('draws none by default', () => {
    const wrapper = mount(TxCard, { props: { background: 'refraction' }, slots: { default: 'Body' }, global: { stubs } })
    expect(wrapper.find('.tx-flow-light').exists()).toBe(false)
  })
})
