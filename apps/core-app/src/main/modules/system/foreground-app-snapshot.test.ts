import type { ActiveAppInfo } from './active-app'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    child: () => ({
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn()
    }),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  })
}))

import { ForegroundAppSnapshotStore, isSelfActiveApp } from './foreground-app-snapshot'

function createActiveApp(overrides: Partial<ActiveAppInfo> = {}): ActiveAppInfo {
  return {
    identifier: 'com.microsoft.VSCode',
    displayName: 'Visual Studio Code',
    bundleId: 'com.microsoft.VSCode',
    processId: 4242,
    executablePath: '/Applications/Visual Studio Code.app',
    platform: 'macos',
    windowTitle: 'index.ts',
    lastUpdated: 0,
    ...overrides
  }
}

describe('isSelfActiveApp', () => {
  it('recognises Touch by process id', () => {
    expect(isSelfActiveApp(createActiveApp({ processId: process.pid }))).toBe(true)
  })

  it('recognises Touch when the reported path is the bundle around our binary', () => {
    expect(
      isSelfActiveApp(
        createActiveApp({ executablePath: '/Applications/Touch.app' }),
        '/Applications/Touch.app/Contents/MacOS/Touch'
      )
    ).toBe(true)
  })

  it('does not mistake another app for Touch', () => {
    expect(isSelfActiveApp(createActiveApp(), '/Applications/Touch.app/Contents/MacOS/Touch')).toBe(
      false
    )
  })
})

describe('ForegroundAppSnapshotStore', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('holds the pre-show source throughout activation, even after fifteen seconds and repeated capture', async () => {
    let now = 1_000
    let foreground = createActiveApp()
    const source = foreground
    const store = new ForegroundAppSnapshotStore({
      queryActiveApp: async () => foreground,
      isSelfApp: isSelfActiveApp,
      now: () => now
    })

    store.capture()
    expect(await store.resolve()).toEqual({ app: source, capturedAt: 1_000 })
    foreground = createActiveApp({
      bundleId: 'com.apple.Terminal',
      identifier: 'com.apple.Terminal'
    })
    now += 60_000
    store.capture()

    expect(await store.resolve()).toEqual({ app: source, capturedAt: 1_000 })
    expect(store.get()?.app.bundleId).toBe('com.microsoft.VSCode')
    expect(store.hasActiveSession).toBe(true)

    store.clear()
    expect(store.get()).toBeNull()
    expect(store.hasActiveSession).toBe(false)
    store.capture()
    expect((await store.resolve())?.app.bundleId).toBe('com.apple.Terminal')
  })

  it('does not replace a pending activation capture when capture is requested again', async () => {
    const pending = Promise.withResolvers<ActiveAppInfo | null>()
    const source = createActiveApp()
    let reads = 0
    const store = new ForegroundAppSnapshotStore({
      queryActiveApp: () => {
        reads += 1
        return reads === 1
          ? pending.promise
          : Promise.resolve(createActiveApp({ bundleId: 'wrong.source' }))
      },
      isSelfApp: isSelfActiveApp,
      now: () => 1_000
    })

    store.capture()
    store.capture()
    pending.resolve(source)

    expect((await store.resolve())?.app.bundleId).toBe(source.bundleId)
  })

  it('discards a late capture after hide without overwriting the next activation', async () => {
    const first = Promise.withResolvers<ActiveAppInfo | null>()
    const second = Promise.withResolvers<ActiveAppInfo | null>()
    let reads = 0
    const store = new ForegroundAppSnapshotStore({
      queryActiveApp: () => (++reads === 1 ? first.promise : second.promise),
      isSelfApp: isSelfActiveApp,
      now: () => reads * 1_000
    })

    store.capture()
    store.clear()
    store.capture()
    const waiting = store.resolve(100)
    first.resolve(createActiveApp({ bundleId: 'obsolete.source' }))
    await first.promise
    expect(store.get()).toBeNull()
    second.resolve(createActiveApp({ bundleId: 'current.source' }))

    expect((await waiting)?.app.bundleId).toBe('current.source')
    expect(store.get()?.app.bundleId).toBe('current.source')
  })

  it.each([194, 240])(
    'waits for a cold source capture completing after %sms rather than reporting unknown early',
    async (captureDelayMs) => {
      vi.useFakeTimers()
      const pending = Promise.withResolvers<ActiveAppInfo | null>()
      const source = createActiveApp({ bundleId: 'cold.source' })
      const store = new ForegroundAppSnapshotStore({
        queryActiveApp: () => pending.promise,
        isSelfApp: isSelfActiveApp,
        now: () => 1_000
      })
      store.capture()
      let settled = false
      const reading = store.resolve().then((snapshot) => {
        settled = true
        return snapshot
      })

      await vi.advanceTimersByTimeAsync(captureDelayMs - 1)
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      pending.resolve(source)

      expect((await reading)?.app.bundleId).toBe('cold.source')
    }
  )

  it('never substitutes the next activation for an origin read still pending when its activation hides', async () => {
    vi.useFakeTimers()
    const sourceA = Promise.withResolvers<ActiveAppInfo | null>()
    const sourceB = Promise.withResolvers<ActiveAppInfo | null>()
    let captures = 0
    const store = new ForegroundAppSnapshotStore({
      queryActiveApp: () => (++captures === 1 ? sourceA.promise : sourceB.promise),
      isSelfApp: isSelfActiveApp,
      now: () => 1_000
    })
    store.capture()
    const originalRead = store.resolve()
    store.clear()
    store.capture()
    const nextRead = store.resolve()
    sourceB.resolve(createActiveApp({ bundleId: 'source.b' }))
    expect((await nextRead)?.app.bundleId).toBe('source.b')

    sourceA.resolve(createActiveApp({ bundleId: 'source.a' }))
    expect(await originalRead).toBeNull()
    expect(store.get()?.app.bundleId).toBe('source.b')
  })

  it('honors an explicit caller forty-millisecond bound while a later capture can still become available', async () => {
    vi.useFakeTimers()
    const pending = Promise.withResolvers<ActiveAppInfo | null>()
    const source = createActiveApp()
    const store = new ForegroundAppSnapshotStore({
      queryActiveApp: () => pending.promise,
      isSelfApp: isSelfActiveApp,
      now: () => 1_000
    })
    store.capture()
    let settled = false
    const reading = store.resolve(40).then((result) => {
      settled = true
      return result
    })

    await vi.advanceTimersByTimeAsync(39)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await reading).toBeNull()
    expect(store.hasActiveSession).toBe(true)

    pending.resolve(source)
    expect((await store.resolve())?.app).toBe(source)
  })

  it.each(['self', 'unavailable', 'denied'] as const)(
    'does not fabricate a source from a %s capture',
    async (kind) => {
      const store = new ForegroundAppSnapshotStore({
        queryActiveApp: async () => {
          if (kind === 'denied') throw new Error('automation permission denied')
          return kind === 'self' ? createActiveApp({ processId: process.pid }) : null
        },
        isSelfApp: isSelfActiveApp,
        now: () => 1_000
      })

      store.capture()
      expect(await store.resolve()).toBeNull()
      expect(store.get()).toBeNull()
      expect(store.hasActiveSession).toBe(true)
      store.clear()
      expect(store.hasActiveSession).toBe(false)
    }
  )
})
