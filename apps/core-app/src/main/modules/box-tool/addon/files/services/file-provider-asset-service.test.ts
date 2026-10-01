import { describe, expect, it, vi } from 'vitest'
import { THUMBNAIL_ENCODER_VERSION, THUMBNAIL_STATUS_EXTENSION_KEY } from '../thumbnail-config'
import { FileProviderAssetService } from './file-provider-asset-service'

const ICON_PATH =
  '/cache/file-icons/6f2a4c8e9d0b1a2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6071829300.png'

/**
 * The lazy icon path writes a *path*, not a Base64 image: the value is stored in `file_extensions`
 * and read back by the renderer, so a regenerated data URL here would put megabytes per file back
 * into the database and stop matching the `tfile:` allowlist.
 */
interface FileExtensionRow {
  fileId: number
  key: string
  value: string
}

function createHarness() {
  const addFileExtensions = vi.fn(async (_rows: FileExtensionRow[]): Promise<void> => undefined)
  const getFileIconPath = vi.fn<(filePath: string) => Promise<string | null>>(async () => ICON_PATH)
  const deps = {
    iconService: {
      getFileIconPath,
      getFileIconWorkerStatus: vi.fn(),
      getFileIconCacheDirectory: vi.fn(() => '/cache/file-icons')
    },
    thumbnailWorker: { generate: vi.fn(), getStatus: vi.fn() },
    getDbUtils: () => ({ addFileExtensions }),
    withDbWrite: async <T>(_label: string, operation: () => Promise<T>): Promise<T> =>
      await operation(),
    waitForWriteCapacity: vi.fn(async () => true),
    waitForIdle: vi.fn(async () => undefined),
    yieldToEventLoop: vi.fn(async () => undefined),
    toTimestamp: (value: number | Date | string | null | undefined) =>
      typeof value === 'number' ? value : value == null ? null : new Date(value).getTime(),
    logDebug: vi.fn(),
    logWarn: vi.fn(),
    enableIconExtraction: true,
    iconWriteMaxQueue: 8
  }

  return {
    service: new FileProviderAssetService(deps as never),
    deps,
    addFileExtensions,
    getFileIconPath
  }
}

const FILE = { mtime: 1_700_000_000_000, size: 42 } as never

describe('FileProviderAssetService lazy icons', () => {
  it('persists the resolved icon path as the stored value', async () => {
    const { service, addFileExtensions } = createHarness()

    await service.ensureIcon(11, '/docs/report.pdf', FILE)

    expect(addFileExtensions).toHaveBeenCalledTimes(1)
    const [rows] = addFileExtensions.mock.calls[0]!
    expect(rows).toContainEqual({ fileId: 11, key: 'icon', value: ICON_PATH })
  })

  it('stores nothing when no icon path could be produced', async () => {
    const { service, addFileExtensions, getFileIconPath } = createHarness()
    getFileIconPath.mockResolvedValueOnce(null)

    await service.ensureIcon(11, '/docs/report.pdf', FILE)

    expect(addFileExtensions).not.toHaveBeenCalled()
  })

  it('extracts once for concurrent requests of the same file', async () => {
    const { service, addFileExtensions, getFileIconPath } = createHarness()
    let resolveIcon: (value: string | null) => void = () => {}
    getFileIconPath.mockImplementation(
      () =>
        new Promise<string | null>((resolve) => {
          resolveIcon = resolve
        })
    )

    const first = service.ensureIcon(11, '/docs/report.pdf')
    const second = service.ensureIcon(11, '/docs/report.pdf')
    await vi.waitFor(() => expect(getFileIconPath).toHaveBeenCalledOnce())

    resolveIcon(ICON_PATH)
    await Promise.all([first, second])

    expect(getFileIconPath).toHaveBeenCalledOnce()
    expect(addFileExtensions).toHaveBeenCalledTimes(1)
  })

  it('produces no icons while icon extraction is disabled', async () => {
    const { service, deps, addFileExtensions, getFileIconPath } = createHarness()
    deps.enableIconExtraction = false

    await service.ensureIcon(11, '/docs/report.pdf', FILE)

    expect(getFileIconPath).not.toHaveBeenCalled()
    expect(addFileExtensions).not.toHaveBeenCalled()
  })

  it('does not start extraction when the write lane refuses capacity', async () => {
    const { service, deps, getFileIconPath } = createHarness()
    deps.waitForWriteCapacity.mockResolvedValueOnce(false)

    await service.ensureIcon(11, '/docs/report.pdf', FILE)

    expect(getFileIconPath).not.toHaveBeenCalled()
  })

  it('sheds icon work once its in-flight bound is reached', async () => {
    const { service, getFileIconPath } = createHarness()
    const pendingIconResolvers: Array<(value: string | null) => void> = []
    getFileIconPath.mockImplementation(
      () =>
        new Promise<string | null>((resolve) => {
          pendingIconResolvers.push(resolve)
        })
    )

    const requests = Array.from({ length: 65 }, (_, index) =>
      service.ensureIcon(index, `/docs/file-${index}.txt`, FILE)
    )
    await vi.waitFor(() => expect(getFileIconPath).toHaveBeenCalledTimes(64), { timeout: 5_000 })

    for (const resolve of pendingIconResolvers) {
      resolve(null)
    }
    await Promise.all(requests)

    expect(getFileIconPath).toHaveBeenCalledTimes(64)
  })

  it('stamps generated thumbnails with the current encoder version so they stop being candidates', async () => {
    const { service, deps, addFileExtensions } = createHarness()
    deps.thumbnailWorker.generate.mockResolvedValueOnce({
      status: 'generated',
      kind: 'image',
      path: '/cache/file-thumbnails/cover.png',
      mimeType: 'image/png',
      sizeBytes: 900,
      durationMs: 4
    })

    await service.ensureThumbnail(11, '/docs/cover.png', {
      mtime: 1_700_000_000_000,
      size: 42,
      extension: '.png'
    } as never)

    expect(addFileExtensions).toHaveBeenCalledTimes(1)
    const [rows] = addFileExtensions.mock.calls[0]!
    expect(rows).toContainEqual({
      fileId: 11,
      key: 'thumbnail',
      value: '/cache/file-thumbnails/cover.png'
    })
    const statusRow = rows.find((row) => row.key === THUMBNAIL_STATUS_EXTENSION_KEY)
    // Without the current version the deferred pass would re-select this row forever.
    expect(JSON.parse(statusRow!.value)).toMatchObject({
      status: 'generated',
      v: THUMBNAIL_ENCODER_VERSION
    })
  })

  it('does not regenerate a thumbnail whose current-version status still matches the file', async () => {
    const { service, deps } = createHarness()
    const file = { mtime: 1_700_000_000_000, size: 42, extension: '.png', id: 11 } as never

    await service.ensureThumbnail(11, '/docs/cover.png', file, {
      [THUMBNAIL_STATUS_EXTENSION_KEY]: JSON.stringify({
        status: 'failed',
        reason: 'ffmpeg-unavailable',
        mtime: 1_700_000_000_000,
        size: 42,
        v: THUMBNAIL_ENCODER_VERSION,
        at: Date.now()
      })
    })

    expect(deps.thumbnailWorker.generate).not.toHaveBeenCalled()
  })

  it('regenerates when the current-version status describes a file that changed since', async () => {
    const { service, deps } = createHarness()
    const file = { mtime: 1_700_000_000_000, size: 42, extension: '.png', id: 11 } as never
    deps.thumbnailWorker.generate.mockResolvedValueOnce({
      status: 'failed',
      kind: 'image',
      reason: 'thumbnail-generation-failed',
      durationMs: 2
    })

    await service.ensureThumbnail(11, '/docs/cover.png', file, {
      [THUMBNAIL_STATUS_EXTENSION_KEY]: JSON.stringify({
        status: 'failed',
        reason: 'thumbnail-generation-failed',
        // Same encoder version, but stamped before the file was last written.
        mtime: 1_699_999_999_000,
        size: 42,
        v: THUMBNAIL_ENCODER_VERSION,
        at: Date.now()
      })
    })

    expect(deps.thumbnailWorker.generate).toHaveBeenCalledOnce()
  })

  it('regenerates a stored thumbnail whose status was written before versioning', async () => {
    const { service, deps } = createHarness()
    const file = { mtime: 1_700_000_000_000, size: 42, extension: '.png', id: 11 } as never
    deps.thumbnailWorker.generate.mockResolvedValueOnce({
      status: 'failed',
      kind: 'image',
      reason: 'thumbnail-generation-failed',
      durationMs: 2
    })

    await service.ensureThumbnail(11, '/docs/cover.png', file, {
      // A successful generation from the previous encoder: no status at all, so the stored JPEG
      // would otherwise look fresh forever and never be replaced by the PNG encoder.
      thumbnail: '/cache/file-thumbnails/cover.jpg'
    })

    expect(deps.thumbnailWorker.generate).toHaveBeenCalledOnce()
  })

  it('regenerates a thumbnail whose status matches the file but predates the encoder', async () => {
    const { service, deps } = createHarness()
    const file = { mtime: 1_700_000_000_000, size: 42, extension: '.png', id: 11 } as never
    deps.thumbnailWorker.generate.mockResolvedValueOnce({
      status: 'failed',
      kind: 'image',
      reason: 'thumbnail-generation-failed',
      durationMs: 2
    })

    await service.ensureThumbnail(11, '/docs/cover.png', file, {
      [THUMBNAIL_STATUS_EXTENSION_KEY]: JSON.stringify({
        status: 'failed',
        reason: 'thumbnail-generation-failed',
        // Same file, same metadata — only the encoder that wrote this is older, and its bytes are
        // the opaque-silhouette JPEG the current one replaces.
        mtime: 1_700_000_000_000,
        size: 42,
        v: THUMBNAIL_ENCODER_VERSION - 1,
        at: Date.now()
      })
    })

    expect(deps.thumbnailWorker.generate).toHaveBeenCalledOnce()
  })

  it('persists failed status with the current encoder version', async () => {
    const { service, deps, addFileExtensions } = createHarness()
    deps.thumbnailWorker.generate.mockResolvedValueOnce({
      status: 'failed',
      kind: 'video',
      reason: 'ffmpeg-unavailable',
      durationMs: 3
    })

    // No extensions map: a failed status has no stored thumbnail to compare against.
    await service.ensureThumbnail(11, '/docs/movie.mp4')

    expect(addFileExtensions).toHaveBeenCalledTimes(1)
    const [rows] = addFileExtensions.mock.calls[0]!
    const statusRow = rows.find((row) => row.key === THUMBNAIL_STATUS_EXTENSION_KEY)
    expect(JSON.parse(statusRow!.value)).toMatchObject({
      status: 'failed',
      reason: 'ffmpeg-unavailable',
      v: THUMBNAIL_ENCODER_VERSION
    })
  })

  it('persists unsupported status with the current encoder version', async () => {
    const { service, addFileExtensions } = createHarness()

    await service.ensureThumbnail(11, '/docs/shot.png', {
      mtime: 1_700_000_000_000,
      size: 100 * 1024 * 1024,
      extension: '.png'
    } as never)

    expect(addFileExtensions).toHaveBeenCalledTimes(1)
    const [rows] = addFileExtensions.mock.calls[0]!
    const statusRow = rows.find((row) => row.key === THUMBNAIL_STATUS_EXTENSION_KEY)
    expect(JSON.parse(statusRow!.value)).toMatchObject({
      status: 'unsupported',
      reason: 'file-too-large',
      v: THUMBNAIL_ENCODER_VERSION,
      size: 100 * 1024 * 1024
    })
  })
})

describe('FileProviderAssetService shutdown fencing', () => {
  it('writes nothing when an in-flight extraction finishes after close', async () => {
    const { service, addFileExtensions, getFileIconPath } = createHarness()
    let resolveIcon: (value: string | null) => void = () => {}
    const inFlight = new Promise<string | null>((resolve) => {
      resolveIcon = resolve
    })
    getFileIconPath.mockImplementation(() => inFlight)

    const ensure = service.ensureIcon(11, '/docs/report.pdf', FILE)
    await vi.waitFor(() => expect(getFileIconPath).toHaveBeenCalledOnce())

    const closing = service.close()
    resolveIcon(ICON_PATH)
    await ensure
    await closing

    expect(addFileExtensions).not.toHaveBeenCalled()
  })

  it('starts no extraction for work admitted after close', async () => {
    const { service, getFileIconPath } = createHarness()

    await service.close()
    await service.ensureIcon(11, '/docs/report.pdf', FILE)

    expect(getFileIconPath).not.toHaveBeenCalled()
  })

  it('does not resolve close until the database write it already started completes', async () => {
    const { service, addFileExtensions } = createHarness()
    const completionOrder: string[] = []
    let releaseWrite: () => void = () => {}
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve
    })
    addFileExtensions.mockImplementationOnce(async () => {
      await writeGate
      completionOrder.push('write')
    })

    const ensure = service.ensureIcon(11, '/docs/report.pdf', FILE)
    await vi.waitFor(() => expect(addFileExtensions).toHaveBeenCalledOnce())

    const closing = service.close().then(() => {
      completionOrder.push('close')
    })
    releaseWrite()
    await closing
    await ensure

    expect(completionOrder).toEqual(['write', 'close'])
  })
})
