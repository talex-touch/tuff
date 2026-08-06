import type { ActiveAppInfo } from '../../../system/active-app'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { foregroundAppSnapshotStore } from '../../../system/foreground-app-snapshot'
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

vi.mock('../../../storage', () => ({
  getMainConfig: vi.fn(() => ({
    recommendation: {
      contextSources: {
        time: false,
        foregroundApp: false,
        clipboard: false,
        network: false,
        bluetooth: false,
        focus: false,
        power: false,
        location: false
      }
    }
  })),
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
      getBluetoothContext: vi.fn(() => ({
        available: false,
        connectedCount: 0
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
      bluetooth: true,
      location: true
    })

    expect(systemState).toMatchObject({
      isOnline: true,
      networkType: 'unknown',
      isDNDEnabled: false,
      focusMode: 'unknown',
      bluetoothAvailable: false,
      bluetoothConnectedCount: 0,
      unavailableSignals: ['network', 'power', 'focus', 'bluetooth']
    })
  })

  it('keeps cache keys privacy-safe for network, location, and timezone values', () => {
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
        bluetoothAvailable: true,
        bluetoothConnectedCount: 2,
        locationBucket: 'loc_hash_only',
        timezone: 'Asia/Shanghai'
      }
    })

    expect(key).toContain('nid:net_hash_only')
    expect(key).toContain('bat:60')
    expect(key).toContain('bt:2')
    expect(key).toContain('loc:loc_hash_only')
    expect(key).not.toContain('Asia/Shanghai')
    expect(key).not.toContain('Visual Studio Code')
  })
})
