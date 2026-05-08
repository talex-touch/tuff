import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BridgeEventForCoreBox } from '../plugin/sdk/enum/bridge-event'

const channel = {
  regChannel: vi.fn(),
  send: vi.fn(),
}

const mocks = vi.hoisted(() => ({
  on: vi.fn(),
  ensureRendererChannel: vi.fn(() => channel),
}))

vi.mock('../plugin/sdk/channel', () => ({
  ensureRendererChannel: mocks.ensureRendererChannel,
}))

vi.mock('../transport', () => ({
  createPluginTuffTransport: vi.fn(() => ({
    on: mocks.on,
  })),
}))

describe('Plugin bridge hook SDK', () => {
  beforeEach(() => {
    vi.resetModules()
    channel.regChannel.mockReset()
    channel.send.mockReset()
    mocks.on.mockReset()
    mocks.ensureRendererChannel.mockClear()
  })

  it('subscribes CoreBox input and clipboard bridge hooks through shared event objects', async () => {
    const { injectBridgeEvent } = await import('../plugin/sdk/hooks/bridge')

    injectBridgeEvent(BridgeEventForCoreBox.CORE_BOX_INPUT_CHANGE, vi.fn())
    injectBridgeEvent(BridgeEventForCoreBox.CORE_BOX_CLIPBOARD_CHANGE, vi.fn())

    const eventNames = mocks.on.mock.calls.map(([event]) => event.toEventName())
    expect(eventNames).toContain('core-box:input-change')
    expect(eventNames).toContain('core-box:clipboard-change')
    expect(channel.regChannel).not.toHaveBeenCalled()
  })

  it('caches bridge payloads before hooks are registered and replays them once', async () => {
    const { clearBridgeEventCache, injectBridgeEvent } = await import('../plugin/sdk/hooks/bridge')
    clearBridgeEventCache()
    await new Promise(resolve => setTimeout(resolve, 0))

    const inputListener = mocks.on.mock.calls.find(
      ([event]) => event.toEventName() === 'core-box:input-change',
    )?.[1] as ((payload: unknown) => void) | undefined

    inputListener?.({ input: 'cached' })

    const hook = vi.fn()
    injectBridgeEvent(BridgeEventForCoreBox.CORE_BOX_INPUT_CHANGE, hook)

    expect(hook).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { input: 'cached' },
        meta: expect.objectContaining({
          fromCache: true,
        }),
      }),
    )
  })

  it('rejects retired CoreBox key bridge hook surface', async () => {
    const { onCoreBoxKeyEvent } = await import('../plugin/sdk/hooks/bridge')

    expect(() => onCoreBoxKeyEvent(vi.fn())).toThrow(
      '[TouchSDK] onCoreBoxKeyEvent was removed by the hard-cut',
    )
    const eventNames = mocks.on.mock.calls.map(([event]) => event.toEventName())
    expect(eventNames).not.toContain('core-box:key-event')
  })
})
