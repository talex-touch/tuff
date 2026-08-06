import type { ActiveAppInfo } from '../../../system/active-app'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { foregroundAppSnapshotStore } from '../../../system/foreground-app-snapshot'
import { selectionSnapshotStore } from '../../../system/selection-snapshot-store'
import { ContextProvider } from './context-provider'

const getActiveAppMock = vi.hoisted(() => vi.fn())

vi.mock('../../../system/active-app', () => ({
  activeAppService: {
    getActiveApp: getActiveAppMock
  }
}))

vi.mock('../../../../utils/logger', () => ({
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

const storageMock = vi.hoisted(() => ({
  configs: new Map<string, Record<string, unknown>>(),
  contextSources: {
    time: false,
    foregroundApp: false,
    clipboard: false,
    selection: false,
    network: false,
    focus: false,
    power: false,
    location: false
  } as Record<string, boolean>
}))

vi.mock('../../../storage', () => ({
  getMainConfig: vi.fn(() => ({
    recommendation: {
      contextSources: storageMock.contextSources
    }
  })),
  getConfig: vi.fn((name: string) => storageMock.configs.get(name) ?? {}),
  saveConfig: vi.fn((name: string, payload: string) => {
    storageMock.configs.set(name, JSON.parse(payload))
    return { success: true, version: 1 }
  }),
  isMainStorageReady: vi.fn(() => true)
}))

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

function readForegroundAppContext(
  provider: ContextProvider
): Promise<{ bundleId: string; name: string } | undefined> {
  return (
    provider as unknown as {
      getForegroundAppContext: () => Promise<{ bundleId: string; name: string } | undefined>
    }
  ).getForegroundAppContext()
}

describe('ContextProvider foreground app', () => {
  afterEach(() => {
    foregroundAppSnapshotStore.clear()
    getActiveAppMock.mockReset()
  })

  it('prefers the snapshot taken before CoreBox stole focus', async () => {
    getActiveAppMock.mockResolvedValue(createActiveApp())
    foregroundAppSnapshotStore.capture()
    await vi.waitFor(() => expect(foregroundAppSnapshotStore.get()).not.toBeNull())
    getActiveAppMock.mockResolvedValue(createActiveApp({ processId: process.pid }))

    expect(await readForegroundAppContext(new ContextProvider())).toEqual({
      bundleId: 'com.microsoft.VSCode',
      name: 'Visual Studio Code'
    })
    expect(getActiveAppMock).toHaveBeenCalledTimes(1)
  })

  it('queries live when no snapshot was taken', async () => {
    getActiveAppMock.mockResolvedValue(createActiveApp())

    expect(await readForegroundAppContext(new ContextProvider())).toEqual({
      bundleId: 'com.microsoft.VSCode',
      name: 'Visual Studio Code'
    })
    expect(getActiveAppMock).toHaveBeenCalledTimes(1)
  })

  it('reports no foreground app when the answer is Touch itself', async () => {
    getActiveAppMock.mockResolvedValue(
      createActiveApp({
        identifier: 'Touch',
        displayName: 'Touch',
        bundleId: 'com.tagzxia.app.tuff',
        processId: process.pid
      })
    )

    expect(await readForegroundAppContext(new ContextProvider())).toBeUndefined()
  })
})

describe('ContextProvider', () => {
  it('honors disabled recommendation context sources', async () => {
    const provider = new ContextProvider()

    Object.assign(provider as unknown as Record<string, unknown>, {
      getClipboardContext: vi.fn(async () => ({
        type: 'text',
        content: 'secret',
        timestamp: Date.now()
      })),
      getForegroundAppContext: vi.fn(async () => ({
        bundleId: 'com.microsoft.VSCode',
        name: 'Visual Studio Code'
      })),
      getSystemContext: vi.fn(async () => undefined)
    })

    const context = await provider.getCurrentContext()

    expect(context.time).toEqual({
      hourOfDay: 12,
      dayOfWeek: 1,
      isWorkingHours: true,
      timeSlot: 'afternoon'
    })
    expect(context.clipboard).toBeUndefined()
    expect(context.foregroundApp).toBeUndefined()
    expect(context.systemState).toBeUndefined()
  })

  it('marks unavailable system signals without blocking context generation', async () => {
    const provider = new ContextProvider()

    Object.assign(provider as unknown as Record<string, unknown>, {
      getNetworkContext: vi.fn(() => ({
        available: false,
        isOnline: true,
        networkType: 'unknown'
      })),
      getPowerContext: vi.fn(async () => null),
      getFocusContext: vi.fn(async () => ({
        available: false,
        isDNDEnabled: false,
        focusMode: 'unknown'
      })),
      getNetworkBucketForLocation: vi.fn(() => 'hashed-network-bucket')
    })

    const systemState = await (
      provider as unknown as {
        getSystemContext: (sources: Record<string, boolean>) => Promise<unknown>
      }
    ).getSystemContext({
      network: true,
      power: true,
      focus: true,
      location: true
    })

    expect(systemState).toMatchObject({
      isOnline: true,
      networkType: 'unknown',
      isDNDEnabled: false,
      focusMode: 'unknown',
      unavailableSignals: ['network', 'power', 'focus']
    })
  })

  it('keeps only slow-moving, privacy-safe context in the cache key', () => {
    const provider = new ContextProvider()
    const key = provider.generateCacheKey({
      time: {
        hourOfDay: 9,
        dayOfWeek: 1,
        isWorkingHours: true,
        timeSlot: 'morning'
      },
      clipboard: {
        type: 'text',
        content: 'hashed_clipboard_only',
        timestamp: 1,
        contentType: 'text'
      },
      foregroundApp: {
        bundleId: 'com.microsoft.VSCode',
        name: 'Visual Studio Code'
      },
      systemState: {
        isOnline: true,
        networkType: 'wifi',
        networkIdHash: 'net_hash_only',
        batteryLevel: 67,
        powerMode: 'battery',
        isDNDEnabled: true,
        locationBucket: 'loc_hash_only',
        timezone: 'Asia/Shanghai'
      }
    })

    expect(key).toBe('morning|workday|net:1')
    // Volatile context must NOT key the cache — it is re-applied per request.
    expect(key).not.toContain('hashed_clipboard_only')
    expect(key).not.toContain('net_hash_only')
    expect(key).not.toContain('bat:')
    expect(key).not.toContain('loc_hash_only')
    expect(key).not.toContain('Asia/Shanghai')
    expect(key).not.toContain('Visual Studio Code')
  })

  it('collapses weekdays into a workday/weekend bucket', () => {
    const provider = new ContextProvider()
    const keyFor = (dayOfWeek: number): string =>
      provider.generateCacheKey({
        time: { hourOfDay: 9, dayOfWeek, isWorkingHours: true, timeSlot: 'morning' }
      })

    expect(keyFor(1)).toBe(keyFor(4))
    expect(keyFor(0)).toBe(keyFor(6))
    expect(keyFor(1)).not.toBe(keyFor(6))
  })
})

describe('ContextProvider selection ingestion', () => {
  afterEach(() => {
    selectionSnapshotStore.clear()
    storageMock.contextSources.selection = false
  })

  const readSelection = (provider: ContextProvider) =>
    (
      provider as unknown as {
        getSelectionContext: () => Promise<{ content: string; contentType?: string } | undefined>
      }
    ).getSelectionContext()

  it('hashes the captured selection instead of carrying the text', async () => {
    selectionSnapshotStore.set({ text: 'https://example.com/secret', capturedAt: Date.now() })

    const selection = await readSelection(new ContextProvider())

    expect(selection?.contentType).toBe('url')
    expect(selection?.content).not.toContain('secret')
    expect(selection?.content).toHaveLength(16)
  })

  it('ignores selections older than the freshness window', async () => {
    selectionSnapshotStore.set({ text: 'stale selection', capturedAt: Date.now() - 60_000 })

    expect(await readSelection(new ContextProvider())).toBeUndefined()
  })

  it('drops the selection signal entirely when the setting is off', async () => {
    selectionSnapshotStore.set({ text: 'fresh selection', capturedAt: Date.now() })
    const provider = new ContextProvider()
    Object.assign(provider as unknown as Record<string, unknown>, {
      getSystemContext: vi.fn(async () => undefined)
    })

    expect((await provider.getCurrentContext()).selection).toBeUndefined()

    storageMock.contextSources.selection = true
    expect((await provider.getCurrentContext()).selection).toBeDefined()
  })
})

describe('ContextProvider timezone change', () => {
  // Cleared before, not after: any earlier test that resolves a location
  // context persists the real system timezone into the same config.
  beforeEach(() => {
    storageMock.configs.clear()
  })

  const resolveTimezoneChanged = (provider: ContextProvider, timezone: string) =>
    (
      provider as unknown as {
        resolveTimezoneChanged: (timezone: string) => Promise<boolean>
      }
    ).resolveTimezoneChanged(timezone)

  it('does not claim a trip on the first run, then flags a real change', async () => {
    const provider = new ContextProvider()

    expect(await resolveTimezoneChanged(provider, 'Asia/Shanghai')).toBe(false)
    expect(await resolveTimezoneChanged(provider, 'Asia/Shanghai')).toBe(false)
    expect(await resolveTimezoneChanged(provider, 'Europe/Berlin')).toBe(true)
    // Still within the 48h window on the following reads.
    expect(await resolveTimezoneChanged(provider, 'Europe/Berlin')).toBe(true)
  })

  it('lets the flag expire once the change window has passed', async () => {
    const provider = new ContextProvider()
    await resolveTimezoneChanged(provider, 'Asia/Shanghai')
    await resolveTimezoneChanged(provider, 'Europe/Berlin')

    const stored = storageMock.configs.get('recommendation-runtime')!
    stored.timezoneChangedAt = Date.now() - 49 * 60 * 60 * 1000

    expect(await resolveTimezoneChanged(provider, 'Europe/Berlin')).toBe(false)
  })
})
