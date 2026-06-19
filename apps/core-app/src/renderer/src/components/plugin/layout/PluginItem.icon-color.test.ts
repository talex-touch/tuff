// @vitest-environment jsdom
import type { ITouchPlugin } from '@talex-touch/utils'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import PluginItem from './PluginItem.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('@talex-touch/tuffex/popover', () => ({
  TxPopover: {
    name: 'TxPopover',
    template: '<div><slot name="reference" /><slot /></div>'
  }
}))

vi.mock('@talex-touch/tuffex/scroll', () => ({
  TxScroll: {
    name: 'TxScroll',
    template: '<div><slot /></div>'
  }
}))

vi.mock('@talex-touch/tuffex/icon', () => ({
  TxIcon: {
    name: 'TxIcon',
    props: ['icon', 'colorful', 'size', 'alt', 'empty'],
    template:
      '<span class="tx-icon-stub" :data-icon-value="icon?.value || \'\'" :data-colorful="String(colorful)" />'
  }
}))

vi.mock('~/components/plugin/action/PluginStatus.vue', () => ({
  default: {
    name: 'PluginStatus',
    template: '<span />'
  }
}))

function normalizeStyle(style: string | undefined): string {
  return (style ?? '').replace(/\s+/g, '')
}

function createPlugin(icon: ITouchPlugin['icon']): ITouchPlugin {
  return {
    name: 'clipboard-history',
    desc: 'Clipboard history',
    icon,
    dev: { enable: false },
    pluginPath: '/plugins/clipboard-history',
    logger: {},
    features: [],
    issues: [],
    addFeature: vi.fn(),
    delFeature: vi.fn(),
    getFeature: vi.fn()
  } as unknown as ITouchPlugin
}

describe('PluginItem icon color mode', () => {
  it('renders monochrome plugin icons with the current text color', () => {
    const wrapper = mount(PluginItem, {
      props: {
        plugin: createPlugin({ type: 'url', value: '/plugins/openai.svg' })
      },
      global: {
        stubs: {
          PluginStatus: { template: '<span />' }
        }
      }
    })

    const icon = wrapper.get('.tx-icon-stub')

    expect(icon.attributes('data-icon-value')).toBe('/plugins/openai.svg')
    expect(icon.attributes('data-colorful')).toBe('false')
    expect(normalizeStyle(icon.attributes('style'))).toContain('--icon-color:currentColor')
  })

  it('preserves color for non-svg image plugin icons', () => {
    const wrapper = mount(PluginItem, {
      props: {
        plugin: createPlugin({ type: 'url', value: '/plugins/brand.png' })
      },
      global: {
        stubs: {
          PluginStatus: { template: '<span />' }
        }
      }
    })

    const icon = wrapper.get('.tx-icon-stub')

    expect(icon.attributes('data-icon-value')).toBe('/plugins/brand.png')
    expect(icon.attributes('data-colorful')).toBe('true')
  })
})
