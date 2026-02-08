import { describe, expect, it, vi } from 'vitest'
import { DivisionBoxEvents } from '../transport/events'
import { createDivisionBoxSDK } from '../plugin/sdk/division-box'
import { createFeatureSDK } from '../plugin/sdk/feature-sdk'
import { createMetaSDK } from '../plugin/sdk/meta-sdk'

type Handler = (payload: unknown) => unknown

function createMockChannel() {
  const listeners = new Map<string, Set<Handler>>()

  const channel = {
    send: vi.fn(async () => undefined),
    regChannel: vi.fn((eventName: string, handler: Handler) => {
      const bucket = listeners.get(eventName) || new Set<Handler>()
      bucket.add(handler)
      listeners.set(eventName, bucket)

      return () => {
        const current = listeners.get(eventName)
        current?.delete(handler)
      }
    }),
  }

  const emit = async (eventName: string, payload: unknown) => {
    const bucket = listeners.get(eventName)
    if (!bucket) {
      return
    }

    for (const handler of bucket) {
      await handler(payload)
    }
  }

  const listenerCount = (eventName: string) => listeners.get(eventName)?.size ?? 0

  return { channel, emit, listenerCount }
}

describe('plugin sdk lifecycle', () => {
  it('feature sdk removes channel listeners after dispose', async () => {
    const { channel, emit, listenerCount } = createMockChannel()
    const boxItemsAPI = {
      pushItems: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
      getItems: vi.fn(() => []),
    }

    const sdk = createFeatureSDK(boxItemsAPI, channel as any)
    const onInput = vi.fn()
    sdk.onInputChange(onInput)

    expect(listenerCount('core-box:input-change')).toBe(1)

    await emit('core-box:input-change', { input: 'hello' })
    expect(onInput).toHaveBeenCalledWith('hello')

    sdk.dispose()
    expect(listenerCount('core-box:input-change')).toBe(0)

    await emit('core-box:input-change', { input: 'world' })
    expect(onInput).toHaveBeenCalledTimes(1)
  })

  it('division box sdk removes state listener after dispose', async () => {
    const { channel, emit, listenerCount } = createMockChannel()
    const sdk = createDivisionBoxSDK(channel as any)
    const onStateChange = vi.fn()
    sdk.onStateChange(onStateChange)

    const eventName = DivisionBoxEvents.stateChanged.toEventName()
    expect(listenerCount(eventName)).toBe(1)

    await emit(eventName, { sessionId: 's1', newState: 'active' })
    expect(onStateChange).toHaveBeenCalledWith({ sessionId: 's1', state: 'active' })

    sdk.dispose()
    expect(listenerCount(eventName)).toBe(0)
  })

  it('meta sdk clears execute listener after dispose', async () => {
    const { channel, emit, listenerCount } = createMockChannel()
    const sdk = createMetaSDK(channel as any, 'demo-plugin')
    const onExecute = vi.fn()

    sdk.onActionExecute(onExecute)
    sdk.registerAction({
      id: 'action-1',
      render: {
        basic: {
          title: 'Action',
          subtitle: 'Run action',
          icon: { type: 'class', value: 'i-ri-star-line' },
        },
      },
      priority: 1,
    })

    expect(listenerCount('meta-overlay:action-executed')).toBe(1)

    await emit('meta-overlay:action-executed', {
      pluginId: 'demo-plugin',
      actionId: 'action-1',
      item: {
        id: 'item-1',
        title: { text: 'Item 1' },
        source: { id: 'demo', name: 'Demo' },
      },
    })
    expect(onExecute).toHaveBeenCalledTimes(1)

    sdk.dispose()
    expect(listenerCount('meta-overlay:action-executed')).toBe(0)

    await emit('meta-overlay:action-executed', {
      pluginId: 'demo-plugin',
      actionId: 'action-1',
      item: {
        id: 'item-2',
        title: { text: 'Item 2' },
        source: { id: 'demo', name: 'Demo' },
      },
    })
    expect(onExecute).toHaveBeenCalledTimes(1)
  })
})
