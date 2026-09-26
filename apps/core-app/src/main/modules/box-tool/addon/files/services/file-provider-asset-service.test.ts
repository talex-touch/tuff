import { describe, expect, it, vi } from 'vitest'
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
