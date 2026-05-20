import { describe, expect, it, vi } from 'vitest'
import { CoreBoxEvents, CoreBoxRetainedEvents, DivisionBoxEvents, FlowEvents } from '../transport/events'
import { createDivisionBoxSDK } from '../plugin/sdk/division-box'
import { createFeatureSDK } from '../plugin/sdk/feature-sdk'
import { createMetaSDK } from '../plugin/sdk/meta-sdk'
import { createQuickActionsSDK } from '../plugin/sdk/quick-actions-sdk'

type Handler = (payload: unknown) => unknown

function createMockChannel() {
  const listeners = new Map<string, Set<Handler>>()

  const channel = {
    send: vi.fn(async (_eventName: string, _payload?: unknown): Promise<unknown> => undefined),
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

  it('feature sdk preserves empty input change payloads', async () => {
    const { channel, emit } = createMockChannel()
    const sdk = createFeatureSDK(
      {
        pushItems: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        clear: vi.fn(),
        getItems: vi.fn(() => []),
      },
      channel as any,
    )
    const onInput = vi.fn()
    sdk.onInputChange(onInput)

    await emit('core-box:input-change', { input: '', query: { text: 'fallback' } })
    await emit('core-box:input-change', { query: { text: '' } })

    expect(onInput).toHaveBeenNthCalledWith(1, '')
    expect(onInput).toHaveBeenNthCalledWith(2, '')
  })

  it('feature sdk rejects retired plugin key event listener surface', () => {
    const { channel, listenerCount } = createMockChannel()
    const sdk = createFeatureSDK(
      {
        pushItems: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        clear: vi.fn(),
        getItems: vi.fn(() => []),
      },
      channel as any,
    )

    expect(() => sdk.onKeyEvent(vi.fn())).toThrow(
      '[Feature SDK] onKeyEvent was removed by the hard-cut',
    )
    expect(listenerCount('core-box:key-event')).toBe(0)
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

  it('division box sdk accepts direct session info open responses', async () => {
    const { channel } = createMockChannel()
    channel.send.mockResolvedValueOnce({ sessionId: 's1', state: 'active' })
    const sdk = createDivisionBoxSDK(channel as any)

    await expect(
      sdk.open({
        url: 'tuff://detached?itemId=demo',
        title: 'Demo',
      }),
    ).resolves.toMatchObject({ sessionId: 's1' })
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

    const canonicalEventName = CoreBoxEvents.metaOverlay.actionExecuted.toEventName()
    const legacyEventName = CoreBoxRetainedEvents.legacy.metaOverlayActionExecuted.toEventName()

    expect(listenerCount(canonicalEventName)).toBe(1)
    expect(listenerCount(legacyEventName)).toBe(1)

    await emit(canonicalEventName, {
      pluginId: 'demo-plugin',
      actionId: 'action-1',
      item: {
        id: 'item-1',
        title: { text: 'Item 1' },
        source: { id: 'demo', name: 'Demo' },
      },
    })
    await emit(legacyEventName, {
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
    expect(listenerCount(canonicalEventName)).toBe(0)
    expect(listenerCount(legacyEventName)).toBe(0)

    await emit(canonicalEventName, {
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

  it('quick actions sdk clears execute listener after dispose', async () => {
    const { channel, emit, listenerCount } = createMockChannel()
    const sdk = createQuickActionsSDK(channel as any, 'quick-plugin')
    const onExecute = vi.fn()

    sdk.onActionExecute(onExecute)
    sdk.registerAction({
      id: 'quick-action-1',
      render: {
        basic: {
          title: 'Quick Action',
          subtitle: 'Run quick action',
          icon: { type: 'class', value: 'i-ri-flashlight-line' },
        },
      },
      priority: 1,
    })

    const canonicalEventName = CoreBoxEvents.metaOverlay.actionExecuted.toEventName()
    const legacyEventName = CoreBoxRetainedEvents.legacy.metaOverlayActionExecuted.toEventName()

    expect(listenerCount(canonicalEventName)).toBe(1)
    expect(listenerCount(legacyEventName)).toBe(1)

    await emit(canonicalEventName, {
      pluginId: 'quick-plugin',
      actionId: 'quick-action-1',
      item: {
        id: 'item-qa-1',
        title: { text: 'Item QA 1' },
        source: { id: 'demo', name: 'Demo' },
      },
    })
    await emit(legacyEventName, {
      pluginId: 'quick-plugin',
      actionId: 'quick-action-1',
      item: {
        id: 'item-qa-1',
        title: { text: 'Item QA 1' },
        source: { id: 'demo', name: 'Demo' },
      },
    })
    expect(onExecute).toHaveBeenCalledTimes(1)

    sdk.dispose()
    expect(listenerCount(canonicalEventName)).toBe(0)
    expect(listenerCount(legacyEventName)).toBe(0)

    await emit(canonicalEventName, {
      pluginId: 'quick-plugin',
      actionId: 'quick-action-1',
      item: {
        id: 'item-qa-2',
        title: { text: 'Item QA 2' },
        source: { id: 'demo', name: 'Demo' },
      },
    })
    expect(onExecute).toHaveBeenCalledTimes(1)
  })

  it('quick actions sdk exposes native share targets through FlowBus', async () => {
    const { channel } = createMockChannel()
    const sdk = createQuickActionsSDK(channel as any, 'quick-plugin')

    channel.send.mockImplementation(async (eventName: string) => {
      if (eventName === FlowEvents.getTargets.toEventName()) {
        return {
          success: true,
          data: [
            {
              id: 'airdrop',
              fullId: 'native.airdrop',
              pluginId: 'native',
              name: 'AirDrop',
              supportedTypes: ['files'],
              isEnabled: true,
              hasFlowHandler: true,
              isNativeShare: true,
            },
            {
              id: 'notes',
              fullId: 'notes.capture',
              pluginId: 'notes',
              name: 'Notes',
              supportedTypes: ['text'],
              isEnabled: true,
              hasFlowHandler: true,
            },
          ],
        }
      }
      return undefined
    })

    await expect(sdk.getNativeShareTargets('files')).resolves.toMatchObject([
      {
        id: 'airdrop',
        fullId: 'native.airdrop',
        isNativeShare: true,
      },
    ])
    expect(channel.send).toHaveBeenCalledWith(
      FlowEvents.getTargets.toEventName(),
      expect.objectContaining({ payloadType: 'files' }),
    )
  })

  it('quick actions sdk shares Flow payloads through native share transport', async () => {
    const { channel } = createMockChannel()
    const sdk = createQuickActionsSDK(channel as any, 'quick-plugin')

    channel.send.mockImplementation(async (eventName: string) => {
      if (eventName === FlowEvents.nativeShare.toEventName()) {
        return { success: true, target: 'airdrop', requiresUserAction: true }
      }
      return undefined
    })

    const result = await sdk.nativeShare(
      {
        type: 'text',
        data: 'Hello',
        context: {
          sourcePluginId: 'external-plugin',
          metadata: { title: 'Greeting' },
        },
      },
      { target: 'airdrop' },
    )

    expect(result).toEqual({ success: true, target: 'airdrop', requiresUserAction: true })
    expect(channel.send).toHaveBeenCalledWith(
      FlowEvents.nativeShare.toEventName(),
      expect.objectContaining({
        target: 'airdrop',
        payload: expect.objectContaining({
          type: 'text',
          data: 'Hello',
          context: expect.objectContaining({
            sourcePluginId: 'external-plugin',
          }),
        }),
      }),
    )
  })

  it('quick actions sdk builds native share payloads from CoreBox items', () => {
    const { channel } = createMockChannel()
    const sdk = createQuickActionsSDK(channel as any, 'quick-plugin')

    expect(
      sdk.createSharePayloadFromItem({
        id: 'file-1',
        source: { type: 'plugin', id: 'quick-plugin' },
        kind: 'file',
        render: {
          mode: 'default',
          basic: { title: 'Report.pdf', subtitle: 'Quarterly report' },
        },
        meta: {
          file: { path: '/tmp/Report.pdf' },
        },
      }),
    ).toMatchObject({
      type: 'files',
      data: ['/tmp/Report.pdf'],
      context: {
        sourcePluginId: 'quick-plugin',
        metadata: {
          title: 'Report.pdf',
          itemId: 'file-1',
          itemKind: 'file',
        },
      },
    })

    expect(
      sdk.createSharePayloadFromItem({
        id: 'link-1',
        source: { type: 'plugin', id: 'quick-plugin' },
        kind: 'url',
        render: {
          mode: 'default',
          basic: { title: 'Tuff Docs', subtitle: 'Developer docs' },
        },
        meta: {
          web: { url: 'https://example.com/docs' },
        },
      }),
    ).toMatchObject({
      type: 'text',
      data: 'Tuff Docs\nDeveloper docs\nhttps://example.com/docs',
      context: {
        sourcePluginId: 'quick-plugin',
        metadata: {
          title: 'Tuff Docs',
          url: 'https://example.com/docs',
        },
      },
    })
  })
})
