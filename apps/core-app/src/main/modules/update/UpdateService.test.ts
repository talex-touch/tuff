import type { GitHubRelease } from '@talex-touch/utils'
import type { ModuleInitContext } from '@talex-touch/utils/types/modules'
import type { PathLike } from 'node:fs'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppPreviewChannel, UpdateProviderType } from '@talex-touch/utils'
import { UpdateEvents } from '@talex-touch/utils/transport/events'

type UpdateHandler = (payload?: unknown) => unknown | Promise<unknown>
const originalResourcesPathDescriptor = Object.getOwnPropertyDescriptor(process, 'resourcesPath')

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, UpdateHandler>()
  const macListeners = new Map<string, Set<(value: unknown) => void>>()
  const startupListeners = new Map<string, () => void>()

  const transport = {
    on: vi.fn((event, handler: UpdateHandler) => {
      const name = event.toEventName()
      handlers.set(name, handler)
      return vi.fn(() => handlers.delete(name))
    }),
    broadcast: vi.fn()
  }

  const fs = {
    existsSync: vi.fn<(file: PathLike) => boolean>(() => false),
    readFileSync: vi.fn(),
    promises: {
      mkdir: vi.fn(async () => {}),
      readFile: vi.fn(async () => ''),
      stat: vi.fn(async () => ({ isFile: () => true })),
      writeFile: vi.fn(async () => {})
    }
  }

  return {
    handlers,
    macListeners,
    startupListeners,
    transport,
    fs,
    app: {
      isPackaged: true,
      getVersion: vi.fn(() => '1.0.0')
    },
    autoUpdater: {
      autoDownload: false,
      autoInstallOnAppQuit: false,
      allowPrerelease: false,
      on: vi.fn((event: string, listener: (value: unknown) => void) => {
        const listeners = macListeners.get(event) ?? new Set()
        listeners.add(listener)
        macListeners.set(event, listeners)
      }),
      removeListener: vi.fn((event: string, listener: (value: unknown) => void) => {
        macListeners.get(event)?.delete(listener)
      }),
      checkForUpdates: vi.fn(async () => {}),
      downloadUpdate: vi.fn(async () => {}),
      quitAndInstall: vi.fn()
    },
    polling: {
      unregister: vi.fn(),
      isRegistered: vi.fn(() => false),
      register: vi.fn(),
      start: vi.fn()
    },
    request: vi.fn(),
    repository: {
      getLatestRecord: vi.fn(async () => null),
      getRecordByTag: vi.fn(async () => null),
      saveRelease: vi.fn(async () => {}),
      markStatus: vi.fn(async () => {}),
      clearAllRecords: vi.fn(async () => {})
    },
    updateSystem: {
      downloadUpdate: vi.fn(async () => 'download-task'),
      installUpdate: vi.fn(async () => {}),
      ignoreVersion: vi.fn(),
      setAutoDownload: vi.fn(),
      setAutoCheck: vi.fn(),
      setCheckFrequency: vi.fn(),
      updateConfig: vi.fn(),
      scheduleRendererOverride: vi.fn(async () => {}),
      disableRendererOverride: vi.fn(async () => {})
    },
    eventBus: {
      once: vi.fn((event: string, listener: () => void) => {
        startupListeners.set(event, listener)
      }),
      off: vi.fn((event: string, listener: () => void) => {
        if (startupListeners.get(event) === listener) {
          startupListeners.delete(event)
        }
      })
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      success: vi.fn()
    }
  }
})

vi.mock('node:fs', () => ({
  default: mocks.fs,
  ...mocks.fs
}))

vi.mock('electron', () => ({
  app: mocks.app,
  Notification: class Notification {
    on = vi.fn()
    show = vi.fn()
  }
}))

vi.mock('electron-updater', () => ({
  autoUpdater: mocks.autoUpdater
}))

vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  PollingService: {
    getInstance: vi.fn(() => mocks.polling)
  }
}))

vi.mock('../../core/eventbus/touch-event', () => ({
  TalexEvents: {
    ALL_MODULES_LOADED: 'all-modules-loaded',
    UPDATE_AVAILABLE: 'update-available'
  },
  touchEventBus: mocks.eventBus,
  UpdateAvailableEvent: class UpdateAvailableEvent {
    constructor(
      readonly tag: string,
      readonly channel: AppPreviewChannel
    ) {}
  }
}))

vi.mock('../../core/runtime-accessor', () => ({
  resolveMainRuntime: vi.fn(() => ({ transport: mocks.transport }))
}))

vi.mock('../../utils/logger', () => ({
  createLogger: vi.fn(() => mocks.logger)
}))

vi.mock('../../utils/version-util', () => ({
  getAppVersionSafe: vi.fn(() => '1.0.0')
}))

vi.mock('../analytics/message-store', () => ({
  getAnalyticsMessageStore: vi.fn(() => ({ add: vi.fn() }))
}))

vi.mock('../sentry', () => ({
  getSentryService: vi.fn(() => ({ isTelemetryEnabled: () => false }))
}))

vi.mock('../database', () => ({
  databaseModule: { getDb: vi.fn(() => ({})) }
}))

vi.mock('../network', () => ({
  getNetworkService: vi.fn(() => ({ request: mocks.request }))
}))

vi.mock('./update-repository', () => ({
  UpdateRecordStatus: {
    PENDING: 'pending',
    SKIPPED: 'skipped',
    SNOOZED: 'snoozed',
    ACKNOWLEDGED: 'acknowledged'
  },
  UpdateRepository: class UpdateRepository {
    getLatestRecord = mocks.repository.getLatestRecord
    getRecordByTag = mocks.repository.getRecordByTag
    saveRelease = mocks.repository.saveRelease
    markStatus = mocks.repository.markStatus
    clearAllRecords = mocks.repository.clearAllRecords
  }
}))

vi.mock('./update-system', () => ({
  UpdateSystem: class UpdateSystem {
    downloadUpdate = mocks.updateSystem.downloadUpdate
    installUpdate = mocks.updateSystem.installUpdate
    ignoreVersion = mocks.updateSystem.ignoreVersion
    setAutoDownload = mocks.updateSystem.setAutoDownload
    setAutoCheck = mocks.updateSystem.setAutoCheck
    setCheckFrequency = mocks.updateSystem.setCheckFrequency
    updateConfig = mocks.updateSystem.updateConfig
    scheduleRendererOverride = mocks.updateSystem.scheduleRendererOverride
    disableRendererOverride = mocks.updateSystem.disableRendererOverride
  }
}))

function release(tag_name = 'v1.1.0'): GitHubRelease {
  return {
    tag_name,
    name: `Tuff ${tag_name}`,
    published_at: '2026-07-12T00:00:00.000Z',
    body: '',
    assets: []
  } as GitHubRelease
}

async function createService() {
  const { UpdateServiceModule } = await import('./UpdateService')
  const service = new UpdateServiceModule()
  await service.onInit({
    app: { rootPath: '/tmp/update-service-contracts' },
    manager: {
      getModule: vi.fn(() => ({ getNotificationService: vi.fn() }))
    }
  } as unknown as ModuleInitContext<TalexEvents>)
  return service
}

async function invoke(event: (typeof UpdateEvents)[keyof typeof UpdateEvents], payload?: unknown) {
  const handler = mocks.handlers.get(event.toEventName())
  if (!handler) {
    throw new Error(`Update handler was not registered: ${event.toEventName()}`)
  }
  return await handler(payload)
}

async function useGitHubSource(): Promise<void> {
  await invoke(UpdateEvents.updateSettings, {
    settings: {
      source: {
        type: UpdateProviderType.GITHUB,
        name: 'GitHub Releases',
        url: 'https://github.example/TalexTouch/TalexTouch',
        enabled: true,
        priority: 1
      },
      enabled: true,
      frequency: 'everyday',
      cacheEnabled: true,
      cacheTTL: 30,
      maxRetries: 1
    }
  })
}

describe('UpdateServiceModule facade', () => {
  beforeEach(() => {
    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      value: '/tmp/electron-resources'
    })
    vi.clearAllMocks()
    mocks.handlers.clear()
    mocks.macListeners.clear()
    mocks.startupListeners.clear()
    mocks.fs.existsSync.mockImplementation(() => false)
    mocks.request.mockReset()
    mocks.repository.getLatestRecord.mockResolvedValue(null)
    mocks.repository.getRecordByTag.mockResolvedValue(null)
    mocks.app.isPackaged = true
  })

  afterEach(() => {
    if (originalResourcesPathDescriptor) {
      Object.defineProperty(process, 'resourcesPath', originalResourcesPathDescriptor)
    } else {
      Reflect.deleteProperty(process, 'resourcesPath')
    }
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('coalesces renderer quick checks into one background release request', async () => {
    const requestStarted = Promise.withResolvers<void>()
    const networkResponse = Promise.withResolvers<unknown>()
    mocks.request.mockImplementation(() => {
      requestStarted.resolve()
      return networkResponse.promise
    })
    const service = await createService()

    try {
      await useGitHubSource()
      const first = invoke(UpdateEvents.check, { force: false })
      const second = invoke(UpdateEvents.check, { force: false })
      await requestStarted.promise

      expect(await first).toMatchObject({ success: true, data: { hasUpdate: false } })
      expect(await second).toMatchObject({ success: true, data: { hasUpdate: false } })
      expect(mocks.request).toHaveBeenCalledTimes(1)

      networkResponse.resolve({ status: 200, data: [release()], headers: {} })
      await Promise.resolve()
      await Promise.resolve()
    } finally {
      await service.onDestroy()
    }
  })

  it('revalidates a cached GitHub release with its ETag and serves it during rate-limit cooldown', async () => {
    mocks.request
      .mockResolvedValueOnce({
        status: 200,
        data: [release()],
        headers: { etag: '"release-etag"' }
      })
      .mockResolvedValueOnce({ status: 304, data: [], headers: {} })
      .mockResolvedValueOnce({
        status: 429,
        data: [],
        headers: {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(Math.ceil(Date.now() / 1000) + 60)
        }
      })
    const service = await createService()

    try {
      await useGitHubSource()
      const first = await invoke(UpdateEvents.check, { force: true })
      const revalidated = await invoke(UpdateEvents.check, { force: true })
      const rateLimited = await invoke(UpdateEvents.check, { force: true })
      const cooledDown = await invoke(UpdateEvents.check, { force: true })

      expect(first).toMatchObject({
        success: true,
        data: { hasUpdate: true, release: { tag_name: 'v1.1.0' } }
      })
      expect(revalidated).toMatchObject({
        success: true,
        data: { hasUpdate: true, release: { tag_name: 'v1.1.0' } }
      })
      expect(mocks.request.mock.calls[1]?.[0]).toMatchObject({
        headers: { 'If-None-Match': '"release-etag"' }
      })
      expect(rateLimited).toMatchObject({
        success: true,
        data: { hasUpdate: true, release: { tag_name: 'v1.1.0' } }
      })
      expect(cooledDown).toMatchObject({
        success: true,
        data: { hasUpdate: true, release: { tag_name: 'v1.1.0' } }
      })
      expect(mocks.request).toHaveBeenCalledTimes(3)
    } finally {
      await service.onDestroy()
    }
  })

  it('persists ignore and remind actions through the facade', async () => {
    const service = await createService()

    try {
      const ignored = await invoke(UpdateEvents.recordAction, { tag: 'v1.1.0', action: 'skip' })
      const reminded = await invoke(UpdateEvents.recordAction, {
        tag: 'v1.2.0',
        action: 'remind-later'
      })

      const acknowledged = await invoke(UpdateEvents.recordAction, {
        tag: 'v1.3.0',
        action: 'update-now'
      })
      expect(ignored).toEqual({ success: true })
      expect(reminded).toEqual({ success: true })
      expect(acknowledged).toEqual({ success: true })
      expect(mocks.repository.markStatus).toHaveBeenNthCalledWith(1, 'v1.1.0', 'skipped')
      expect(mocks.updateSystem.ignoreVersion).toHaveBeenCalledWith('v1.1.0')
      expect(mocks.repository.markStatus).toHaveBeenNthCalledWith(
        2,
        'v1.2.0',
        'snoozed',
        expect.objectContaining({ snoozeUntil: expect.any(Number) })
      )
      expect(mocks.repository.markStatus).toHaveBeenNthCalledWith(3, 'v1.3.0', 'acknowledged')
    } finally {
      await service.onDestroy()
    }
  })

  it('removes macOS updater callbacks and cancels the startup check when destroyed', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
    vi.useFakeTimers()
    mocks.fs.existsSync.mockImplementation((file) => String(file).endsWith('app-update.yml'))
    const service = await createService()

    await invoke(UpdateEvents.updateSettings, {
      settings: { enabled: true, frequency: 'everyday' }
    })
    const startup = mocks.startupListeners.get('all-modules-loaded')
    startup?.()
    await vi.advanceTimersByTimeAsync(0)

    await service.onDestroy()
    await vi.advanceTimersByTimeAsync(5000)

    expect(mocks.macListeners.get('update-downloaded')?.size ?? 0).toBe(0)
    expect(mocks.macListeners.get('error')?.size ?? 0).toBe(0)
    expect(mocks.request).not.toHaveBeenCalled()
  })
})
