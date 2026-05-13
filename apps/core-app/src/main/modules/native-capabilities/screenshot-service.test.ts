import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeScreenshotSupport } from '@talex-touch/utils/transport/events/types'

const mocks = vi.hoisted(() => ({
  clipboardWriteImage: vi.fn(),
  createFromBuffer: vi.fn(() => ({ isEmpty: () => false })),
  getAllDisplays: vi.fn(() => [
    {
      id: 100,
      bounds: { x: 0, y: 0, width: 1028, height: 665 },
      scaleFactor: 2
    },
    {
      id: 200,
      bounds: { x: 1028, y: 0, width: 795, height: 596 },
      scaleFactor: 2
    }
  ]),
  getCursorScreenPoint: vi.fn(() => ({ x: 1200, y: 100 })),
  getDisplayNearestPoint: vi.fn((point: { x: number; y: number }) => {
    if (point.x >= 1028) {
      return {
        id: 200,
        bounds: { x: 1028, y: 0, width: 795, height: 596 },
        scaleFactor: 2
      }
    }
    return {
      id: 100,
      bounds: { x: 0, y: 0, width: 1028, height: 665 },
      scaleFactor: 2
    }
  }),
  getPrimaryDisplay: vi.fn(() => ({
    id: 100,
    bounds: { x: 0, y: 0, width: 1028, height: 665 },
    scaleFactor: 2
  })),
  getNativeScreenshotSupport: vi.fn<() => NativeScreenshotSupport>(() => ({
    supported: true,
    platform: 'darwin',
    engine: 'xcap'
  })),
  listDisplays: vi.fn(() => [
    {
      id: '1',
      name: 'Display #1',
      friendlyName: 'Built-in Retina Display',
      x: 0,
      y: 0,
      width: 2056,
      height: 1330,
      scaleFactor: 2,
      rotation: 0,
      isPrimary: true
    },
    {
      id: '17',
      name: 'Display #17',
      friendlyName: 'Sidecar Display',
      x: 2056,
      y: 0,
      width: 1590,
      height: 1192,
      scaleFactor: 2,
      rotation: 0,
      isPrimary: false
    }
  ]),
  capture: vi.fn(() => ({
    image: Buffer.from('png-data'),
    mimeType: 'image/png',
    width: 1590,
    height: 1192,
    displayId: '17',
    displayName: 'Display #17',
    x: 2056,
    y: 0,
    scaleFactor: 2,
    durationMs: 8
  })),
  registerNamespace: vi.fn(),
  startCleanup: vi.fn(),
  createFile: vi.fn(async () => ({
    path: '/tmp/tuff/native/screenshots/shot.png',
    sizeBytes: 8,
    createdAt: 1
  })),
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

vi.mock('electron', () => ({
  clipboard: {
    writeImage: mocks.clipboardWriteImage
  },
  nativeImage: {
    createFromBuffer: mocks.createFromBuffer
  },
  screen: {
    getAllDisplays: mocks.getAllDisplays,
    getCursorScreenPoint: mocks.getCursorScreenPoint,
    getDisplayNearestPoint: mocks.getDisplayNearestPoint,
    getPrimaryDisplay: mocks.getPrimaryDisplay
  }
}))

vi.mock('./native-screenshot-addon', () => ({
  nativeScreenshotAddon: {
    getNativeScreenshotSupport: mocks.getNativeScreenshotSupport,
    listDisplays: mocks.listDisplays,
    capture: mocks.capture
  }
}))

vi.mock('../../service/temp-file.service', () => ({
  tempFileService: {
    registerNamespace: mocks.registerNamespace,
    startCleanup: mocks.startCleanup,
    createFile: mocks.createFile
  }
}))

vi.mock('../../utils/logger', () => ({
  createLogger: vi.fn(() => mocks.logger)
}))

describe('NativeScreenshotService', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mocks.getNativeScreenshotSupport.mockImplementation(() => ({
      supported: true,
      platform: 'darwin',
      engine: 'xcap'
    }))
  })

  it('normalizes display metadata to Electron global DIP coordinates', async () => {
    const { NativeScreenshotService } = await import('./screenshot-service')
    const service = new NativeScreenshotService()

    expect(service.listDisplays()).toEqual([
      {
        id: '1',
        name: 'Built-in Retina Display',
        friendlyName: 'Built-in Retina Display',
        x: 0,
        y: 0,
        width: 1028,
        height: 665,
        scaleFactor: 2,
        rotation: 0,
        isPrimary: true
      },
      {
        id: '17',
        name: 'Sidecar Display',
        friendlyName: 'Sidecar Display',
        x: 1028,
        y: 0,
        width: 795,
        height: 596,
        scaleFactor: 2,
        rotation: 0,
        isPrimary: false
      }
    ])
  })

  it('captures cursor display, writes temp tfile, and optionally writes clipboard', async () => {
    const { NativeScreenshotService } = await import('./screenshot-service')
    const service = new NativeScreenshotService()

    const result = await service.capture({
      target: 'cursor-display',
      writeClipboard: true
    })

    expect(mocks.capture).toHaveBeenCalledWith({
      displayId: '17',
      cursorX: 2400,
      cursorY: 200
    })
    expect(mocks.registerNamespace).toHaveBeenCalledWith({
      namespace: 'native/screenshots',
      retentionMs: 30 * 60_000
    })
    expect(mocks.createFile).toHaveBeenCalledWith({
      namespace: 'native/screenshots',
      ext: 'png',
      buffer: Buffer.from('png-data'),
      prefix: 'screenshot'
    })
    expect(mocks.clipboardWriteImage).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      tfileUrl: 'tfile:///tmp/tuff/native/screenshots/shot.png',
      path: '/tmp/tuff/native/screenshots/shot.png',
      width: 1590,
      height: 1192,
      displayId: '17',
      x: 1028,
      y: 0,
      scaleFactor: 2,
      sizeBytes: 8,
      wroteClipboard: true
    })
  })

  it('converts DIP region requests to monitor-local physical crop', async () => {
    const { NativeScreenshotService } = await import('./screenshot-service')
    const service = new NativeScreenshotService()

    await service.capture({
      target: 'region',
      region: {
        x: 1038,
        y: 20,
        width: 100,
        height: 50
      },
      output: 'data-url'
    })

    expect(mocks.capture).toHaveBeenCalledWith({
      displayId: '17',
      region: {
        x: 20,
        y: 40,
        width: 200,
        height: 100
      }
    })
    expect(mocks.createFile).not.toHaveBeenCalled()
  })

  it('returns unsupported support when native module reports disabled', async () => {
    mocks.getNativeScreenshotSupport.mockReturnValue({
      supported: false,
      platform: 'darwin',
      reason: 'disabled-by-env'
    })

    const { NativeScreenshotService } = await import('./screenshot-service')
    const service = new NativeScreenshotService()

    expect(service.getSupport()).toEqual({
      supported: false,
      platform: 'darwin',
      reason: 'disabled-by-env'
    })
    await expect(service.capture()).rejects.toMatchObject({
      code: 'ERR_NATIVE_SCREENSHOT_UNSUPPORTED'
    })
  })
})
