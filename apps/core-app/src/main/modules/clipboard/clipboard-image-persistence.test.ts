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
  // `app` 不是这个模块自己用的，是导入链末端 `config/default.ts` 在模块顶层读的。
  // 少了它整个文件加载失败——报的是「no tests」而不是失败，所以文件里的用例一条都没跑。
  app: {
    getAppPath: () => '/tmp/tuff-app'
  },
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
    waitForIdle: vi.fn(async () => true),
    isActive: vi.fn(() => false)
  },
  APP_TASK_GATE_STARTUP_WAIT_MS: 10_000
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
  describe('resolveOwnedImagePath', () => {
    /**
     * This is what stops `previewImage` from being a "open any file on this machine" call:
     * the id comes from a plugin, the path comes from a database row, and neither is trusted.
     */
    it('rejects a reference that escapes the clipboard image namespace', () => {
      const persistence = createPersistence()

      expect(persistence.resolveOwnedImagePath('/tmp/tuff/clipboard/images/shot.png')).toBe(
        '/tmp/tuff/clipboard/images/shot.png'
      )
      expect(
        persistence.resolveOwnedImagePath('/tmp/tuff/clipboard/images/../../../etc/passwd')
      ).toBeNull()
      expect(persistence.resolveOwnedImagePath('/etc/passwd')).toBeNull()
      // 前缀相同但不是同一个目录，`startsWith` 写漏分隔符时就会漏这一条。
      expect(
        persistence.resolveOwnedImagePath('/tmp/tuff/clipboard/images-evil/shot.png')
      ).toBeNull()
      expect(persistence.resolveOwnedImagePath('data:image/png;base64,AAA')).toBeNull()
      expect(persistence.resolveOwnedImagePath(null)).toBeNull()
    })
  })

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
