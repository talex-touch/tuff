/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NetworkEvents, SyncEvents } from '@talex-touch/utils/transport/events'

function eventName(event: { toEventName?: () => string } | string): string {
  return typeof event === 'string' ? event : (event.toEventName?.() ?? String(event))
}

const transportMocks = vi.hoisted(() => ({
  send: vi.fn(),
  on: vi.fn()
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => transportMocks
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: vi.fn(() => ({
    warn: vi.fn()
  }))
}))

describe('auto-sync-manager network recovery', () => {
  afterEach(async () => {
    const { stopAutoSync } = await import('./auto-sync-manager')
    stopAutoSync('test-cleanup')
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('reports browser online and offline transitions to the main network lifecycle', async () => {
    transportMocks.send.mockResolvedValue(undefined)
    transportMocks.on.mockReturnValue(vi.fn())
    const { startAutoSync } = await import('./auto-sync-manager')

    await startAutoSync()
    window.dispatchEvent(new Event('offline'))
    window.dispatchEvent(new Event('online'))

    expect(transportMocks.send).toHaveBeenCalledWith(
      SyncEvents.lifecycle.start,
      expect.objectContaining({ reason: 'renderer' })
    )
    expect(transportMocks.send).toHaveBeenCalledWith(
      NetworkEvents.lifecycle.offline,
      expect.objectContaining({ reason: 'offline' })
    )
    expect(transportMocks.send).toHaveBeenCalledWith(
      NetworkEvents.lifecycle.online,
      expect.objectContaining({ reason: 'online' })
    )
    expect(transportMocks.send).toHaveBeenCalledWith(
      SyncEvents.lifecycle.trigger,
      expect.objectContaining({ reason: 'online' })
    )
  })

  it('triggers sync from main status broadcast without double firing near browser online', async () => {
    let statusHandler: ((payload: { online: boolean }) => void) | undefined
    transportMocks.send.mockResolvedValue(undefined)
    transportMocks.on.mockImplementation((event, handler) => {
      if (eventName(event) === NetworkEvents.lifecycle.status.toEventName()) {
        statusHandler = handler
      }
      return vi.fn()
    })
    const { startAutoSync } = await import('./auto-sync-manager')

    await startAutoSync()
    statusHandler?.({ online: true })
    window.dispatchEvent(new Event('online'))

    expect(
      transportMocks.send.mock.calls.filter(
        ([event, payload]) =>
          eventName(event) === SyncEvents.lifecycle.trigger.toEventName() &&
          payload?.reason === 'online'
      )
    ).toHaveLength(1)
  })

  it('unsubscribes network status when auto sync stops', async () => {
    const dispose = vi.fn()
    transportMocks.send.mockResolvedValue(undefined)
    transportMocks.on.mockReturnValue(dispose)
    const { startAutoSync, stopAutoSync } = await import('./auto-sync-manager')

    await startAutoSync()
    stopAutoSync('manual')

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(
      transportMocks.send.mock.calls.some(
        ([event, payload]) =>
          eventName(event) === SyncEvents.lifecycle.stop.toEventName() &&
          payload?.reason === 'manual'
      )
    ).toBe(true)
  })
})
