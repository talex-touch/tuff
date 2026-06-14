import type { TuffItem } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import {
  isPluginFooterItem,
  resolveCoreBoxFooterVisible,
  resolvePrimaryFooterHintVisible,
  resolveQuickSelectFooterHintVisible,
  resolveSecondaryFooterHintVisible
} from './coreBoxFooterHints'

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
  it('hides the footer for plugin-provided widget items by default', () => {
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
    expect(resolveCoreBoxFooterVisible(pluginWidget)).toBe(false)
    expect(resolvePrimaryFooterHintVisible(pluginWidget)).toBe(false)
    expect(resolveSecondaryFooterHintVisible(pluginWidget)).toBe(false)
    expect(resolveQuickSelectFooterHintVisible(pluginWidget, true)).toBe(false)
  })

  it('keeps the footer visible for non-plugin items by default', () => {
    expect(resolveCoreBoxFooterVisible(item({}))).toBe(true)
    expect(resolvePrimaryFooterHintVisible(item({}))).toBe(true)
    expect(resolveSecondaryFooterHintVisible(item({}))).toBe(true)
    expect(resolveQuickSelectFooterHintVisible(item({}), true)).toBe(true)
  })

  it('hides the footer when no item is available', () => {
    expect(resolveCoreBoxFooterVisible(null)).toBe(false)
    expect(resolvePrimaryFooterHintVisible(null)).toBe(false)
    expect(resolveSecondaryFooterHintVisible(null)).toBe(false)
    expect(resolveQuickSelectFooterHintVisible(null, true)).toBe(false)
  })

  it('shows plugin footer only when a hint is explicitly visible', () => {
    const pluginItem = item({
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

    expect(resolveCoreBoxFooterVisible(pluginItem)).toBe(true)
    expect(resolveSecondaryFooterHintVisible(pluginItem)).toBe(true)
  })

  it('keeps plugin footer hidden when hints are explicitly disabled', () => {
    expect(
      resolveCoreBoxFooterVisible(
        item({
          source: { type: 'plugin', id: 'plugin-features' },
          meta: {
            pluginName: 'plugin-a',
            footerHints: {
              primary: { visible: false },
              secondary: { visible: false },
              quickSelect: { visible: false }
            }
          }
        })
      )
    ).toBe(false)
  })
})
