import { beforeEach, describe, expect, it, vi } from 'vitest'

const logger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn()
}))

vi.mock('../../utils/logger', () => ({
  createLogger: () => logger
}))

import { OperationalErrorService } from './operational-error-service'

describe('OperationalErrorService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redacts public data and deduplicates detail and aggregate delivery', () => {
    const service = new OperationalErrorService()
    const detailSink = vi.fn()
    const aggregateSink = vi.fn()
    service.attachDetailSink(detailSink)
    service.attachAggregateSink(aggregateSink)
    const cause = Object.assign(new Error('SQLITE_BUSY'), { code: 'SQLITE_BUSY', rawCode: 5 })
    const error = new Error('Failed query: DELETE FROM scan_progress /Users/alice/private', {
      cause
    })

    const first = service.report({
      domain: 'file-index',
      operation: 'manual-rebuild',
      error,
      code: 'FILE_INDEX_DATABASE_BUSY',
      retryable: true,
      userImpact: 'blocked',
      publicMessage: error.message,
      context: {
        sourceId: 'file-provider',
        databasePath: '/Users/alice/private/database.db',
        attempts: 7
      }
    })
    const second = service.report({
      domain: 'file-index',
      operation: 'manual-rebuild',
      error,
      code: 'FILE_INDEX_DATABASE_BUSY',
      retryable: true,
      userImpact: 'blocked'
    })

    expect(first).toMatchObject({
      code: 'FILE_INDEX_DATABASE_BUSY',
      retryable: true,
      publicMessage: 'Database is busy. Please retry.',
      occurrenceCount: 1,
      context: { sourceId: 'file-provider', attempts: 7 }
    })
    expect(first.context).not.toHaveProperty('databasePath')
    expect(second.occurrenceCount).toBe(2)
    expect(detailSink).toHaveBeenCalledOnce()
    expect(detailSink.mock.calls[0][0].error).toBe(error)
    expect(aggregateSink).toHaveBeenCalledOnce()
  })

  it('flushes bounded pre-init detail once and drops disabled-period detail', () => {
    const service = new OperationalErrorService()
    for (let index = 0; index < 70; index += 1) {
      service.report({
        domain: 'bootstrap',
        operation: `failure-${index}`,
        error: new Error(`failure ${index}`),
        code: 'BOOTSTRAP_FAILURE'
      })
    }

    const sink = vi.fn()
    service.attachDetailSink(sink)
    expect(sink).toHaveBeenCalledTimes(64)

    service.disableDetailDelivery()
    service.report({
      domain: 'bootstrap',
      operation: 'disabled-failure',
      error: new Error('disabled'),
      code: 'BOOTSTRAP_FAILURE'
    })
    service.attachDetailSink(sink)
    expect(sink).toHaveBeenCalledTimes(64)
  })

  it('isolates synchronous and asynchronous sink failures from business results', async () => {
    const service = new OperationalErrorService()
    service.attachDetailSink(() => {
      throw new Error('sink failed')
    })
    service.attachAggregateSink(async () => {
      throw new Error('aggregate failed')
    })

    expect(() =>
      service.report({
        domain: 'runtime',
        operation: 'business-operation',
        error: new Error('business failed'),
        code: 'BUSINESS_FAILED'
      })
    ).not.toThrow()

    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalled())
  })
})
