import type { ActiveAppInfo } from './active-app'
import { describe, expect, it, vi } from 'vitest'

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

import {
  FOREGROUND_APP_SNAPSHOT_TTL_MS,
  ForegroundAppSnapshotStore,
  isSelfActiveApp
} from './foreground-app-snapshot'

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
  it('serves a snapshot captured before CoreBox opened', async () => {
    let now = 1_000
    const activeApp = createActiveApp()
    const store = new ForegroundAppSnapshotStore({
      queryActiveApp: vi.fn(async () => activeApp),
      isSelfApp: () => false,
      now: () => now
    })

    store.capture()
    await vi.waitFor(() => expect(store.get()).not.toBeNull())

    now += FOREGROUND_APP_SNAPSHOT_TTL_MS - 1
    expect(store.get()?.app).toBe(activeApp)
    expect(store.get()?.capturedAt).toBe(1_000)
  })

  it('drops a snapshot older than the ttl instead of passing off stale context', async () => {
    let now = 1_000
    const store = new ForegroundAppSnapshotStore({
      queryActiveApp: vi.fn(async () => createActiveApp()),
      isSelfApp: () => false,
      now: () => now
    })

    store.capture()
    await vi.waitFor(() => expect(store.get()).not.toBeNull())

    now += FOREGROUND_APP_SNAPSHOT_TTL_MS
    expect(store.get()).toBeNull()
  })

  it('is empty until something captures', () => {
    const store = new ForegroundAppSnapshotStore({
      queryActiveApp: vi.fn(async () => createActiveApp()),
      isSelfApp: () => false,
      now: () => 0
    })

    expect(store.get()).toBeNull()
  })

  it('discards a capture that resolved after CoreBox took focus', async () => {
    const store = new ForegroundAppSnapshotStore({
      queryActiveApp: vi.fn(async () => createActiveApp({ processId: process.pid })),
      isSelfApp: (info) => isSelfActiveApp(info),
      now: () => 1_000
    })

    store.capture()
    await Promise.resolve()
    await Promise.resolve()

    expect(store.get()).toBeNull()
  })

  it('keeps the earlier snapshot when a later capture resolves to Touch', async () => {
    const earlier = createActiveApp()
    const queryActiveApp = vi
      .fn<() => Promise<ActiveAppInfo>>()
      .mockResolvedValueOnce(earlier)
      .mockResolvedValueOnce(createActiveApp({ processId: process.pid }))
    const store = new ForegroundAppSnapshotStore({
      queryActiveApp,
      isSelfApp: (info) => isSelfActiveApp(info),
      now: () => 1_000
    })

    store.capture()
    await vi.waitFor(() => expect(store.get()).not.toBeNull())
    store.capture()
    await vi.waitFor(() => expect(queryActiveApp).toHaveBeenCalledTimes(2))

    expect(store.get()?.app).toBe(earlier)
  })

  it('never lets a failing query reject into the show path', async () => {
    const store = new ForegroundAppSnapshotStore({
      queryActiveApp: vi.fn(async () => {
        throw new Error('automation permission denied')
      }),
      isSelfApp: () => false,
      now: () => 1_000
    })

    expect(() => store.capture()).not.toThrow()
    await Promise.resolve()
    expect(store.get()).toBeNull()
  })
})
