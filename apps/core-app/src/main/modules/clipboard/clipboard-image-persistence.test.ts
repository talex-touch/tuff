import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  availableImage: {
    isEmpty: vi.fn(() => false),
    getSize: vi.fn(() => ({ width: 640, height: 480 })),
    resize: vi.fn(() => ({ toDataURL: vi.fn(() => 'data:image/png;base64,preview') })),
    toPNG: vi.fn(() => Buffer.from('png-data'))
  },
  emptyImage: {
    isEmpty: vi.fn(() => true)
  },
  clipboardReadImage: vi.fn(),
  createEmpty: vi.fn(() => ({ isEmpty: () => true })),
  createFromDataURL: vi.fn(() => ({ isEmpty: () => false, source: 'data' })),
  createFromPath: vi.fn(() => ({ isEmpty: () => false, source: 'path' })),
  createFile: vi.fn(async () => ({
    path: '/tmp/tuff/clipboard/live-images/read.png',
    sizeBytes: 8,
    createdAt: 1
  })),
  deleteFile: vi.fn(async () => true),
  isWithinBaseDir: vi.fn(() => true),
  registerNamespace: vi.fn(),
  resolveNamespaceDir: vi.fn(() => '/tmp/tuff/clipboard/images'),
  startCleanup: vi.fn(),
  pollingIsRegistered: vi.fn(() => false),
  pollingRegister: vi.fn(),
  pollingStart: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn()
}))

vi.mock('electron', () => ({
  clipboard: {
    readImage: mocks.clipboardReadImage
  },
  nativeImage: {
    createEmpty: mocks.createEmpty,
    createFromDataURL: mocks.createFromDataURL,
    createFromPath: mocks.createFromPath
  }
}))

vi.mock('../../service/temp-file.service', () => ({
  tempFileService: {
    createFile: mocks.createFile,
    deleteFileFromNamespaces: mocks.deleteFile,
    isWithinBaseDir: mocks.isWithinBaseDir,
    registerNamespace: mocks.registerNamespace,
    resolveNamespaceDir: mocks.resolveNamespaceDir,
    startCleanup: mocks.startCleanup
  }
}))

vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  PollingService: {
    getInstance: vi.fn(() => ({
      isRegistered: mocks.pollingIsRegistered,
      register: mocks.pollingRegister,
      start: mocks.pollingStart
    }))
  }
}))

vi.mock('node:fs/promises', () => ({
  default: {
    readdir: mocks.readdir,
    stat: mocks.stat
  },
  readdir: mocks.readdir,
  stat: mocks.stat
}))

vi.mock('../../utils/logger', () => ({
  createLogger: () => {
    const logger = {
      child: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
    logger.child.mockReturnValue(logger)
    return logger
  }
}))

vi.mock('../../utils/perf-monitor', () => ({
  perfMonitor: {
    recordMainReport: vi.fn()
  }
}))

vi.mock('../../service/app-task-gate', () => ({
  appTaskGate: {
    waitForIdle: vi.fn(async () => {}),
    isActive: vi.fn(() => false)
  }
}))

import {
  ClipboardImagePersistence,
  createNativeImageFromClipboardSource
} from './clipboard-image-persistence'

function createDb(imagePaths: string[]) {
  let candidateIndex = 0
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => {
            const referenced = candidateIndex < imagePaths.length
            candidateIndex += 1
            return referenced ? [{ id: candidateIndex }] : []
          })
        }))
      }))
    }))
  }
}

function createPersistence(db?: ReturnType<typeof createDb>): ClipboardImagePersistence {
  return new ClipboardImagePersistence({
    getDatabase: () => db as never,
    logInfo: mocks.logInfo,
    logWarn: mocks.logWarn
  })
}

describe('clipboard-image-persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.clipboardReadImage.mockReturnValue(mocks.availableImage)
    mocks.readdir.mockResolvedValue([])
    mocks.stat.mockResolvedValue({ mtimeMs: 1, size: 8 })
  })

  it('reads clipboard images as preview or temp tfile without changing response shape', async () => {
    const persistence = createPersistence()

    await expect(persistence.readClipboardImage({ preview: true })).resolves.toEqual({
      dataUrl: 'data:image/png;base64,preview',
      width: 640,
      height: 480
    })

    await expect(persistence.readClipboardImage({ preview: false })).resolves.toEqual({
      dataUrl: 'data:image/png;base64,preview',
      width: 640,
      height: 480,
      tfileUrl: 'tfile:///tmp/tuff/clipboard/live-images/read.png'
    })

    expect(mocks.createFile).toHaveBeenCalledWith({
      namespace: 'clipboard/live-images',
      ext: 'png',
      buffer: Buffer.from('png-data'),
      prefix: 'clipboard-read'
    })
  })

  it('returns null when clipboard image is empty', async () => {
    mocks.clipboardReadImage.mockReturnValueOnce(mocks.emptyImage)
    await expect(createPersistence().readClipboardImage({ preview: true })).resolves.toBeNull()
  })

  it('keeps native image source reconstruction behavior compatible', () => {
    createNativeImageFromClipboardSource('data:image/png;base64,abc')
    createNativeImageFromClipboardSource('tfile:///tmp/tuff/image.png')
    createNativeImageFromClipboardSource('file:///tmp/tuff/image.png')
    createNativeImageFromClipboardSource('/tmp/tuff/image.png')

    expect(mocks.createFromDataURL).toHaveBeenCalledWith('data:image/png;base64,abc')
    expect(mocks.createFromPath).toHaveBeenCalledWith('/tmp/tuff/image.png')
  })

  it('advances deterministic orphan pages past referenced files', async () => {
    const db = createDb(['/tmp/tuff/clipboard/images/a.png', '/tmp/tuff/clipboard/images/b.png'])
    const persistence = createPersistence(db)
    mocks.readdir.mockResolvedValue([
      { name: 'c.png', isDirectory: () => false, isFile: () => true },
      { name: 'b.png', isDirectory: () => false, isFile: () => true },
      { name: 'a.png', isDirectory: () => false, isFile: () => true }
    ])

    await expect(persistence.cleanupOrphanClipboardImages(undefined, 1)).resolves.toMatchObject({
      deletedCount: 0,
      bounded: true
    })
    await expect(persistence.cleanupOrphanClipboardImages(undefined, 1)).resolves.toMatchObject({
      deletedCount: 0,
      bounded: true
    })
    await expect(persistence.cleanupOrphanClipboardImages(undefined, 1)).resolves.toMatchObject({
      deletedCount: 1,
      bounded: false
    })

    expect(mocks.deleteFile).toHaveBeenCalledOnce()
    expect(mocks.deleteFile).toHaveBeenCalledWith('/tmp/tuff/clipboard/images/c.png', [
      'clipboard/images'
    ])
  })

  it('reports cancellation while deleting owned references', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      createPersistence().deleteOwnedImageReferences(
        ['/tmp/tuff/clipboard/images/cancelled.png'],
        controller.signal
      )
    ).resolves.toMatchObject({ deletedCount: 0, failedCount: 0, cancelled: true })
    expect(mocks.stat).not.toHaveBeenCalled()
    expect(mocks.deleteFile).not.toHaveBeenCalled()
  })

  it('treats a concurrent ENOENT after stat as idempotent success', async () => {
    const missing = Object.assign(new Error('gone'), { code: 'ENOENT' })
    mocks.stat.mockResolvedValueOnce({ mtimeMs: 1, size: 8 }).mockRejectedValueOnce(missing)
    mocks.deleteFile.mockResolvedValueOnce(false)

    await expect(
      createPersistence().deleteOwnedImageReferences([
        '/tmp/tuff/clipboard/images/concurrent-delete.png'
      ])
    ).resolves.toMatchObject({ deletedCount: 0, failedCount: 0 })
  })

  it('cleans only old unreferenced clipboard image files', async () => {
    const db = createDb(['/tmp/tuff/clipboard/images/a-keep.png'])
    const persistence = createPersistence(db)
    mocks.readdir.mockResolvedValueOnce([
      { name: 'a-keep.png', isDirectory: () => false, isFile: () => true },
      { name: 'z-delete.png', isDirectory: () => false, isFile: () => true }
    ])

    await persistence.cleanupOrphanClipboardImages()

    expect(mocks.deleteFile).toHaveBeenCalledTimes(1)
    expect(mocks.deleteFile).toHaveBeenCalledWith('/tmp/tuff/clipboard/images/z-delete.png', [
      'clipboard/images'
    ])
    expect(mocks.logInfo).toHaveBeenCalledWith('Cleaned orphaned clipboard images', {
      meta: { cleanedCount: 1, cleanedBytes: 8 }
    })
  })
})
