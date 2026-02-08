import { describe, expect, it, vi } from 'vitest'
import { AppEvents } from '../transport/events'
import { createPowerSDK } from '../plugin/sdk/power'

type ChannelListener = (payload: unknown) => unknown

function createMockChannel(options: {
  sendImpl?: (eventName: string, payload?: unknown) => Promise<unknown>
} = {}) {
  const listeners = new Map<string, Set<ChannelListener>>()

  const channel = {
    send: vi.fn(async (eventName: string, payload?: unknown) => {
      if (options.sendImpl) {
        return options.sendImpl(eventName, payload)
      }
      return null
    }),
    regChannel: vi.fn((eventName: string, handler: ChannelListener) => {
      const set = listeners.get(eventName) || new Set<ChannelListener>()
      set.add(handler)
      listeners.set(eventName, set)

      return () => {
        const current = listeners.get(eventName)
        current?.delete(handler)
      }
    }),
  }

  const emit = async (eventName: string, payload: unknown) => {
    const set = listeners.get(eventName)
    if (!set || set.size === 0) {
      return
    }

    for (const handler of set) {
      await handler(payload)
    }
  }

  return { channel, emit }
}

describe('PowerSDK', () => {
  it('returns lowPower=true when on battery and below threshold', async () => {
    const { channel } = createMockChannel({
      sendImpl: async (eventName) => {
        if (eventName === AppEvents.fileIndex.batteryLevel.toEventName()) {
          return { level: 15, charging: false }
        }
        return null
      },
    })

    const sdk = createPowerSDK(channel as any)
    const status = await sdk.getLowPowerStatus({ threshold: 20 })

    expect(status).toEqual({
      lowPower: true,
      onBattery: true,
      percent: 15,
      threshold: 20,
    })
  })

  it('falls back to safe defaults when battery query fails', async () => {
    const { channel } = createMockChannel({
      sendImpl: async () => {
        throw new Error('query failed')
      },
    })

    const sdk = createPowerSDK(channel as any)
    const status = await sdk.getLowPowerStatus({ threshold: 999 })

    expect(status).toEqual({
      lowPower: false,
      onBattery: false,
      percent: null,
      threshold: 100,
    })
  })

  it('isLowPower returns boolean shortcut value', async () => {
    const { channel } = createMockChannel({
      sendImpl: async (eventName) => {
        if (eventName === AppEvents.fileIndex.batteryLevel.toEventName()) {
          return { level: 60, charging: false }
        }
        return null
      },
    })

    const sdk = createPowerSDK(channel as any)

    await expect(sdk.isLowPower({ threshold: 50 })).resolves.toBe(false)
    await expect(sdk.isLowPower({ threshold: 70 })).resolves.toBe(true)
  })

  it('onLowPowerChanged emits immediately and deduplicates repeated states', async () => {
    const { channel, emit } = createMockChannel({
      sendImpl: async (eventName) => {
        if (eventName === AppEvents.fileIndex.batteryLevel.toEventName()) {
          return { level: 40, charging: false }
        }
        return null
      },
    })

    const sdk = createPowerSDK(channel as any)
    const callback = vi.fn()

    const dispose = sdk.onLowPowerChanged(callback, { threshold: 30 })

    await new Promise(resolve => setTimeout(resolve, 0))
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenLastCalledWith({
      lowPower: false,
      onBattery: true,
      percent: 40,
      threshold: 30,
    })

    const batteryStatusEvent = AppEvents.power.batteryStatus.toEventName()

    await emit(batteryStatusEvent, { onBattery: true, percent: 20 })
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith({
      lowPower: true,
      onBattery: true,
      percent: 20,
      threshold: 30,
    })

    await emit(batteryStatusEvent, { onBattery: true, percent: 20 })
    expect(callback).toHaveBeenCalledTimes(2)

    dispose()
    await emit(batteryStatusEvent, { onBattery: false, percent: 90 })
    expect(callback).toHaveBeenCalledTimes(2)
  })
})
