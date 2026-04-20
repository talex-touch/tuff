import type { TuffItem } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import { isBackgroundAppLaunchItem } from './app-launch-item'

function createItem(overrides: Partial<TuffItem>): TuffItem {
  return {
    id: 'item',
    kind: 'app',
    source: {
      id: 'app-provider',
      type: 'application'
    },
    render: {
      mode: 'default',
      basic: { title: 'App' }
    },
    meta: {
      app: { path: '/Applications/App.app' }
    },
    ...overrides
  } as TuffItem
}

describe('isBackgroundAppLaunchItem', () => {
  it('matches app-provider app items', () => {
    expect(isBackgroundAppLaunchItem(createItem({}))).toBe(true)
  })

  it('does not match plugin features', () => {
    expect(
      isBackgroundAppLaunchItem(
        createItem({
          kind: 'feature',
          source: { id: 'plugin-a', type: 'plugin' },
          meta: { app: { path: '/Applications/App.app' } }
        })
      )
    ).toBe(false)
  })

  it('does not match system actions or malformed app metadata', () => {
    expect(
      isBackgroundAppLaunchItem(
        createItem({
          source: { id: 'system-actions', type: 'system' }
        })
      )
    ).toBe(false)

    expect(
      isBackgroundAppLaunchItem(
        createItem({
          meta: {}
        })
      )
    ).toBe(false)
  })
})
