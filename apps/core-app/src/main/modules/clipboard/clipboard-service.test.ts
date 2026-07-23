import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ClipboardService,
  isClipboardNativeWatcherEnabled,
  resolveClipboardWatcherModule
} from './clipboard-service'

describe('clipboard-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses native watcher env switches', () => {
    expect(isClipboardNativeWatcherEnabled(() => undefined)).toBe(true)
    expect(isClipboardNativeWatcherEnabled(() => '0')).toBe(false)
    expect(isClipboardNativeWatcherEnabled(() => 'false')).toBe(false)
    expect(isClipboardNativeWatcherEnabled(() => 'off')).toBe(false)
    expect(isClipboardNativeWatcherEnabled(() => '1')).toBe(true)
  })

  it('resolves watcher module from common export wrappers', () => {
    const module = { startWatch: vi.fn() }
    expect(resolveClipboardWatcherModule({ default: { default: module } })).toBe(module)
    expect(resolveClipboardWatcherModule({ 'module.exports': module })).toBe(module)
    expect(resolveClipboardWatcherModule({})).toBeNull()
  })

  it('starts once, schedules native-watch monitor callbacks, and reports native mode', async () => {
    const stop = vi.fn()
    const startWatch = vi.fn((callback: () => void) => {
      callback()
      return { stop, isRunning: true }
    })
    const scheduleMonitor = vi.fn()
    const onModeChange = vi.fn()
    const service = new ClipboardService({
      isDestroyed: () => false,
      scheduleMonitor,
      onModeChange,
      importWatcherModule: vi.fn(async () => ({ startWatch })),
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logDebug: vi.fn()
    })

    await service.start()
    await service.start()
    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(startWatch).toHaveBeenCalledTimes(1)
    expect(scheduleMonitor).toHaveBeenCalledWith({ bypassCooldown: true, source: 'native-watch' })

    const health = service.getHealth()
    expect(health.mode).toBe('native')
    expect(health.nativeActive).toBe(true)
    expect(health.degraded).toBe(false)
    expect(health.nativeChangeCount).toBe(1)
    expect(onModeChange).toHaveBeenCalledTimes(1)
    expect(onModeChange.mock.calls[0][0].mode).toBe('native')

    service.stop()
    expect(stop).toHaveBeenCalledTimes(1)
    expect(service.getHealth().nativeActive).toBe(false)
  })

  it('does not import watcher when disabled by env and stays in polling mode', async () => {
    const importWatcherModule = vi.fn()
    const onModeChange = vi.fn()
    const service = new ClipboardService({
      getEnv: () => 'off',
      isDestroyed: () => false,
      scheduleMonitor: vi.fn(),
      onModeChange,
      importWatcherModule,
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logDebug: vi.fn()
    })

    await service.start()

    expect(importWatcherModule).not.toHaveBeenCalled()
    const health = service.getHealth()
    expect(health.enabled).toBe(false)
    expect(health.mode).toBe('polling')
    // Disabled on purpose is not "degraded".
    expect(health.degraded).toBe(false)
    expect(onModeChange).toHaveBeenCalledWith(expect.objectContaining({ mode: 'polling' }))
  })

  it('reports a degraded fallback when the native module fails to load', async () => {
    const onModeChange = vi.fn()
    const service = new ClipboardService({
      isDestroyed: () => false,
      scheduleMonitor: vi.fn(),
      onModeChange,
      importWatcherModule: vi.fn(async () => {
        throw new Error('dlopen failed: slice is not valid mach-o file')
      }),
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logDebug: vi.fn()
    })

    await service.start()

    const health = service.getHealth()
    expect(health.mode).toBe('polling')
    expect(health.enabled).toBe(true)
    expect(health.degraded).toBe(true)
    expect(health.lastError).toContain('mach-o')
    expect(onModeChange).toHaveBeenCalledTimes(1)
    expect(onModeChange.mock.calls[0][0].degraded).toBe(true)
  })

  it('treats a module without startWatch as degraded', async () => {
    const service = new ClipboardService({
      isDestroyed: () => false,
      scheduleMonitor: vi.fn(),
      importWatcherModule: vi.fn(async () => ({ notAWatcher: true })),
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logDebug: vi.fn()
    })

    await service.start()

    const health = service.getHealth()
    expect(health.degraded).toBe(true)
    expect(health.lastError).toContain('startWatch')
  })

  it('reset() clears health and allows a fresh start attempt', async () => {
    const startWatch = vi.fn(() => ({ stop: vi.fn(), isRunning: true }))
    const service = new ClipboardService({
      isDestroyed: () => false,
      scheduleMonitor: vi.fn(),
      importWatcherModule: vi.fn(async () => ({ startWatch })),
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logDebug: vi.fn()
    })

    await service.start()
    expect(service.getHealth().startAttempted).toBe(true)

    service.reset()
    const health = service.getHealth()
    expect(health.startAttempted).toBe(false)
    expect(health.nativeActive).toBe(false)
    expect(health.nativeChangeCount).toBe(0)

    await service.start()
    expect(startWatch).toHaveBeenCalledTimes(2)
  })

  it('exposes an off-thread reader only when the module has the async read API', async () => {
    const startWatch = vi.fn(() => ({ stop: vi.fn(), isRunning: true }))
    const service = new ClipboardService({
      isDestroyed: () => false,
      scheduleMonitor: vi.fn(),
      importWatcherModule: vi.fn(async () => ({
        startWatch,
        getText: async () => 'native-text',
        getHtml: async () => '',
        getFiles: async () => [],
        getImageBinary: async () => []
      })),
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logDebug: vi.fn()
    })

    expect(service.getReader()).toBeNull() // not started yet

    await service.start()
    const reader = service.getReader()
    expect(reader?.kind).toBe('native')
    await expect(reader?.readText()).resolves.toBe('native-text')
    expect(service.getReader()).toBe(reader) // cached

    service.stop()
    expect(service.getReader()).toBeNull()
  })

  it('returns no reader when the native module lacks the read API', async () => {
    const startWatch = vi.fn(() => ({ stop: vi.fn(), isRunning: true }))
    const service = new ClipboardService({
      isDestroyed: () => false,
      scheduleMonitor: vi.fn(),
      importWatcherModule: vi.fn(async () => ({ startWatch })),
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logDebug: vi.fn()
    })

    await service.start()
    expect(service.isNativeActive()).toBe(true)
    expect(service.getReader()).toBeNull()
  })
})
