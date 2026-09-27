import type { GitHubRelease, UpdateCheckResult } from '@talex-touch/utils'
import type { ModuleInitContext } from '@talex-touch/utils/types/modules'
import type { PathLike } from 'node:fs'
import { resetQuitIntentForTest, setQuitIntent } from '../../core/quit-intent'
import { TalexEvents } from '../../core/eventbus/touch-event'
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
  type MockLifecycleRecord = Record<string, unknown> & {
    attemptId: string
    revision: number
    phase: string
    error?: unknown
    currentVersion?: string
    targetVersion?: string | null
    releaseTag?: string | null
    taskId?: string | null
    channel?: unknown
    source?: unknown
    installOnNormalQuit?: boolean
    updatedAt?: number
  }
  const lifecyclesById = new Map<string, MockLifecycleRecord>()
  let activeLifecycle: MockLifecycleRecord | null = null
  let latestLifecycle: MockLifecycleRecord | null = null
  const lifecycleRepository = {
    reset: () => {
      lifecyclesById.clear()
      activeLifecycle = null
      latestLifecycle = null
    },
    getActive: vi.fn(async () => activeLifecycle),
    getLatest: vi.fn(async () => latestLifecycle),
    getById: vi.fn(async (attemptId: string) => lifecyclesById.get(attemptId) ?? null),
    getByDownloadTaskId: vi.fn(async (taskId: string) => {
      for (const lifecycle of lifecyclesById.values()) {
        if (lifecycle.taskId === taskId) return lifecycle
      }
      return null
    }),
    listTerminalAttempts: vi.fn(async (): Promise<Record<string, unknown>[]> => []),
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
        lifecyclesById.set(lifecycle.attemptId, lifecycle)
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
        const existing = lifecyclesById.get(input.attemptId)
        if (!existing) {
          throw new Error('Lifecycle attempt not found')
        }
        const now = input.now ?? Date.now()
        const lifecycle = {
          ...existing,
          ...input.patch,
          revision: Number(existing.revision) + 1,
          phase: input.to,
          error: input.to === 'failed' ? (input.patch?.error ?? existing.error) : null,
          updatedAt: now
        }
        lifecyclesById.set(lifecycle.attemptId, lifecycle)
        latestLifecycle = lifecycle
        if (activeLifecycle?.attemptId === lifecycle.attemptId) {
          activeLifecycle = ['idle', 'healthy', 'recovered', 'failed'].includes(input.to)
            ? null
            : lifecycle
        }
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
    listTerminalAttempts = mocks.lifecycleRepository.listTerminalAttempts
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
  },
  // Reads `TUFF_ENABLE_RENDERER_OVERRIDE`; the facade only forwards it to the settings payload.
  isRendererOverrideAvailable: () => false
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

const HOUR_IN_MS = 60 * 60 * 1000

async function checkWithoutForce(service: object): Promise<UpdateCheckResult> {
  const internal = service as { checkForUpdates: (force: boolean) => Promise<UpdateCheckResult> }
  return await internal.checkForUpdates(false)
}

/** The release record a previous run fetched and stored, `fetchedAgoMs` before now. */
function persistPendingRelease(tag: string, fetchedAgoMs: number): void {
  mocks.repository.getLatestRecord.mockResolvedValue({
    id: 1,
    tag,
    channel: AppPreviewChannel.RELEASE,
    name: `Tuff ${tag}`,
    source: 'Nexus Releases',
    publishedAt: null,
    fetchedAt: Date.now() - fetchedAgoMs,
    payload: JSON.stringify(release(tag)),
    status: 'pending',
    snoozeUntil: null,
    lastActionAt: null
  } as never)
}

/** Drives an attempt for `tag` through the lifecycle until it rests at `phase`. */
async function activeAttemptAt(
  tag: string,
  phase: 'downloading' | 'ready'
): Promise<Record<string, unknown>> {
  const created = await mocks.lifecycleRepository.createChecking({
    id: `attempt-${tag}`,
    currentVersion: '1.0.0',
    channel: AppPreviewChannel.RELEASE,
    installOnNormalQuit: true,
    now: 100
  })
  let lifecycle: Record<string, unknown> = created
  for (const [to, patch] of [
    ['available', { targetVersion: tag, releaseTag: tag, source: 'nexus' }],
    ['downloading', { taskId: `task-${tag}` }],
    ['verifying', undefined],
    ['ready', undefined]
  ] as const) {
    lifecycle = await mocks.lifecycleRepository.transition({
      attemptId: created.attemptId,
      to,
      patch
    })
    if (to === phase) break
  }
  return lifecycle
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
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
    mocks.lifecycleRepository.listTerminalAttempts.mockResolvedValue([])
    mocks.updateSystem.downloadUpdate.mockResolvedValue('download-task')
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

  it('ignores a late before-modules-unload event after quit-intent destruction', async () => {
    resetQuitIntentForTest()
    const service = await createService()
    const beforeModulesUnload = mocks.eventBus.on.mock.calls.find(
      ([event]) => event === TalexEvents.BEFORE_MODULES_UNLOAD
    )?.[1]

    if (typeof beforeModulesUnload !== 'function') {
      throw new Error('UpdateService did not register its before-modules-unload listener')
    }

    const intent = setQuitIntent('update-now', 'update-service-regression-test')
    mocks.lifecycleRepository.getActive.mockClear()

    try {
      await service.onDestroy()

      await expect(beforeModulesUnload({ intent })).resolves.toBeUndefined()
      expect(mocks.lifecycleRepository.getActive).not.toHaveBeenCalled()
    } finally {
      resetQuitIntentForTest()
    }
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

  it('restores and fails an active attempt from a different application version', async () => {
    const service = await createService()
    const internal = service as unknown as {
      restoreLifecycleState: () => Promise<void>
    }
    const created = await mocks.lifecycleRepository.createChecking({
      id: 'attempt-stale-version',
      currentVersion: '0.9.0',
      channel: AppPreviewChannel.RELEASE,
      installOnNormalQuit: true,
      now: 100
    })
    await mocks.lifecycleRepository.transition({
      attemptId: created.attemptId,
      to: 'available',
      patch: { targetVersion: '0.9.5', releaseTag: 'v0.9.5' }
    })

    try {
      await internal.restoreLifecycleState()
      const active = await mocks.lifecycleRepository.getActive()
      expect(active).toBeNull()
      const latest = await mocks.lifecycleRepository.getLatest()
      expect(latest).toMatchObject({
        attemptId: 'attempt-stale-version',
        phase: 'failed',
        error: expect.objectContaining({ code: 'UPDATE_ATTEMPT_STALE' })
      })
    } finally {
      await service.onDestroy()
    }
  })

  it('restores and fails an obsolete available attempt whose version is no longer a candidate', async () => {
    const service = await createService()
    const internal = service as unknown as {
      restoreLifecycleState: () => Promise<void>
    }
    const created = await mocks.lifecycleRepository.createChecking({
      id: 'attempt-obsolete-available',
      currentVersion: '1.0.0',
      channel: AppPreviewChannel.RELEASE,
      installOnNormalQuit: true,
      now: 100
    })
    // 1.0.0 is not a candidate for current version 1.0.0
    await mocks.lifecycleRepository.transition({
      attemptId: created.attemptId,
      to: 'available',
      patch: { targetVersion: '1.0.0', releaseTag: 'v1.0.0' }
    })

    try {
      await internal.restoreLifecycleState()
      const active = await mocks.lifecycleRepository.getActive()
      expect(active).toBeNull()
      const latest = await mocks.lifecycleRepository.getLatest()
      expect(latest).toMatchObject({
        attemptId: 'attempt-obsolete-available',
        phase: 'failed',
        error: expect.objectContaining({ code: 'UPDATE_ATTEMPT_OBSOLETE' })
      })
    } finally {
      await service.onDestroy()
    }
  })

  it('automatically supersedes a stale available attempt when marking a newer release available', async () => {
    const service = await createService()
    const internal = service as unknown as {
      markAvailableLifecycle: (
        release: { tag_name: string; source?: string },
        channel: AppPreviewChannel
      ) => Promise<{ attemptId: string; phase: string; releaseTag: string | null }>
    }
    const oldAttempt = await mocks.lifecycleRepository.createChecking({
      id: 'old-available-attempt',
      currentVersion: '1.0.0',
      channel: AppPreviewChannel.RELEASE,
      installOnNormalQuit: true,
      now: 100
    })
    await mocks.lifecycleRepository.transition({
      attemptId: oldAttempt.attemptId,
      to: 'available',
      patch: { targetVersion: '1.0.1', releaseTag: 'v1.0.1' }
    })

    try {
      // Now a newer release arrives: v1.1.0
      const nextAvailable = await internal.markAvailableLifecycle(
        { tag_name: 'v1.1.0', source: 'nexus' },
        AppPreviewChannel.RELEASE
      )

      expect(nextAvailable).toMatchObject({
        phase: 'available',
        releaseTag: 'v1.1.0'
      })
      expect(nextAvailable.attemptId).not.toBe('old-available-attempt')

      // The old attempt must have been superseded to failed
      const oldRecord = await mocks.lifecycleRepository.getById('old-available-attempt')
      expect(oldRecord).toMatchObject({
        phase: 'failed',
        error: expect.objectContaining({ code: 'UPDATE_ATTEMPT_SUPERSEDED' })
      })
    } finally {
      await service.onDestroy()
    }
  })

  it('reports human-readable public error messages without falling back to generic redacted error', async () => {
    const service = await createService()
    const internal = service as unknown as {
      reportUpdateError: (action: string, error: unknown) => string
    }

    try {
      const conflictMsg = internal.reportUpdateError(
        'download',
        new Error('Update lifecycle conflict. Please retry or check for updates.')
      )
      expect(conflictMsg).toBe('Update lifecycle conflict. Please retry or check for updates.')

      const networkMsg = internal.reportUpdateError('check', new Error('Network timeout'))
      expect(networkMsg).toBe('Network timeout')
    } finally {
      await service.onDestroy()
    }
  })

  describe('automatic download from a cached check result', () => {
    it.each([
      { path: 'a persisted result inside the cache TTL', fetchedAgoMs: 0, lastCheckedAgoMs: null },
      {
        path: 'a restart inside the check-frequency window',
        fetchedAgoMs: 2 * HOUR_IN_MS,
        lastCheckedAgoMs: HOUR_IN_MS
      }
    ])('starts the download for $path', async ({ fetchedAgoMs, lastCheckedAgoMs }) => {
      if (lastCheckedAgoMs !== null) {
        mocks.fs.existsSync.mockImplementation((file) =>
          String(file).endsWith('update-settings.json')
        )
        mocks.fs.readFileSync.mockReturnValue(
          JSON.stringify({ lastCheckedAt: Date.now() - lastCheckedAgoMs })
        )
      }
      persistPendingRelease('v1.1.0', fetchedAgoMs)
      mocks.updateSystem.downloadUpdate.mockResolvedValue({
        taskId: 'auto-task',
        rollbackFromVersion: '1.0.0',
        rollbackCompatible: false
      } as never)
      const service = await createService()

      try {
        await expect(checkWithoutForce(service)).resolves.toMatchObject({
          hasUpdate: true,
          release: { tag_name: 'v1.1.0' }
        })
        await vi.waitFor(() =>
          expect(mocks.lifecycleRepository.getActive()).resolves.toMatchObject({
            phase: 'downloading',
            releaseTag: 'v1.1.0',
            taskId: 'auto-task'
          })
        )
        expect(mocks.updateSystem.downloadUpdate).toHaveBeenCalledOnce()
        expect(mocks.updateSystem.downloadUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ tag_name: 'v1.1.0' })
        )
        expect(mocks.request).not.toHaveBeenCalled()
      } finally {
        await service.onDestroy()
      }
    })

    it('leaves the update at available when automatic download is off', async () => {
      persistPendingRelease('v1.1.0', 0)
      const service = await createService()

      try {
        await invoke(UpdateEvents.updateSettings, { settings: { autoDownload: false } })
        await expect(checkWithoutForce(service)).resolves.toMatchObject({ hasUpdate: true })
        await settle()

        await expect(mocks.lifecycleRepository.getActive()).resolves.toMatchObject({
          phase: 'available',
          releaseTag: 'v1.1.0'
        })
        expect(mocks.updateSystem.downloadUpdate).not.toHaveBeenCalled()
      } finally {
        await service.onDestroy()
      }
    })

    it.each([
      { active: 'another release is already downloading', tag: 'v1.0.5', phase: 'downloading' },
      { active: 'the cached release is already ready', tag: 'v1.1.0', phase: 'ready' }
    ] as const)('does not start a download when $active', async ({ tag, phase }) => {
      persistPendingRelease('v1.1.0', 0)
      const service = await createService()
      const active = await activeAttemptAt(tag, phase)

      try {
        await expect(checkWithoutForce(service)).resolves.toMatchObject({ hasUpdate: true })
        await settle()

        await expect(mocks.lifecycleRepository.getActive()).resolves.toEqual(active)
        expect(mocks.updateSystem.downloadUpdate).not.toHaveBeenCalled()
      } finally {
        await service.onDestroy()
      }
    })
  })

  describe('update history', () => {
    function finishedAttempt(
      attemptId: string,
      phase: 'healthy' | 'recovered' | 'failed',
      targetVersion: string,
      updatedAt: number
    ): Record<string, unknown> {
      return {
        attemptId,
        revision: 8,
        phase,
        currentVersion: '1.0.0',
        targetVersion,
        source: 'nexus',
        channel: AppPreviewChannel.RELEASE,
        releaseTag: targetVersion,
        taskId: `task-${attemptId}`,
        installMode: null,
        installOnNormalQuit: true,
        rollbackCompatible: false,
        rollbackFromVersion: null,
        previousVersion: null,
        recoveryAvailable: false,
        lastCheckAt: null,
        error: null,
        createdAt: updatedAt - 10,
        updatedAt
      }
    }

    it('answers with the finished attempts projected into history rows', async () => {
      mocks.lifecycleRepository.listTerminalAttempts.mockResolvedValue([
        finishedAttempt('updated', 'healthy', 'v1.1.0', 300),
        finishedAttempt('rolled-back', 'recovered', 'v1.0.9', 200)
      ])
      const service = await createService()

      try {
        await expect(invoke(UpdateEvents.getHistory, { limit: 1 })).resolves.toEqual({
          success: true,
          data: [
            {
              attemptId: 'updated',
              fromVersion: '1.0.0',
              toVersion: 'v1.1.0',
              channel: AppPreviewChannel.RELEASE,
              outcome: 'updated',
              finishedAt: 300,
              error: null
            }
          ]
        })
      } finally {
        await service.onDestroy()
      }
    })

    it('reports an unreadable history as a failure rather than an empty one', async () => {
      mocks.lifecycleRepository.listTerminalAttempts.mockRejectedValue(
        new Error('database is locked')
      )
      const service = await createService()

      try {
        await expect(invoke(UpdateEvents.getHistory)).resolves.toEqual({
          success: false,
          error: 'database is locked'
        })
        expect(mocks.logger.warn).toHaveBeenCalledWith('Failed to load update history', {
          error: expect.any(Error)
        })
      } finally {
        await service.onDestroy()
      }
    })
  })
})
