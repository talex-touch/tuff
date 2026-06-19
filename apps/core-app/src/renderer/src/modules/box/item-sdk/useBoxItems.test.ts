// @vitest-environment jsdom
import type { TuffItem } from '@talex-touch/utils'
import type { Ref } from 'vue'
import { createApp, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

const transportState = vi.hoisted(() => ({
  handlers: new Map<string, Function>(),
  send: vi.fn(async () => undefined)
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    on: (event: { toEventName?: () => string } | string, handler: Function) => {
      const eventName = typeof event === 'string' ? event : event.toEventName?.()
      if (!eventName) {
        throw new Error('Missing event name')
      }
      transportState.handlers.set(eventName, handler)
      return () => transportState.handlers.delete(eventName)
    },
    send: transportState.send
  })
}))

import { useBoxItems } from './useBoxItems'

async function mountBoxItemsHarness() {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const state: { items?: Readonly<Ref<TuffItem[]>> } = {}

  const app = createApp({
    setup() {
      const boxItems = useBoxItems()
      state.items = boxItems.items
      return () => null
    }
  })

  app.mount(root)
  await nextTick()

  return {
    get items() {
      return [...(state.items?.value ?? [])]
    },
    cleanup: () => {
      app.unmount()
      root.remove()
    }
  }
}

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

describe('useBoxItems', () => {
  afterEach(() => {
    transportState.handlers.clear()
    transportState.send.mockClear()
    document.body.replaceChildren()
  })

  it('clears renderer cached plugin items by meta.pluginName when source id is shared', async () => {
    const harness = await mountBoxItemsHarness()

    transportState.handlers.get('box-item:batch-upsert')?.({
      items: [
        createItem('intelligence-widget', 'plugin-features', 'touch-intelligence'),
        createItem('translation-widget', 'plugin-features', 'touch-translation'),
        createItem('owned-source', 'touch-intelligence')
      ]
    })
    await nextTick()

    transportState.handlers.get('box-item:clear')?.({ source: 'touch-intelligence' })
    await nextTick()

    expect(harness.items.map((item) => item.id)).toEqual(['translation-widget'])

    harness.cleanup()
  })
})
