import { afterEach, describe, expect, it, vi } from 'vitest'
import { loggerManager } from '../common/logger/logger-manager'
import { LogLevel } from '../common/logger/types'

interface GlobalWithLoggers {
  logger?: {
    debug: (...args: unknown[]) => void
    info: (...args: unknown[]) => void
    warn: (...args: unknown[]) => void
    error: (...args: unknown[]) => void
  }
  errLogger?: {
    debug: (...args: unknown[]) => void
    info: (...args: unknown[]) => void
    warn: (...args: unknown[]) => void
    error: (...args: unknown[]) => void
  }
}

describe('ModuleLogger main-process log persistence', () => {
  const globalTarget = globalThis as unknown as GlobalWithLoggers
  const originalLogger = globalTarget.logger
  const originalErrLogger = globalTarget.errLogger

  afterEach(() => {
    globalTarget.logger = originalLogger
    globalTarget.errLogger = originalErrLogger
    loggerManager.reset()
    vi.restoreAllMocks()
  })

  it('routes INFO/WARN to globalThis.logger and ERROR to globalThis.errLogger', () => {
    const defaultSink = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
    const errSink = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
    globalTarget.logger = defaultSink
    globalTarget.errLogger = errSink
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const dbLog = loggerManager.getLogger('database')
    dbLog.info('Search index database initialized', { meta: { path: '/tmp/p/search-index.db' } })
    dbLog.warn('Database health snapshot exceeded contention threshold', { meta: { busyRetryDelta: 12 } })
    dbLog.error('Corrupt search database detected during init; quarantining and rebuilding')

    expect(defaultSink.info).toHaveBeenCalledTimes(1)
    expect(String(defaultSink.info.mock.calls[0]?.[0] ?? '')).toContain(
      'Search index database initialized {"meta":{"path":"/tmp/p/search-index.db"}}'
    )
    expect(defaultSink.warn).toHaveBeenCalledTimes(1)
    expect(String(defaultSink.warn.mock.calls[0]?.[0] ?? '')).toContain(
      'Database health snapshot exceeded contention threshold'
    )
    expect(errSink.error).toHaveBeenCalledTimes(1)
    expect(String(errSink.error.mock.calls[0]?.[0] ?? '')).toContain(
      'Corrupt search database detected during init'
    )
  })

  it('serializes nested Error details (message, code, cause) instead of {} and tolerates cycles', () => {
    const defaultSink = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
    globalTarget.logger = defaultSink
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const rootCause = Object.assign(new Error('SQLITE_BUSY: database is locked'), {
      code: 'SQLITE_BUSY',
      rawCode: 5
    })
    const wrapper = new Error('Search index init failed', { cause: rootCause })
    const cyclic: Record<string, unknown> = { error: wrapper }
    cyclic.self = cyclic

    const dbLog = loggerManager.getLogger('database')
    dbLog.warn('Search index database initialization failed; falling back to primary DB', cyclic)

    expect(defaultSink.warn).toHaveBeenCalledTimes(1)
    const line = String(defaultSink.warn.mock.calls[0]?.[0] ?? '')
    expect(line).toContain('Search index database initialization failed; falling back to primary DB')
    expect(line).toContain('SQLITE_BUSY: database is locked')
    expect(line).toContain('"code":"SQLITE_BUSY"')
    expect(line).toContain('"self":"[Circular]"')
  })

  it('does not throw when globalThis.logger is absent (renderer or isolated unit tests)', () => {
    delete globalTarget.logger
    delete globalTarget.errLogger

    const dbLog = loggerManager.getLogger('database')
    dbLog.setLevel(LogLevel.INFO)
    expect(() => dbLog.info('Search index database initialized', { meta: { path: '/tmp/x' } })).not.toThrow()
    expect(() => dbLog.error('Corrupt primary database detected')).not.toThrow()
  })
})
