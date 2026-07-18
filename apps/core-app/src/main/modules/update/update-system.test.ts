import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DownloadModule, DownloadPriority, DownloadStatus } from '@talex-touch/utils'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { UpdateSystem } from './update-system'

const { networkRequestMock, createReadStreamMock, readFileMock } = vi.hoisted(() => ({
  networkRequestMock: vi.fn(),
  createReadStreamMock: vi.fn(),
  readFileMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/tuff-test'),
    getVersion: vi.fn(() => '2.4.9'),
    isPackaged: true
  }
}))

vi.mock('../../utils/release-signature', () => ({
  SignatureVerifier: class SignatureVerifier {
    verifyFileSignatureWithCache = vi.fn(async () => ({ valid: true }))
  }
}))

vi.mock('../analytics/message-store', () => ({
  getAnalyticsMessageStore: () => ({ add: vi.fn() })
}))

vi.mock('../database', () => ({ databaseModule: { getDb: vi.fn() } }))
vi.mock('../network', () => ({ getNetworkService: () => ({ request: networkRequestMock }) }))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    createReadStream: createReadStreamMock,
    promises: {
      ...actual.promises,
      readFile: readFileMock,
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
    metadata: {
      version: 'v2.4.10',
      checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      signatureUrl: 'https://example.test/Tuff-2.4.10-setup.exe.sig'
    },
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

const sha256 = 'a'.repeat(64)
const signatureUrl = 'https://example.test/Tuff-2.4.10-setup.exe.sig'
const manifestUrl = 'https://example.test/tuff-release-manifest.json'

function trustedRelease() {
  const arch: 'x64' | 'arm64' = process.arch === 'arm64' ? 'arm64' : 'x64'
  return {
    source: 'nexus' as const,
    tag_name: 'v2.4.10',
    name: 'Tuff 2.4.10',
    published_at: '2026-05-10T08:00:00.000Z',
    body: '',
    assets: [
      {
        name: 'Tuff-2.4.10-setup.exe',
        url: 'https://example.test/Tuff-2.4.10-setup.exe',
        size: 100,
        platform: 'win32' as const,
        arch,
        checksum: sha256,
        signatureUrl
      },
      { name: 'Tuff-2.4.10-setup.exe.sig', url: signatureUrl, size: 32 },
      {
        name: 'tuff-release-manifest.json',
        url: manifestUrl,
        size: 512,
        platform: 'win32' as const,
        arch
      }
    ]
  }
}

function trustedManifest() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  return {
    schemaVersion: 2,
    release: {
      tag: 'v2.4.10',
      version: '2.4.10',
      channel: 'RELEASE',
      rollbackFromVersion: '2.4.9',
      rollbackCompatible: true
    },
    artifacts: [
      {
        name: 'Tuff-2.4.10-setup.exe',
        component: 'core',
        platform: 'win32',
        arch,
        sha256,
        signature: 'Tuff-2.4.10-setup.exe.sig'
      }
    ]
  }
}

describe('UpdateSystem install handoff preparation', () => {
  let savedAppVersion: string | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    PollingService.getInstance().stop('test setup')
    createReadStreamMock.mockReset()
    createReadStreamMock.mockReturnValue((async function* () {})())
    readFileMock.mockReset()
    savedAppVersion = process.env.APP_VERSION
    process.env.APP_VERSION = '2.4.9'
    networkRequestMock.mockReset()
    networkRequestMock.mockImplementation(async ({ url }: { url: string }) => {
      if (url === manifestUrl) return { data: trustedManifest() }
      throw new Error(`Unexpected update request: ${url}`)
    })
  })

  afterEach(() => {
    PollingService.getInstance().stop('test cleanup')
    if (savedAppVersion === undefined) delete process.env.APP_VERSION
    else process.env.APP_VERSION = savedAppVersion
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns a verified package after streaming every chunk through SHA-256', async () => {
    const chunks = [Buffer.from('trusted-'), Buffer.from('package')]
    const checksum = crypto.createHash('sha256').update(Buffer.concat(chunks)).digest('hex')
    const downloadCenter = createDownloadCenterMock()
    downloadCenter.task.status = DownloadStatus.COMPLETED
    downloadCenter.task.metadata.checksum = checksum
    createReadStreamMock.mockReturnValue(
      (async function* () {
        yield* chunks
      })()
    )
    const updateSystem = new UpdateSystem(downloadCenter as never, {
      storageRoot: '/tmp/tuff-test'
    })

    await expect(updateSystem.prepareInstallHandoff('task-1')).resolves.toMatchObject({
      taskId: 'task-1',
      filePath: '/tmp/tuff-test/Tuff-2.4.10-setup.exe',
      sha256: checksum
    })
  })

  it('rejects a handoff package whose streamed checksum does not match', async () => {
    const downloadCenter = createDownloadCenterMock()
    downloadCenter.task.status = DownloadStatus.COMPLETED
    downloadCenter.task.metadata.checksum = 'b'.repeat(64)
    createReadStreamMock.mockReturnValue(
      (async function* () {
        yield Buffer.from('tampered-package')
      })()
    )
    const updateSystem = new UpdateSystem(downloadCenter as never, {
      storageRoot: '/tmp/tuff-test'
    })

    await expect(updateSystem.prepareInstallHandoff('task-1')).rejects.toThrow(
      'Checksum verification failed'
    )
  })

  it('returns rollback compatibility when the installed version exactly matches the manifest target', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const updateSystem = new UpdateSystem(createDownloadCenterMock() as never, {
      storageRoot: '/tmp/tuff-test'
    })

    await expect(updateSystem.downloadUpdate(trustedRelease())).resolves.toMatchObject({
      taskId: 'task-1',
      rollbackFromVersion: '2.4.9',
      rollbackCompatible: true
    })
  })

  it('fails closed when the installed version is not the exact manifest rollback version', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    process.env.APP_VERSION = '2.4.8'
    const updateSystem = new UpdateSystem(createDownloadCenterMock() as never, {
      storageRoot: '/tmp/tuff-test'
    })

    await expect(updateSystem.downloadUpdate(trustedRelease())).resolves.toMatchObject({
      taskId: 'task-1',
      rollbackFromVersion: '2.4.9',
      rollbackCompatible: false
    })
  })

  it('keeps download completion notification separate from install handoff preparation', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const downloadCenter = createDownloadCenterMock()
    const updateSystem = new UpdateSystem(downloadCenter as never, {
      storageRoot: '/tmp/tuff-test'
    })

    await updateSystem.downloadUpdate(trustedRelease())
    downloadCenter.task.status = DownloadStatus.COMPLETED
    await vi.runOnlyPendingTimersAsync()

    expect(
      downloadCenter.notificationService.showUpdateDownloadCompleteNotification
    ).toHaveBeenCalledWith('v2.4.10', 'task-1')
  })
})
