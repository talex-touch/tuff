import type { TuffItem } from '@talex-touch/utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

import { BoxItemManager } from './box-item-manager'

function createItem(id: string, sourceId: string, pluginName?: string): TuffItem {
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
    meta: pluginName ? { pluginName } : undefined
  } as TuffItem
}

describe('BoxItemManager', () => {
  afterEach(() => {
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
})
