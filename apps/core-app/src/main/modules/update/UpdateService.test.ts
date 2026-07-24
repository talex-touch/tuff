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
      writeFile: vi.fn<(file: PathLike, contents: string) => Promise<void>>(async () => {})
    }
  }
  const lifecycleRows = { limit: vi.fn(async () => []) }
  const lifecycleDb = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => lifecycleRows),
          limit: lifecycleRows.limit
        })),
        orderBy: vi.fn(() => lifecycleRows)
      }))
    }))
  }
  let activeLifecycle: Record<string, unknown> | null = null
  let latestLifecycle: Record<string, unknown> | null = null
  const lifecycleRepository = {
    reset: () => {
      activeLifecycle = null
      latestLifecycle = null
    },
    getActive: vi.fn(async () => activeLifecycle),
    getLatest: vi.fn(async () => latestLifecycle),
    getById: vi.fn(async (attemptId: string) =>
      latestLifecycle?.attemptId === attemptId ? latestLifecycle : null
    ),
    getByDownloadTaskId: vi.fn(async (taskId: string) => {
      const lifecycle = activeLifecycle ?? latestLifecycle
      return lifecycle?.taskId === taskId ? lifecycle : null
    }),
    createChecking: vi.fn(
      async (input: {
        id: string
        currentVersion: string
        channel: unknown
        installOnNormalQuit: boolean
        now?: number
      }) => {
        const now = input.now ?? Date.now()
        const lifecycle = {
          attemptId: input.id,
          revision: 0,
          phase: 'checking',
          currentVersion: input.currentVersion,
          targetVersion: null,
          source: null,
          channel: input.channel,
          releaseTag: null,
          taskId: null,
          installMode: null,
          installOnNormalQuit: input.installOnNormalQuit,
          previousVersion: null,
          recoveryAvailable: false,
          lastCheckAt: null,
          error: null,
          createdAt: now,
          updatedAt: now
        }
        activeLifecycle = lifecycle
        latestLifecycle = lifecycle
        return lifecycle
      }
    ),
    transition: vi.fn(
      async (input: {
        attemptId: string
        to: string
        patch?: Record<string, unknown>
        now?: number
      }) => {
        if (!latestLifecycle || latestLifecycle.attemptId !== input.attemptId) {
          throw new Error('Lifecycle attempt not found')
        }
        const now = input.now ?? Date.now()
        const lifecycle = {
          ...latestLifecycle,
          ...input.patch,
          revision: Number(latestLifecycle.revision) + 1,
          phase: input.to,
          error: input.to === 'failed' ? (input.patch?.error ?? latestLifecycle.error) : null,
          updatedAt: now
        }
        latestLifecycle = lifecycle
        activeLifecycle = ['idle', 'healthy', 'recovered', 'failed'].includes(input.to)
          ? null
          : lifecycle
        return lifecycle
      }
    )
  }

  return {
    lifecycleDb,
    lifecycleRepository,
    handlers,
    startupListeners,
    transport,
    fs,
    app: {
      isPackaged: true,
      getVersion: vi.fn(() => '1.0.0'),
      getAppPath: vi.fn(() => '/tmp/update-service-contracts/app'),
      getPath: vi.fn(() => '/tmp/update-service-contracts/tuff'),
      quit: vi.fn()
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
      on: vi.fn(),
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

vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  PollingService: {
    getInstance: vi.fn(() => mocks.polling)
  }
}))

vi.mock('../../core/eventbus/touch-event', () => ({
  TalexEvents: {
    ALL_MODULES_LOADED: 'all-modules-loaded',
    BEFORE_MODULES_UNLOAD: 'before-modules-unload',
    WILL_QUIT: 'will-quit',
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
  databaseModule: { getDb: vi.fn(() => mocks.lifecycleDb) }
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

vi.mock('./update-attempt-repository', () => ({
  UpdateAttemptRepository: class UpdateAttemptRepository {
    getActive = mocks.lifecycleRepository.getActive
    getLatest = mocks.lifecycleRepository.getLatest
    getById = mocks.lifecycleRepository.getById
    getByDownloadTaskId = mocks.lifecycleRepository.getByDownloadTaskId
    createChecking = mocks.lifecycleRepository.createChecking
    transition = mocks.lifecycleRepository.transition
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
    mocks.lifecycleRepository.reset()
    mocks.handlers.clear()
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

  it.each([
    [
      'prefers the new true setting over a legacy false value',
      {
        installOnNormalQuit: true,
        autoInstallDownloadedUpdates: false,
        pendingInstallVersion: 'v2.5.0'
      },
      true
    ],
    [
      'prefers the new false setting over a legacy true value',
      {
        installOnNormalQuit: false,
        autoInstallDownloadedUpdates: true,
        pendingInstallVersion: 'v2.5.0'
      },
      false
    ],
    [
      'migrates a legacy true setting when the new key is absent',
      { autoInstallDownloadedUpdates: true, pendingInstallVersion: 'v2.5.0' },
      true
    ],
    [
      'migrates a legacy false setting when the new key is absent',
      { autoInstallDownloadedUpdates: false, pendingInstallVersion: 'v2.5.0' },
      false
    ]
  ])('%s', async (_name, persisted, expectedInstallOnNormalQuit) => {
    vi.useFakeTimers()
    mocks.fs.existsSync.mockReturnValue(true)
    mocks.fs.readFileSync.mockReturnValue(JSON.stringify(persisted))
    const service = await createService()

    try {
      const response = (await invoke(UpdateEvents.getSettings)) as {
        success: boolean
        data: Record<string, unknown>
      }

      expect(response).toMatchObject({
        success: true,
        data: { installOnNormalQuit: expectedInstallOnNormalQuit }
      })
      expect(response.data).not.toHaveProperty('autoInstallDownloadedUpdates')
      expect(response.data).not.toHaveProperty('pendingInstallVersion')

      await vi.advanceTimersByTimeAsync(300)
      const writtenSettings = JSON.parse(
        String(mocks.fs.promises.writeFile.mock.calls.at(-1)?.[1])
      ) as Record<string, unknown>

      expect(writtenSettings).toMatchObject({ installOnNormalQuit: expectedInstallOnNormalQuit })
      expect(writtenSettings).not.toHaveProperty('autoInstallDownloadedUpdates')
      expect(writtenSettings).not.toHaveProperty('pendingInstallVersion')
    } finally {
      await service.onDestroy()
    }
  })
  it('re-publishes a restored ready lifecycle and shows its notification once per process', async () => {
    const service = await createService()
    const showUpdateReadyNotification = vi.fn(() => true)
    const internal = service as unknown as {
      updateNotificationService: {
        showUpdateReadyNotification: typeof showUpdateReadyNotification
      }
      restoreLifecycleState: () => Promise<void>
    }
    internal.updateNotificationService = { showUpdateReadyNotification }
    const created = await mocks.lifecycleRepository.createChecking({
      id: 'attempt-ready',
      currentVersion: '1.0.0',
      channel: AppPreviewChannel.RELEASE,
      installOnNormalQuit: true,
      now: 100
    })
    for (const [to, patch] of [
      ['available', { targetVersion: '1.1.0', releaseTag: 'v1.1.0', source: 'nexus' }],
      ['downloading', { taskId: 'task-ready' }],
      ['verifying', undefined],
      ['ready', undefined]
    ] as const) {
      await mocks.lifecycleRepository.transition({
        attemptId: created.attemptId,
        to,
        patch
      })
    }

    try {
      await internal.restoreLifecycleState()
      await internal.restoreLifecycleState()

      expect(mocks.transport.broadcast).toHaveBeenCalledWith(
        UpdateEvents.lifecycleChanged,
        expect.objectContaining({ phase: 'ready', taskId: 'task-ready' })
      )
      expect(showUpdateReadyNotification).toHaveBeenCalledOnce()
    } finally {
      await service.onDestroy()
    }
  })
})
