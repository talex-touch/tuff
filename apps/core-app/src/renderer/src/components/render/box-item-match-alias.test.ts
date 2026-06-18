// @vitest-environment jsdom
import type { TuffItem, TuffRender } from '@talex-touch/utils'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
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
    template: '<span class="tx-icon-stub" />'
  }
}))

function createFeatureItem(
  matchResult: Array<{ start: number; end: number }> = [{ start: 0, end: 'Clipboard'.length }],
  options: { alias?: string; title?: string } = {}
): TuffItem {
  const render = createRender(options.title)

  return {
    id: 'clipboard-history/clipboard-history',
    source: { type: 'plugin', id: 'plugin-features', name: 'Plugin Features' },
    kind: 'feature',
    render,
    meta: {
      pluginName: 'clipboard-history',
      extension: {
        matchAlias: {
          text: options.alias ?? 'Clipboard',
          matchResult
        }
      }
    }
  } as TuffItem
}

function createRender(title = '剪贴板历史记录'): TuffRender {
  return {
    mode: 'default',
    basic: {
      title,
      subtitle: '查看和管理剪贴板历史记录',
      icon: { type: 'class', value: 'i-ri-clipboard-line' }
    }
  } as TuffRender
}

describe('BoxItem match alias rendering', () => {
  it('shows and highlights the matched alias next to the feature title', () => {
    const wrapper = mount(BoxItem, {
      props: {
        item: createFeatureItem(),
        active: false,
        render: createRender()
      },
      global: {
        stubs: {
          ItemSubtitle: { template: '<span />' }
        }
      }
    })

    const alias = wrapper.get('.BoxItemMatchAlias')

    expect(alias.html()).toContain('CoreBoxTextHighlight')
    expect(alias.text()).toBe('Clipboard')
  })

  it('hides the matched alias when it has no highlight range', () => {
    const wrapper = mount(BoxItem, {
      props: {
        item: createFeatureItem([]),
        active: false,
        render: createRender()
      },
      global: {
        stubs: {
          ItemSubtitle: { template: '<span />' }
        }
      }
    })

    expect(wrapper.find('.BoxItemMatchAlias').exists()).toBe(false)
  })

  it('hides the matched alias when it only differs from the title by case or separators', () => {
    const wrapper = mount(BoxItem, {
      props: {
        item: createFeatureItem(
          [
            { start: 4, end: 5 },
            { start: 12, end: 13 }
          ],
          {
            alias: 'Mac Cleaner Pro',
            title: 'MacCleaner Pro'
          }
        ),
        active: false,
        render: createRender('MacCleaner Pro')
      },
      global: {
        stubs: {
          ItemSubtitle: { template: '<span />' }
        }
      }
    })

    expect(wrapper.find('.BoxItemMatchAlias').exists()).toBe(false)
  })
})
