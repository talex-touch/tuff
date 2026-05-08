import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginEvents } from '../transport/events'
import { LifecycleHooks, injectHook } from '../plugin/sdk/hooks/life-cycle'

const channel = {
  regChannel: vi.fn(),
  send: vi.fn(),
}

const sdk: { __hooks?: Record<string, Array<(data: unknown) => void>> } = {}

const mocks = vi.hoisted(() => ({
  on: vi.fn(),
  ensureRendererChannel: vi.fn(() => channel),
  useTouchSDK: vi.fn(() => sdk),
}))

vi.mock('../plugin/sdk/channel', () => ({
  ensureRendererChannel: mocks.ensureRendererChannel,
}))

vi.mock('../plugin/sdk/touch-sdk', () => ({
  useTouchSDK: mocks.useTouchSDK,
}))

vi.mock('../transport', () => ({
  createPluginTuffTransport: vi.fn(() => ({
    on: mocks.on,
  })),
}))

describe('Plugin lifecycle hooks SDK', () => {
  beforeEach(() => {
    delete sdk.__hooks
    channel.regChannel.mockReset()
    channel.send.mockReset()
    mocks.on.mockReset()
    mocks.ensureRendererChannel.mockClear()
    mocks.useTouchSDK.mockClear()
  })

  it('subscribes lifecycle hooks through shared typed lifecycle signal events', () => {
    const hook = vi.fn()

    injectHook(LifecycleHooks.ENABLE, hook)

    expect(mocks.on).toHaveBeenCalledWith(
      PluginEvents.lifecycleSignal.enabled,
      expect.any(Function),
    )
    expect(channel.regChannel).not.toHaveBeenCalled()
  })

  it('dispatches active lifecycle payloads and returns reply result', () => {
    const hook = vi.fn()
    const processFunc = vi.fn(({ data, reply }) => {
      hook(data)
      reply(false)
    })

    injectHook(LifecycleHooks.ACTIVE, hook, processFunc)

    const listener = mocks.on.mock.calls[0]?.[1] as ((data: unknown) => boolean) | undefined

    expect(listener?.({ id: 'plugin-a' })).toBe(false)
    expect(processFunc).toHaveBeenCalled()
    expect(hook).toHaveBeenCalledWith({ id: 'plugin-a' })
    expect(sdk.__hooks?.[LifecycleHooks.ACTIVE]).toBeUndefined()
  })

  it('maps every public lifecycle hook to the current lifecycle signal catalog', () => {
    injectHook(LifecycleHooks.DISABLE, vi.fn())
    injectHook(LifecycleHooks.INACTIVE, vi.fn())
    injectHook(LifecycleHooks.CRASH, vi.fn())

    expect(mocks.on).toHaveBeenNthCalledWith(
      1,
      PluginEvents.lifecycleSignal.disabled,
      expect.any(Function),
    )
    expect(mocks.on).toHaveBeenNthCalledWith(
      2,
      PluginEvents.lifecycleSignal.inactive,
      expect.any(Function),
    )
    expect(mocks.on).toHaveBeenNthCalledWith(
      3,
      PluginEvents.lifecycleSignal.crashed,
      expect.any(Function),
    )
  })
})
