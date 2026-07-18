import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IndexedWorkerSchedulerService as SdkIndexedWorkerSchedulerService } from '@talex-touch/utils/search'
import { IndexedWorkerSchedulerService } from './indexing-worker-scheduler-service'

function createService(options: { context?: string | null } = {}) {
  const context = Object.prototype.hasOwnProperty.call(options, 'context')
    ? options.context
    : 'worker-context'
  const dispatch = vi.fn<(context: string, payload: number[]) => Promise<void>>(
    async (_context, _payload) => undefined
  )
  const logWarn = vi.fn()
  const service = new IndexedWorkerSchedulerService<number>({
    getWorkerContext: () => context ?? null,
    dispatch,
    logWarn,
    config: {
      chunkSize: 2,
      deferredDelayMs: 20
    }
  })

  return {
    dispatch,
    logWarn,
    service
  }
}

describe('indexing-worker-scheduler-service', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('re-exports the public SDK worker scheduler for legacy CoreApp imports', () => {
    expect(IndexedWorkerSchedulerService).toBe(SdkIndexedWorkerSchedulerService)
  })

  it('skips scheduling when context is unavailable', () => {
    const { dispatch, service } = createService({ context: null })

    service.schedule({ payload: [1], reason: 'test' })

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('chunks immediate payloads', async () => {
    const { dispatch, service } = createService()

    service.schedule({ payload: [1, 2, 3], reason: 'immediate' })
    await service.drain()

    expect(dispatch).toHaveBeenCalledTimes(2)
    expect(dispatch).toHaveBeenNthCalledWith(1, 'worker-context', [1, 2])
    expect(dispatch).toHaveBeenNthCalledWith(2, 'worker-context', [3])
  })

  it('defers scheduled payloads', async () => {
    const { dispatch, service } = createService()

    service.schedule({ payload: [1], reason: 'background', deferred: true })

    expect(dispatch).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(20)

    expect(dispatch).toHaveBeenCalledWith('worker-context', [1])
  })

  it('reports worker failures through drain after logging them', async () => {
    const error = new Error('worker failed')
    const { dispatch, logWarn, service } = createService()
    dispatch.mockRejectedValueOnce(error)

    service.schedule({ payload: [1], reason: 'test' })
    await expect(service.drain()).rejects.toMatchObject({ errors: [error] })

    expect(logWarn).toHaveBeenCalledWith('Index worker failed', error, {
      reason: 'test',
      size: 1
    })
  })

  it('keeps deferred and active dispatches pending until drain observes completion', async () => {
    let releaseDispatch!: () => void
    const dispatched = new Promise<void>((resolve) => {
      releaseDispatch = resolve
    })
    const { dispatch, service } = createService()
    dispatch.mockImplementation(async () => {
      await dispatched
      return undefined
    })

    service.schedule({ payload: [1], reason: 'background', deferred: true })
    expect(service.hasPendingWork()).toBe(true)

    await vi.advanceTimersByTimeAsync(20)
    expect(dispatch).toHaveBeenCalledWith('worker-context', [1])
    expect(service.hasPendingWork()).toBe(true)

    const draining = service.drain()
    releaseDispatch()
    await vi.runAllTimersAsync()
    await draining

    expect(service.hasPendingWork()).toBe(false)
  })

  it('prevents delayed dispatch after close', async () => {
    const { dispatch, service } = createService()

    service.schedule({ payload: [1], reason: 'background', deferred: true })
    service.close()
    await vi.runAllTimersAsync()

    expect(dispatch).not.toHaveBeenCalled()
    expect(service.hasPendingWork()).toBe(false)
  })

  it('surfaces completed dispatch failures from drain after active work settles', async () => {
    const error = new Error('worker failed')
    const { dispatch, service } = createService()
    dispatch.mockRejectedValueOnce(error)

    service.schedule({ payload: [1], reason: 'test' })
    await Promise.resolve()
    await Promise.resolve()

    await expect(service.drain()).rejects.toMatchObject({ errors: [error] })
    expect(service.hasPendingWork()).toBe(false)
  })

  it('cancels an active scope without recording its late failure while other scopes remain schedulable', async () => {
    const activeDispatchStarted = Promise.withResolvers<void>()
    const releaseActiveDispatch = Promise.withResolvers<void>()
    const lateFailure = new Error('cancelled dispatch failed')
    const { dispatch, logWarn, service } = createService()
    dispatch.mockImplementation(async (_context, payload) => {
      if (payload[0] !== 1) return
      activeDispatchStarted.resolve()
      await releaseActiveDispatch.promise
      throw lateFailure
    })

    service.schedule({ payload: [1], reason: 'active', scopeId: 'cancelled-lease' })
    await activeDispatchStarted.promise
    service.cancelScope('cancelled-lease')
    service.schedule({ payload: [2], reason: 'cancelled', scopeId: 'cancelled-lease' })
    service.schedule({ payload: [3], reason: 'other', scopeId: 'other-lease' })

    await service.drain(1_000, 'other-lease')
    expect(dispatch).toHaveBeenCalledTimes(2)
    expect(dispatch).toHaveBeenNthCalledWith(2, 'worker-context', [3])
    expect(service.hasPendingWork('cancelled-lease')).toBe(true)

    releaseActiveDispatch.resolve()
    await expect(service.drain(1_000, 'cancelled-lease')).resolves.toBeUndefined()

    expect(service.hasPendingWork('cancelled-lease')).toBe(false)
    expect(logWarn).not.toHaveBeenCalled()
  })
})
