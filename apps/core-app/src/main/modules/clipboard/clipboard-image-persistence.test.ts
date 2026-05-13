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
    deleteFile: mocks.deleteFile,
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
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => imagePaths.map((content) => ({ content })))
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

  it('cleans only old unreferenced clipboard image files', async () => {
    const db = createDb(['/tmp/tuff/clipboard/images/keep.png'])
    const persistence = createPersistence(db)
    mocks.readdir.mockResolvedValueOnce([
      { name: 'keep.png', isDirectory: () => false, isFile: () => true },
      { name: 'delete.png', isDirectory: () => false, isFile: () => true }
    ])

    await persistence.cleanupOrphanClipboardImages()

    expect(mocks.deleteFile).toHaveBeenCalledTimes(1)
    expect(mocks.deleteFile).toHaveBeenCalledWith('/tmp/tuff/clipboard/images/delete.png')
    expect(mocks.logInfo).toHaveBeenCalledWith('Cleaned orphaned clipboard images', {
      meta: { cleanedCount: 1, cleanedBytes: 8 }
    })
  })
})
