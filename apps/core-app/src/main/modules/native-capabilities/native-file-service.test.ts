import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  stat: vi.fn(async () => ({
    isFile: () => true,
    isDirectory: () => false,
    size: 1024,
    birthtime: new Date('2026-05-11T00:00:00.000Z'),
    mtime: new Date('2026-05-11T00:01:00.000Z')
  })),
  showItemInFolder: vi.fn(),
  openPath: vi.fn(async () => ''),
  createThumbnailFromPath: vi.fn(async () => ({
    isEmpty: () => false,
    toDataURL: () => 'data:image/png;base64,icon'
  })),
  createFromPath: vi.fn(() => ({
    isEmpty: () => false,
    getSize: () => ({ width: 320, height: 200 })
  })),
  thumbnailGenerate: vi.fn(async () => ({
    status: 'generated',
    kind: 'image',
    path: '/tmp/tuff/file/thumbnails/thumb.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 5,
    width: 64,
    height: 40,
    durationMs: 7
  })),
  readFile: vi.fn(async () => Buffer.from('thumb')),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
    child: vi.fn(),
    time: vi.fn(() => ({ end: vi.fn(), split: vi.fn() }))
  }
}))

vi.mock('node:fs/promises', () => ({
  default: {
    stat: mocks.stat,
    readFile: mocks.readFile
  },
  stat: mocks.stat,
  readFile: mocks.readFile
}))

vi.mock('electron', () => ({
  shell: {
    showItemInFolder: mocks.showItemInFolder,
    openPath: mocks.openPath
  },
  nativeImage: {
    createThumbnailFromPath: mocks.createThumbnailFromPath,
    createFromPath: mocks.createFromPath
  }
}))

vi.mock('../box-tool/addon/files/workers/thumbnail-worker-client', () => ({
  ThumbnailWorkerClient: vi.fn(() => ({
    generate: mocks.thumbnailGenerate
  }))
}))

vi.mock('../../utils/logger', () => ({
  createLogger: vi.fn(() => mocks.logger)
}))

describe('NativeFileService', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('returns file stat metadata with tfile url', async () => {
    const { NativeFileService } = await import('./native-file-service')
    const service = new NativeFileService()

    const result = await service.stat({ path: '/tmp/a.png' })

    expect(result).toMatchObject({
      path: '/tmp/a.png',
      name: 'a.png',
      extension: 'png',
      exists: true,
      isFile: true,
      isDirectory: false,
      sizeBytes: 1024,
      mimeType: 'image/png',
      tfileUrl: 'tfile:///tmp/a.png'
    })
  })

  it('opens and reveals paths through electron shell', async () => {
    const { NativeFileService } = await import('./native-file-service')
    const service = new NativeFileService()

    await expect(service.open({ path: '/tmp/a.png' })).resolves.toMatchObject({
      success: true
    })
    await expect(service.reveal({ path: '/tmp/a.png' })).resolves.toMatchObject({
      success: true
    })

    expect(mocks.openPath).toHaveBeenCalledWith('/tmp/a.png')
    expect(mocks.showItemInFolder).toHaveBeenCalledWith('/tmp/a.png')
  })

  it('stores generated thumbnails as native tfile refs by default', async () => {
    const { NativeFileService } = await import('./native-file-service')
    const service = new NativeFileService()

    const result = await service.getThumbnail({ path: '/tmp/a.png' })

    expect(mocks.thumbnailGenerate).toHaveBeenCalledWith('/tmp/a.png', {
      extension: 'png',
      sizeBytes: 1024
    })
    expect(result).toMatchObject({
      kind: 'tfile',
      url: 'tfile:///tmp/tuff/file/thumbnails/thumb.jpg',
      path: '/tmp/tuff/file/thumbnails/thumb.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 5,
      width: 64,
      height: 40,
      durationMs: 7
    })
  })

  it('returns data-url thumbnails when requested', async () => {
    const { NativeFileService } = await import('./native-file-service')
    const service = new NativeFileService()

    const result = await service.getThumbnail({ path: '/tmp/a.png', output: 'data-url' })

    expect(mocks.readFile).toHaveBeenCalledWith('/tmp/tuff/file/thumbnails/thumb.jpg')
    expect(result).toMatchObject({
      kind: 'data-url',
      url: 'data:image/jpeg;base64,dGh1bWI=',
      mimeType: 'image/jpeg',
      sizeBytes: 5
    })
  })

  it('probes image media metadata without reading large content into transport', async () => {
    const { NativeFileService } = await import('./native-file-service')
    const service = new NativeFileService()

    const result = await service.probeMedia({ path: '/tmp/a.png' })

    expect(result).toMatchObject({
      path: '/tmp/a.png',
      kind: 'image',
      mimeType: 'image/png',
      width: 320,
      height: 200,
      ref: {
        kind: 'tfile',
        url: 'tfile:///tmp/a.png',
        path: '/tmp/a.png'
      }
    })
  })
})
