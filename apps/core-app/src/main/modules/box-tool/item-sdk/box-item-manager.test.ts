import type { TuffItem } from '@talex-touch/utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

const appSettingsMock = vi.hoisted(() => ({
  value: {} as Record<string, unknown>
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: () => ({
    on: vi.fn(),
    broadcastToWindow: vi.fn()
  })
}))

vi.mock('../../../core/runtime-accessor', () => ({
  getRegisteredMainRuntime: () => ({
    channel: {}
  })
}))

vi.mock('../core-box', () => ({
  getCoreBoxWindow: () => null
}))

vi.mock('../../storage', () => ({
  getMainConfig: vi.fn(() => appSettingsMock.value)
}))

import { BoxItemManager } from './box-item-manager'

function createItem(
  id: string,
  sourceId: string,
  pluginName?: string,
  searchProviderId?: string
): TuffItem {
  return {
    id,
    source: {
      type: 'plugin',
      id: sourceId,
      name: sourceId
    },
    render: {
      mode: 'default',
      basic: {
        title: id
      }
    },
    meta:
      pluginName || searchProviderId
        ? {
            ...(pluginName ? { pluginName } : {}),
            ...(searchProviderId ? { searchProviderId } : {})
          }
        : undefined
  } as TuffItem
}

describe('BoxItemManager', () => {
  afterEach(() => {
    appSettingsMock.value = {}
    vi.restoreAllMocks()
  })

  it('clears plugin items by meta.pluginName when source id is shared', () => {
    const manager = new BoxItemManager()

    manager.batchUpsert([
      createItem('browser-open', 'plugin-features', 'touch-browser-open'),
      createItem('translation', 'plugin-features', 'touch-translation'),
      createItem('owned-source', 'touch-browser-open')
    ])

    manager.clear('touch-browser-open')

    expect(manager.get('browser-open')).toBeUndefined()
    expect(manager.get('owned-source')).toBeUndefined()
    expect(manager.get('translation')).toBeDefined()
    expect(manager.getBySource('touch-translation')).toHaveLength(1)
  })

  it('filters and sorts visible plugin root items by provider config', () => {
    appSettingsMock.value = {
      searchProviders: {
        providers: [
          { providerId: 'touch-b.results', enabled: true, order: 1 },
          { providerId: 'touch-a.results', enabled: true, order: 2 },
          { providerId: 'touch-hidden.results', enabled: false, order: 3 }
        ]
      }
    }
    const manager = new BoxItemManager()

    manager.batchUpsert([
      createItem('a', 'touch-a', 'touch-a', 'touch-a.results'),
      createItem('hidden', 'touch-hidden', 'touch-hidden', 'touch-hidden.results'),
      createItem('b', 'touch-b', 'touch-b', 'touch-b.results'),
      createItem('legacy', 'touch-legacy', 'touch-legacy')
    ])

    expect(manager.getAll().map((item) => item.id)).toEqual(['a', 'hidden', 'b', 'legacy'])
    expect(manager.getVisibleItems().map((item) => item.id)).toEqual(['b', 'a', 'legacy'])
  })
})
