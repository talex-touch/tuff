import { describe, expect, it, vi } from 'vitest'
import { AppStartEvent, TalexEvents, TouchEventBus } from './touch-event'

describe('TouchEventBus', () => {
  it('consumes once handler after first emit', () => {
    const bus = new TouchEventBus()
    const handler = vi.fn()

    bus.once(TalexEvents.APP_START, handler)
    bus.emit(TalexEvents.APP_START, new AppStartEvent())
    bus.emit(TalexEvents.APP_START, new AppStartEvent())

    expect(handler).toHaveBeenCalledTimes(1)
    const diagnostics = bus.getDiagnostics()
    expect(diagnostics.onceConsumedCount).toBe(1)
    expect(diagnostics.totalHandlers).toBe(0)
  })

  it('isolates handler failures in emit', () => {
    const bus = new TouchEventBus()
    const safeHandler = vi.fn()

    bus.on(TalexEvents.APP_START, () => {
      throw new Error('boom')
    })
    bus.on(TalexEvents.APP_START, safeHandler)

    expect(() => bus.emit(TalexEvents.APP_START, new AppStartEvent())).not.toThrow()
    expect(safeHandler).toHaveBeenCalledTimes(1)
  })

  it('awaits async handlers and isolates async failures in emitAsync', async () => {
    const bus = new TouchEventBus()
    const calls: string[] = []

    bus.on(TalexEvents.APP_START, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      calls.push('first')
    })
    bus.on(TalexEvents.APP_START, async () => {
      throw new Error('async-fail')
    })
    bus.on(TalexEvents.APP_START, async () => {
      calls.push('third')
    })

    await expect(bus.emitAsync(TalexEvents.APP_START, new AppStartEvent())).resolves.toBeUndefined()
    expect(calls).toEqual(['first', 'third'])
  })
})
