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

function createFeatureItem(): TuffItem {
  const render = createRender()

  return {
    id: 'clipboard-history/clipboard-history',
    source: { type: 'plugin', id: 'plugin-features', name: 'Plugin Features' },
    kind: 'feature',
    render,
    meta: {
      pluginName: 'clipboard-history',
      extension: {
        matchAlias: {
          text: 'Clipboard',
          matchResult: [{ start: 0, end: 'Clipboard'.length }]
        }
      }
    }
  } as TuffItem
}

function createRender(): TuffRender {
  return {
    mode: 'default',
    basic: {
      title: '剪贴板历史记录',
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
})
