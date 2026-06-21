import type { IProviderActivate, TuffItem } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import { resolveQuickActionsItem } from './useKeyboard'

function createFocusedItem(): TuffItem {
  return {
    id: 'stale-feature-entry',
    kind: 'feature',
    source: {
      id: 'plugin-features',
      type: 'plugin'
    },
    render: {
      basic: {
        title: '智能问答'
      }
    },
    meta: {
      pluginName: 'touch-intelligence',
      featureId: 'intelligence-ask'
    }
  } as TuffItem
}

function createActiveWidgetItem(): TuffItem {
  return {
    id: 'intelligence-widget',
    kind: 'feature',
    source: {
      id: 'plugin-features',
      type: 'plugin'
    },
    render: {
      mode: 'custom',
      custom: {
        type: 'vue',
        content: 'touch-intelligence::intelligence-ask',
        data: {
          status: 'ready',
          answer: 'Response succeeded with answer.'
        }
      },
      basic: {
        title: '智能问答：hello'
      }
    },
    actions: [
      {
        id: 'copy-answer',
        type: 'execute',
        label: '复制回答'
      }
    ],
    meta: {
      pluginName: 'touch-intelligence',
      featureId: 'intelligence-ask',
      status: 'ready',
      defaultAction: 'intelligence-action',
      actionId: 'copy-answer',
      payload: {
        prompt: 'hello',
        answer: 'Response succeeded with answer.'
      }
    }
  } as TuffItem
}

describe('resolveQuickActionsItem', () => {
  it('prefers the active plugin widget item over a stale focused result', () => {
    const activeWidget = createActiveWidgetItem()
    const activation: IProviderActivate = {
      id: 'plugin-features',
      meta: {
        pluginName: 'touch-intelligence',
        featureId: 'intelligence-ask',
        feature: activeWidget
      }
    }

    const resolved = resolveQuickActionsItem([createFocusedItem()], 0, [activation])

    expect(resolved).toBe(activeWidget)
    expect(resolved?.actions?.[0]?.id).toBe('copy-answer')
  })

  it('falls back to the focused result when no active plugin widget exists', () => {
    const focused = createFocusedItem()

    expect(resolveQuickActionsItem([focused], 0, null)).toBe(focused)
  })
})
