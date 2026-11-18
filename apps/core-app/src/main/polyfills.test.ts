import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

interface Log4jsStubLogger {
  level: string
}

async function loadPolyfills(options: { isPackaged: boolean; userDataDir: string }): Promise<{
  defaultLogger: Log4jsStubLogger
  errorLogger: Log4jsStubLogger
  runtimeLogger: Log4jsStubLogger
}> {
  vi.resetModules()
  const defaultLogger: Log4jsStubLogger = { level: 'INFO' }
  const errorLogger: Log4jsStubLogger = { level: 'ERROR' }
  const runtimeLogger: Log4jsStubLogger = { level: 'INFO' }

  vi.doMock('electron', () => ({
    app: {
      isPackaged: options.isPackaged,
      getPath: vi.fn(() => options.userDataDir),
      setPath: vi.fn()
    }
  }))
  vi.doMock('log4js', () => ({
    getLogger: vi.fn((category?: string) => {
      if (category === 'error') return errorLogger
      if (category === 'runtime') return runtimeLogger
      return defaultLogger
    })
  }))
  vi.doMock('./core/acceptance-mode', () => ({
    resolveStartupBenchmarkUserDataDir: vi.fn(() => undefined)
  }))

  await import('./polyfills')
  return { defaultLogger, errorLogger, runtimeLogger }
}

describe('main polyfills log4js global bindings', () => {
  const tempDirs: string[] = []
  const originalDebug = process.env.DEBUG
  const originalLogger = (globalThis as { logger?: unknown }).logger
  const originalErrLogger = (globalThis as { errLogger?: unknown }).errLogger
  const originalPkg = (globalThis as { $pkg?: unknown }).$pkg

  afterEach(() => {
    vi.doUnmock('electron')
    vi.doUnmock('log4js')
    vi.doUnmock('./core/acceptance-mode')
    vi.resetModules()
    if (originalDebug === undefined) delete process.env.DEBUG
    else process.env.DEBUG = originalDebug
    ;(globalThis as { logger?: unknown }).logger = originalLogger
    ;(globalThis as { errLogger?: unknown }).errLogger = originalErrLogger
    ;(globalThis as { $pkg?: unknown }).$pkg = originalPkg
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true })
    }
  })

  it('binds globalThis.logger and globalThis.errLogger while keeping INFO level in packaged builds', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'tuff-polyfills-pkg-'))
    tempDirs.push(dir)

    const { defaultLogger, errorLogger, runtimeLogger } = await loadPolyfills({
      isPackaged: true,
      userDataDir: dir
    })

    expect(globalThis.logger).toBe(defaultLogger)
    expect(globalThis.errLogger).toBe(errorLogger)
    expect(defaultLogger.level).toBe('INFO')
    expect(runtimeLogger.level).toBe('warn')
  })

  it('elevates globalThis.logger to debug when debug.talex marker exists', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'tuff-polyfills-dbg-'))
    tempDirs.push(dir)
    writeFileSync(path.join(dir, 'debug.talex'), '')

    const { defaultLogger, runtimeLogger } = await loadPolyfills({
      isPackaged: true,
      userDataDir: dir
    })

    expect(process.env.DEBUG).toBe('true')
    expect(defaultLogger.level).toBe('debug')
    expect(runtimeLogger.level).toBe('debug')
  })
})
