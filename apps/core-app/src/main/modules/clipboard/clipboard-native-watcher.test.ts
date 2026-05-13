import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ClipboardNativeWatcher,
  isClipboardNativeWatcherEnabled,
  resolveClipboardWatcherModule
} from './clipboard-native-watcher'

describe('clipboard-native-watcher', () => {
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

  it('starts once and schedules native-watch monitor callbacks', async () => {
    const stop = vi.fn()
    const startWatch = vi.fn((callback: () => void) => {
      callback()
      return { stop, isRunning: true }
    })
    const scheduleMonitor = vi.fn()
    const watcher = new ClipboardNativeWatcher({
      isDestroyed: () => false,
      scheduleMonitor,
      importWatcherModule: vi.fn(async () => ({ startWatch })),
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logDebug: vi.fn()
    })

    await watcher.start()
    await watcher.start()
    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(startWatch).toHaveBeenCalledTimes(1)
    expect(scheduleMonitor).toHaveBeenCalledWith({ bypassCooldown: true, source: 'native-watch' })

    watcher.stop()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('does not import watcher when disabled by env', async () => {
    const importWatcherModule = vi.fn()
    const watcher = new ClipboardNativeWatcher({
      getEnv: () => 'off',
      isDestroyed: () => false,
      scheduleMonitor: vi.fn(),
      importWatcherModule,
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logDebug: vi.fn()
    })

    await watcher.start()

    expect(importWatcherModule).not.toHaveBeenCalled()
  })
})
