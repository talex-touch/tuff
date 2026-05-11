import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DownloadModule, DownloadPriority, DownloadStatus } from '@talex-touch/utils'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { UpdateSystem } from './update-system'

const { shellOpenPathMock, spawnMock, unrefMock, appQuitMock, appExitMock } = vi.hoisted(() => {
  const unrefMock = vi.fn()
  return {
    shellOpenPathMock: vi.fn(),
    spawnMock: vi.fn(() => ({ unref: unrefMock })),
    appQuitMock: vi.fn(),
    appExitMock: vi.fn(),
    unrefMock
  }
})

vi.mock('node:child_process', () => ({
  spawn: spawnMock
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/tuff-test'),
    getVersion: vi.fn(() => '2.4.9'),
    isPackaged: true,
    quit: appQuitMock,
    exit: appExitMock
  },
  shell: {
    openPath: shellOpenPathMock
  }
}))

vi.mock('../../utils/release-signature', () => ({
  SignatureVerifier: class SignatureVerifier {
    verifyFileSignature = vi.fn(async () => ({ valid: true }))
  }
}))

vi.mock('../analytics/message-store', () => ({
  getAnalyticsMessageStore: () => ({
    add: vi.fn()
  })
}))

vi.mock('../database', () => ({
  databaseModule: {
    getDb: vi.fn()
  }
}))

vi.mock('../network', () => ({
  getNetworkService: () => ({
    request: vi.fn()
  })
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    promises: {
      ...actual.promises,
      stat: vi.fn(async () => ({ isFile: () => true }))
    }
  }
})

function createDownloadCenterMock() {
  const task = {
    id: 'task-1',
    url: 'https://example.test/Tuff-2.4.10.zip',
    destination: '/tmp/tuff-test',
    filename: 'Tuff-2.4.10-setup.exe',
    priority: DownloadPriority.CRITICAL,
    module: DownloadModule.APP_UPDATE,
    status: DownloadStatus.PENDING,
    progress: { downloadedSize: 0, speed: 0, percentage: 0 },
    chunks: [],
    metadata: { version: 'v2.4.10' },
    createdAt: new Date(),
    updatedAt: new Date()
  }
  const notificationService = {
    showUpdateDownloadCompleteNotification: vi.fn(),
    showUpdateAvailableNotification: vi.fn()
  }
  return {
    task,
    addTask: vi.fn(async () => task.id),
    getTaskStatus: vi.fn(() => task),
    getAllTasks: vi.fn(() => []),
    getNotificationService: vi.fn(() => notificationService),
    notificationService
  }
}

async function flushAsync(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('UpdateSystem automatic installer handoff', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    PollingService.getInstance().stop('test setup')
  })

  afterEach(() => {
    PollingService.getInstance().stop('test cleanup')
    vi.useRealTimers()
    vi.restoreAllMocks()
    shellOpenPathMock.mockReset()
    spawnMock.mockReset()
    spawnMock.mockReturnValue({ unref: unrefMock })
    unrefMock.mockReset()
    appQuitMock.mockReset()
    appExitMock.mockReset()
  })

  it('keeps manual download completion on notification path', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const downloadCenter = createDownloadCenterMock()
    const updateSystem = new UpdateSystem(downloadCenter as never, {
      storageRoot: '/tmp/tuff-test'
    })

    await updateSystem.downloadUpdate({
      tag_name: 'v2.4.10',
      name: 'Tuff 2.4.10',
      published_at: '2026-05-10T08:00:00.000Z',
      body: '',
      assets: [
        {
          name: 'Tuff-2.4.10-setup.exe',
          url: 'https://example.test/Tuff-2.4.10-setup.exe',
          size: 100,
          platform: 'win32',
          arch: 'x64'
        }
      ]
    })

    downloadCenter.task.status = DownloadStatus.COMPLETED
    await vi.runOnlyPendingTimersAsync()
    await flushAsync()

    expect(downloadCenter.notificationService.showUpdateDownloadCompleteNotification).toHaveBeenCalledWith(
      'v2.4.10',
      'task-1'
    )
    expect(shellOpenPathMock).not.toHaveBeenCalled()
  })

  it('does not auto hand off manual downloads even when auto install is enabled', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const downloadCenter = createDownloadCenterMock()
    const updateSystem = new UpdateSystem(downloadCenter as never, {
      storageRoot: '/tmp/tuff-test',
      autoInstallDownloadedUpdates: true
    })

    await updateSystem.downloadUpdate({
      tag_name: 'v2.4.10',
      name: 'Tuff 2.4.10',
      published_at: '2026-05-10T08:00:00.000Z',
      body: '',
      assets: [
        {
          name: 'Tuff-2.4.10-setup.exe',
          url: 'https://example.test/Tuff-2.4.10-setup.exe',
          size: 100,
          platform: 'win32',
          arch: 'x64'
        }
      ]
    })

    downloadCenter.task.status = DownloadStatus.COMPLETED
    await vi.runOnlyPendingTimersAsync()
    await flushAsync()

    expect(downloadCenter.notificationService.showUpdateDownloadCompleteNotification).toHaveBeenCalledWith(
      'v2.4.10',
      'task-1'
    )
    expect(spawnMock).not.toHaveBeenCalled()
    expect(appQuitMock).not.toHaveBeenCalled()
  })

  it('does not auto hand off auto-download tasks when auto install is disabled', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const downloadCenter = createDownloadCenterMock()
    const updateSystem = new UpdateSystem(downloadCenter as never, {
      storageRoot: '/tmp/tuff-test',
      autoInstallDownloadedUpdates: false
    })

    await updateSystem.downloadUpdate(
      {
        tag_name: 'v2.4.10',
        name: 'Tuff 2.4.10',
        published_at: '2026-05-10T08:00:00.000Z',
        body: '',
        assets: [
          {
            name: 'Tuff-2.4.10-setup.exe',
            url: 'https://example.test/Tuff-2.4.10-setup.exe',
            size: 100,
            platform: 'win32',
            arch: 'x64'
          }
        ]
      },
      { autoInstallOnComplete: true }
    )

    downloadCenter.task.status = DownloadStatus.COMPLETED
    await vi.runOnlyPendingTimersAsync()
    await flushAsync()

    expect(downloadCenter.notificationService.showUpdateDownloadCompleteNotification).toHaveBeenCalledWith(
      'v2.4.10',
      'task-1'
    )
    expect(spawnMock).not.toHaveBeenCalled()
    expect(appQuitMock).not.toHaveBeenCalled()
  })

  it('automatically hands off only auto-download tasks marked for auto install', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const downloadCenter = createDownloadCenterMock()
    const updateSystem = new UpdateSystem(downloadCenter as never, {
      storageRoot: '/tmp/tuff-test',
      autoInstallDownloadedUpdates: true
    })

    await updateSystem.downloadUpdate(
      {
        tag_name: 'v2.4.10',
        name: 'Tuff 2.4.10',
        published_at: '2026-05-10T08:00:00.000Z',
        body: '',
        assets: [
          {
            name: 'Tuff-2.4.10-setup.exe',
            url: 'https://example.test/Tuff-2.4.10-setup.exe',
            size: 100,
            platform: 'win32',
            arch: 'x64'
          }
        ]
      },
      { autoInstallOnComplete: true }
    )

    downloadCenter.task.status = DownloadStatus.COMPLETED
    await vi.runOnlyPendingTimersAsync()
    await flushAsync()

    expect(spawnMock).toHaveBeenCalledWith('/tmp/tuff-test/Tuff-2.4.10-setup.exe', ['/S'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    })
    expect(unrefMock).toHaveBeenCalledTimes(1)
    expect(appQuitMock).toHaveBeenCalledTimes(1)
    expect(shellOpenPathMock).not.toHaveBeenCalled()
    expect(downloadCenter.notificationService.showUpdateDownloadCompleteNotification).not.toHaveBeenCalled()
  })
})
