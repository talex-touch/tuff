import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  stat: vi.fn(async () => ({
    isFile: () => true,
    isDirectory: () => false,
    mode: 0o644,
    size: 1024,
    birthtime: new Date('2026-05-11T00:00:00.000Z'),
    mtime: new Date('2026-05-11T00:01:00.000Z')
  })),
  realpath: vi.fn(async (p: string) => p),
  showMessageBox: vi.fn(async () => ({ response: 1 })),
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
    realpath: mocks.realpath,
    readFile: mocks.readFile
  },
  stat: mocks.stat,
  realpath: mocks.realpath,
  readFile: mocks.readFile
}))

vi.mock('electron', () => ({
  dialog: {
    showMessageBox: mocks.showMessageBox
  },
  shell: {
    showItemInFolder: mocks.showItemInFolder,
    openPath: mocks.openPath
  },
  nativeImage: {
    createThumbnailFromPath: mocks.createThumbnailFromPath,
    createFromPath: mocks.createFromPath
  }
}))

vi.mock('../../utils/logger', () => ({
  createLogger: vi.fn(() => mocks.logger)
}))

async function createNativeFileService(options: { registerThumbnailPort?: boolean } = {}) {
  const [{ NativeFileService }, { registerNativeCapabilitiesPorts, resetNativeCapabilitiesPorts }] =
    await Promise.all([import('./native-file-service'), import('./native-capabilities-ports')])
  resetNativeCapabilitiesPorts()
  if (options.registerThumbnailPort !== false) {
    registerNativeCapabilitiesPorts({
      thumbnail: {
        generate: mocks.thumbnailGenerate as never
      }
    })
  }
  return new NativeFileService()
}

describe('NativeFileService', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('returns file stat metadata with tfile url', async () => {
    const service = await createNativeFileService()

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
    const service = await createNativeFileService()

    await expect(service.open({ path: '/tmp/a.png' })).resolves.toMatchObject({
      success: true
    })
    await expect(service.reveal({ path: '/tmp/a.png' })).resolves.toMatchObject({
      success: true
    })

    expect(mocks.openPath).toHaveBeenCalledWith('/tmp/a.png')
    expect(mocks.showItemInFolder).toHaveBeenCalledWith('/tmp/a.png')
  })

  it('blocks executable/script/bundle targets and requires user confirmation for plugin callers', async () => {
    const service = await createNativeFileService()

    for (const dangerousPath of [
      '/tmp/evil.sh',
      '/tmp/evil.command',
      '/tmp/evil.app',
      '/tmp/evil.exe',
      '/tmp/evil.bat',
      '/tmp/evil.bat.',
      '/tmp/evil.bat   ',
      '/tmp/evil.ps1',
      '/tmp/evil.dmg',
      '/tmp/evil.pkg',
      '/tmp/evil.chm',
      '/tmp/evil.jnlp',
      '/tmp/evil.msix',
      '/tmp/evil.iso',
      '/tmp/evil.mobileconfig',
      '/tmp/evil.py',
      '/tmp/evil.pyw',
      '/tmp/evil.fileloc',
      '/tmp/evil.search-ms'
    ]) {
      await expect(
        service.open({ path: dangerousPath }, { isPluginCaller: true, pluginName: 'demo.plugin' })
      ).rejects.toMatchObject({ code: 'ERR_NATIVE_FILE_OPEN_BLOCKED' })
    }

    // Fail closed when realpath fails for plugin callers.
    mocks.realpath.mockRejectedValueOnce(new Error('EACCES'))
    await expect(
      service.open({ path: '/tmp/report.pdf' }, { isPluginCaller: true, pluginName: 'demo.plugin' })
    ).rejects.toMatchObject({ code: 'ERR_NATIVE_FILE_OPEN_BLOCKED' })
    expect(mocks.openPath).not.toHaveBeenCalled()

    // POSIX executable bit on an innocent-looking extension must also be blocked on non-Windows.
    if (process.platform !== 'win32') {
      mocks.stat.mockResolvedValueOnce({
        isFile: () => true,
        isDirectory: () => false,
        mode: 0o755,
        size: 64,
        birthtime: new Date(),
        mtime: new Date()
      })
      mocks.stat.mockResolvedValueOnce({
        isFile: () => true,
        isDirectory: () => false,
        mode: 0o755,
        size: 64,
        birthtime: new Date(),
        mtime: new Date()
      })
      await expect(
        service.open(
          { path: '/tmp/notes.txt' },
          { isPluginCaller: true, pluginName: 'demo.plugin' }
        )
      ).rejects.toMatchObject({ code: 'ERR_NATIVE_FILE_OPEN_BLOCKED' })
    }

    // Benign file requires user confirmation: declined when response !== 0.
    mocks.showMessageBox.mockResolvedValueOnce({ response: 1 })
    await expect(
      service.open({ path: '/tmp/report.pdf' }, { isPluginCaller: true, pluginName: 'demo.plugin' })
    ).rejects.toMatchObject({ code: 'ERR_NATIVE_FILE_OPEN_DECLINED' })
    expect(mocks.openPath).not.toHaveBeenCalled()

    // Confirmation dialog receives canonical resolved path and shell.openPath opens the resolved path.
    mocks.realpath
      .mockResolvedValueOnce('/tmp/canonical/report.pdf')
      .mockResolvedValueOnce('/tmp/canonical/report.pdf')
    mocks.showMessageBox.mockResolvedValueOnce({ response: 0 })
    await expect(
      service.open({ path: '/tmp/alias.pdf' }, { isPluginCaller: true, pluginName: 'demo.plugin' })
    ).resolves.toMatchObject({ success: true, path: '/tmp/canonical/report.pdf' })
    expect(mocks.showMessageBox).toHaveBeenLastCalledWith(
      expect.objectContaining({ detail: '/tmp/canonical/report.pdf' })
    )
    expect(mocks.openPath).toHaveBeenCalledWith('/tmp/canonical/report.pdf')

    // TOCTOU symlink swap across confirmation dialog must be blocked before shell.openPath.
    mocks.openPath.mockClear()
    mocks.realpath
      .mockResolvedValueOnce('/tmp/canonical/safe.pdf')
      .mockResolvedValueOnce('/tmp/canonical/swapped.pdf')
    mocks.showMessageBox.mockResolvedValueOnce({ response: 0 })
    await expect(
      service.open({ path: '/tmp/toctou.pdf' }, { isPluginCaller: true, pluginName: 'demo.plugin' })
    ).rejects.toMatchObject({ code: 'ERR_NATIVE_FILE_OPEN_BLOCKED' })
    expect(mocks.openPath).not.toHaveBeenCalled()
  })

  it('stores generated thumbnails as native tfile refs by default', async () => {
    const service = await createNativeFileService()

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
    const service = await createNativeFileService()

    const result = await service.getThumbnail({ path: '/tmp/a.png', output: 'data-url' })

    expect(mocks.readFile).toHaveBeenCalledWith('/tmp/tuff/file/thumbnails/thumb.jpg')
    expect(result).toMatchObject({
      kind: 'data-url',
      url: 'data:image/jpeg;base64,dGh1bWI=',
      mimeType: 'image/jpeg',
      sizeBytes: 5
    })
  })

  it('degrades gracefully when the thumbnail port is unregistered', async () => {
    const service = await createNativeFileService({ registerThumbnailPort: false })

    const result = await service.getThumbnail({ path: '/tmp/a.png' })

    expect(result).toMatchObject({
      kind: 'tfile',
      path: '/tmp/a.png',
      metadata: {
        degraded: true,
        reason: 'thumbnail-provider-unregistered'
      }
    })
  })

  it('probes image media metadata without reading large content into transport', async () => {
    const service = await createNativeFileService()

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
