import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IndexedWorkerSchedulerService } from '../../search'

function createService(options: { context?: string | null } = {}) {
  const context = Object.prototype.hasOwnProperty.call(options, 'context')
    ? options.context
    : 'worker-context'
  const dispatch = vi.fn(async () => undefined)
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

  it('skips scheduling when context is unavailable', () => {
    const { dispatch, service } = createService({ context: null })

    service.schedule({ payload: [1], reason: 'test' })

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('chunks immediate payloads', () => {
    const { dispatch, service } = createService()

    service.schedule({ payload: [1, 2, 3], reason: 'immediate' })

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

  it('logs worker failures without throwing', async () => {
    const error = new Error('worker failed')
    const { dispatch, logWarn, service } = createService()
    dispatch.mockRejectedValueOnce(error)

    service.schedule({ payload: [1], reason: 'test' })
    await Promise.resolve()

    expect(logWarn).toHaveBeenCalledWith('Index worker failed', error, {
      reason: 'test',
      size: 1
    })
  })
})
