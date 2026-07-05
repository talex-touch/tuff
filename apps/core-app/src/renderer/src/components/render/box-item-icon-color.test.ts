// @vitest-environment jsdom
import type { TuffItem, TuffRender } from '@talex-touch/utils'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import BoxGridItem from './BoxGridItem.vue'
import BoxItem from './BoxItem.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string) => fallback ?? key
  })
}))

vi.mock('~/modules/openers', () => ({
  getOpenerByExtension: vi.fn(() => null),
  useOpenerAutoResolve: vi.fn()
}))

vi.mock('@talex-touch/tuffex/icon', () => ({
  TxIcon: {
    name: 'TxIcon',
    props: ['icon', 'colorful', 'size', 'alt', 'empty'],
    template:
      '<span class="tx-icon-stub" :data-icon-value="icon?.value || \'\'" :data-icon-color="icon?.color || \'\'" :data-colorful="String(colorful)" :data-size="String(size)" />'
  }
}))

function createItem(meta?: Record<string, unknown>): TuffItem {
  return {
    id: 'item-1',
    source: { type: 'plugin', id: 'plugin-features', name: 'Plugin Features' },
    kind: 'feature',
    render: {
      mode: 'default',
      basic: {
        title: 'Clipboard'
      }
    },
    meta: meta ?? { pluginName: 'touch-text-tools' }
  }
}

type BasicRender = NonNullable<TuffRender['basic']>
type LegacyBasicIcon = BasicRender['icon'] | string

function createRender(icon: LegacyBasicIcon): TuffRender {
  return {
    mode: 'default',
    basic: {
      title: 'Clipboard',
      subtitle: 'Copy text',
      icon
    }
  } as unknown as TuffRender
}

function normalizeStyle(style: string | undefined): string {
  return (style ?? '').replace(/\s+/g, '')
}

describe('CoreBox result icon color rendering', () => {
  it('passes explicit icon color and colorful mode from BoxItem to TxIcon', () => {
    const wrapper = mount(BoxItem, {
      props: {
        item: createItem(),
        active: false,
        render: createRender({
          type: 'class',
          value: 'i-ri-clipboard-line',
          color: '#22c55e',
          colorful: true
        })
      },
      global: {
        stubs: {
          ItemSubtitle: { template: '<span />' }
        }
      }
    })

    const icon = wrapper.get('.tx-icon-stub')

    expect(icon.attributes('data-icon-value')).toBe('i-ri-clipboard-line')
    expect(icon.attributes('data-icon-color')).toBe('#22c55e')
    expect(icon.attributes('data-colorful')).toBe('true')
    expect(normalizeStyle(icon.attributes('style'))).toContain('--icon-color:#22c55e')
  })

  it('passes fallback theme color from BoxGridItem for string class icons', () => {
    const wrapper = mount(BoxGridItem, {
      props: {
        item: createItem(),
        active: false,
        render: createRender('ri:json-line')
      }
    })

    const icon = wrapper.get('.tx-icon-stub')

    expect(icon.attributes('data-icon-value')).toBe('i-ri-json-line')
    expect(icon.attributes('data-colorful')).toBe('false')
    expect(normalizeStyle(icon.attributes('style'))).toContain(
      '--icon-color:var(--tx-text-color-primary,#e5e7eb)'
    )
  })

  it('renders recommendation badge icons as classes in list results', () => {
    const wrapper = mount(BoxItem, {
      props: {
        item: createItem({
          recommendation: {
            badge: {
              variant: 'frequent',
              icon: 'i-ri-fire-line',
              text: '常用'
            }
          }
        }),
        active: false,
        render: createRender('i-ri-clipboard-line')
      }
    })

    expect(wrapper.find('i.i-ri-fire-line').exists()).toBe(true)
    expect(wrapper.text()).toContain('常用')
  })

  it('renders recommendation badge icons as classes in grid results', () => {
    const wrapper = mount(BoxGridItem, {
      props: {
        item: createItem({
          recommendation: {
            badge: {
              variant: 'intelligent',
              icon: 'i-ri-time-line',
              text: '推荐'
            }
          }
        }),
        active: false,
        render: createRender('i-ri-clipboard-line')
      }
    })

    expect(wrapper.find('i.i-ri-time-line').exists()).toBe(true)
    expect(wrapper.text()).toContain('推荐')
  })
})
