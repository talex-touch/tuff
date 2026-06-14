import type { TuffItem } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import { isPluginFooterItem, resolveSecondaryFooterHintVisible } from './coreBoxFooterHints'

function item(overrides: Partial<TuffItem>): TuffItem {
  return {
    id: 'item-1',
    source: { type: 'system', id: 'apps' },
    kind: 'app',
    render: { basic: { title: 'App' } },
    ...overrides
  } as TuffItem
}

describe('coreBoxFooterHints', () => {
  it('hides secondary hints for plugin-provided widget items by default', () => {
    const pluginWidget = item({
      source: { type: 'plugin', id: 'plugin-features' },
      render: {
        mode: 'custom',
        custom: {
          type: 'vue',
          content: 'touch-intelligence::intelligence-ask'
        }
      },
      meta: {
        pluginName: 'touch-intelligence',
        featureId: 'intelligence-ask'
      }
    })

    expect(isPluginFooterItem(pluginWidget)).toBe(true)
    expect(resolveSecondaryFooterHintVisible(pluginWidget)).toBe(false)
  })

  it('keeps secondary hints visible for non-plugin items by default', () => {
    expect(resolveSecondaryFooterHintVisible(item({}))).toBe(true)
  })

  it('honors explicit footer hint visibility', () => {
    expect(
      resolveSecondaryFooterHintVisible(
        item({
          source: { type: 'plugin', id: 'plugin-features' },
          meta: {
            pluginName: 'plugin-a',
            footerHints: {
              secondary: {
                visible: true
              }
            }
          }
        })
      )
    ).toBe(true)
  })
})
