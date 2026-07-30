import { Buffer } from 'node:buffer'
import type { NativeTransport, NativeTransportSnapshot } from './native-transport'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clipboardWriteImage: vi.fn(),
  createFromBuffer: vi.fn(() => ({ isEmpty: () => false })),
  getAllWindows: vi.fn<() => Array<{ isDestroyed: () => boolean; getMediaSourceId: () => string }>>(
    () => []
  ),
  getCursorScreenPoint: vi.fn(() => ({ x: -50, y: 25 })),
  registerNamespace: vi.fn(),
  startCleanup: vi.fn(),
  createFile: vi.fn(async () => ({
    path: '/tmp/tuff/native/screenshots/shot.png',
    sizeBytes: 8,
    createdAt: 1
  })),
  copyFile: vi.fn(async () => undefined),
  readFile: vi.fn(async () => Buffer.from('image')),
  realpath: vi.fn(async (value: string) => value),
  getBaseDir: vi.fn(() => '/tmp/tuff'),
  isWithinBaseDir: vi.fn(() => true),
  resolveNamespaceDir: vi.fn(() => '/tmp/tuff/native/screenshots'),
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
    copyFile: mocks.copyFile,
    readFile: mocks.readFile,
    realpath: mocks.realpath
  }
}))

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: mocks.getAllWindows },
  clipboard: { writeImage: mocks.clipboardWriteImage },
  nativeImage: { createFromBuffer: mocks.createFromBuffer },
  screen: { getCursorScreenPoint: mocks.getCursorScreenPoint }
}))

vi.mock('../../service/temp-file.service', () => ({
  tempFileService: {
    registerNamespace: mocks.registerNamespace,
    startCleanup: mocks.startCleanup,
    createFile: mocks.createFile,
    getBaseDir: mocks.getBaseDir,
    isWithinBaseDir: mocks.isWithinBaseDir,
    resolveNamespaceDir: mocks.resolveNamespaceDir
  }
}))

vi.mock('../../utils/logger', () => ({
  createLogger: vi.fn(() => mocks.logger)
}))

const capability = {
  id: 'screenshot.capture',
  version: '1.1.0',
  engine: 'screen-capture-kit',
  state: 'available' as const,
  features: ['display', 'region', 'window', 'frames', 'frozen-compose'],
  operations: []
}

const readySnapshot: NativeTransportSnapshot = {
  state: 'ready',
  carriers: [],
  capabilities: [capability],
  conflicts: []
}

const contentSnapshot = {
  generation: 'generation:1',
  coordinateSpace: 'global-dip-v1',
  capturedAtUnixMs: 1,
  displays: [
    {
      id: 'display:left',
      nativeId: '17',
      name: 'Left Retina',
      globalFrame: { x: -100, y: 0, width: 100, height: 100 },
      pixelSize: { width: 200, height: 200 },
      scale: { x: 2, y: 2 },
      rotation: 0,
      isPrimary: false
    },
    {
      id: 'display:primary',
      nativeId: '1',
      name: 'Primary',
      globalFrame: { x: 0, y: 0, width: 120, height: 100 },
      pixelSize: { width: 120, height: 100 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      isPrimary: true
    }
  ],
  windows: [],
  accessibility: 'granted'
}

const LEFT_PUBLIC_DISPLAY_ID = 'display:public:4523540f1504cd17100c4835'
const PRIMARY_PUBLIC_DISPLAY_ID = 'display:public:6b86b273ff34fce19d6b804e'

const probe = {
  platform: 'macos',
  engine: 'screen-capture-kit',
  screenRecording: 'granted',
  accessibility: 'granted',
  features: capability.features,
  limits: {}
}

function result<T>(value: T, attachments: Buffer[] = [], attachmentDescriptors: unknown[] = []) {
  return {
    value,
    attachments,
    attachmentDescriptors,
    meta: { durationMs: 8, engine: 'screen-capture-kit' }
  }
}

function createProtocolTransport(contentSnapshots = [contentSnapshot], probeValue = probe) {
  const openStream = vi.fn(() => ({ id: 'stream:1' }))
  let refreshIndex = 0
  let activeContent = contentSnapshots[0]
  const invoke = vi.fn(
    async (_capability: string, operation: string, _input?: unknown, _options?: unknown) => {
      if (operation === 'probe') return result(probeValue)
      if (operation === 'refresh') {
        activeContent = contentSnapshots[Math.min(refreshIndex, contentSnapshots.length - 1)]
        refreshIndex += 1
        return result(activeContent)
      }
      if (operation === 'hit_test') {
        return result({
          generation: activeContent.generation,
          point: { x: -50, y: 25 },
          candidates: [
            {
              window: {
                id: 'window:opaque',
                capturable: true,
                globalFrame: { x: -40, y: 10, width: 60, height: 50 }
              },
              element: {
                id: 'element:opaque',
                globalFrame: { x: -30, y: 15, width: 20, height: 10 }
              }
            }
          ]
        })
      }
      if (operation === 'capture') {
        return result(
          {
            generation: activeContent.generation,
            targetKind: 'display',
            mimeType: 'image/png',
            width: 2,
            height: 1,
            outputScale: { x: 2, y: 2 },
            globalRect: { x: -100, y: 0, width: 100, height: 100 },
            byteLength: 8,
            imageParts: [
              { attachmentId: 'image:0', offset: 0, byteLength: 4 },
              { attachmentId: 'image:1', offset: 4, byteLength: 4 }
            ]
          },
          [Buffer.from('png-'), Buffer.from('data')],
          [
            {
              id: 'image:0',
              index: 0,
              byteLength: 4,
              mediaType: 'image/png',
              purpose: 'screenshot-image'
            },
            {
              id: 'image:1',
              index: 1,
              byteLength: 4,
              mediaType: 'image/png',
              purpose: 'screenshot-image'
            }
          ]
        )
      }
      if (operation === 'compose') {
        return result(
          {
            generation: activeContent.generation,
            targetKind: 'region',
            mimeType: 'image/png',
            width: 100,
            height: 40,
            outputScale: { x: 2, y: 2 },
            globalRect: { x: -25, y: 10, width: 50, height: 20 },
            byteLength: 8,
            imageParts: [
              { attachmentId: 'image:0', offset: 0, byteLength: 4 },
              { attachmentId: 'image:1', offset: 4, byteLength: 4 }
            ]
          },
          [Buffer.from('png-'), Buffer.from('data')],
          [
            {
              id: 'image:0',
              index: 0,
              byteLength: 4,
              mediaType: 'image/png',
              purpose: 'screenshot-image'
            },
            {
              id: 'image:1',
              index: 1,
              byteLength: 4,
              mediaType: 'image/png',
              purpose: 'screenshot-image'
            }
          ]
        )
      }
      throw new Error(`Unexpected operation: ${operation}`)
    }
  )

  return { invoke, openStream } as unknown as NativeTransport & {
    invoke: typeof invoke
    openStream: typeof openStream
  }
}

describe('NativeScreenshotService protocol client', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    mocks.getAllWindows.mockReturnValue([])
    mocks.realpath.mockImplementation(async (value: string) => value)
    mocks.isWithinBaseDir.mockReturnValue(true)
  })

  it('initializes through probe then refresh and preserves global DIP display geometry', async () => {
    const { NativeScreenshotService } = await import('./screenshot-service')
    const transport = createProtocolTransport()
    const service = new NativeScreenshotService(transport)

    await service.initialize(readySnapshot)

    expect(transport.invoke.mock.calls.map((call) => call[1])).toEqual(['probe', 'refresh'])
    expect(service.getSupport()).toEqual({
      supported: true,
      platform: 'macos',
      engine: 'screen-capture-kit'
    })
    expect(service.listDisplays()).toEqual([
      {
        id: LEFT_PUBLIC_DISPLAY_ID,
        name: 'Left Retina',
        friendlyName: 'Left Retina',
        x: -100,
        y: 0,
        width: 100,
        height: 100,
        scaleFactor: 2,
        rotation: 0,
        isPrimary: false
      },
      expect.objectContaining({
        id: PRIMARY_PUBLIC_DISPLAY_ID,
        x: 0,
        scaleFactor: 1,
        isPrimary: true
      })
    ])
  })

  it('merges descriptor features when an older probe omits host-provided compose', async () => {
    const { NativeScreenshotService } = await import('./screenshot-service')
    const transport = createProtocolTransport([contentSnapshot], {
      ...probe,
      features: ['display', 'region', 'window', 'frames']
    })
    const service = new NativeScreenshotService(transport)

    await service.initialize(readySnapshot)

    expect(service.getFeatures()).toContain('frozen-compose')
  })

  it('keeps public display identity stable when native refresh rotates generation-scoped ids', async () => {
    const { NativeScreenshotService } = await import('./screenshot-service')
    const firstContent = {
      ...contentSnapshot,
      displays: contentSnapshot.displays.map((display) => ({
        ...display,
        id: `display:mac:1:${display.nativeId}`
      }))
    }
    const nextContent = {
      ...contentSnapshot,
      generation: 'generation:2',
      displays: contentSnapshot.displays.map((display) => ({
        ...display,
        id: `display:mac:2:${display.nativeId}`
      }))
    }
    const transport = createProtocolTransport([firstContent, nextContent])
    const service = new NativeScreenshotService(transport)

    await service.initialize(readySnapshot)
    const publicDisplay = service.listDisplays()[0]
    expect(publicDisplay.id).toMatch(/^display:public:/)

    const captured = await service.capture({
      target: 'display',
      displayId: publicDisplay.id,
      writeClipboard: false
    })

    expect(transport.invoke.mock.calls.at(-1)?.[2]).toMatchObject({
      target: {
        generation: 'generation:2',
        displayId: 'display:mac:2:17'
      }
    })
    expect(captured.displayId).toBe(publicDisplay.id)
    expect(service.listDisplays()[0].id).toBe(publicDisplay.id)
  })

  it('keeps BrowserWindow self identity inside the main-to-Rust refresh request', async () => {
    vi.stubEnv('__CFBundleIdentifier', 'com.talex.touch')
    mocks.getAllWindows.mockReturnValue([
      {
        isDestroyed: () => false,
        getMediaSourceId: () => 'window:7001:0'
      },
      {
        isDestroyed: () => false,
        getMediaSourceId: () => 'window:7001:duplicate'
      },
      {
        isDestroyed: () => false,
        getMediaSourceId: () => 'window:4294967296:overflow'
      },
      {
        isDestroyed: () => true,
        getMediaSourceId: () => 'window:7002:0'
      }
    ])
    const { NativeScreenshotService } = await import('./screenshot-service')
    const transport = createProtocolTransport()
    const service = new NativeScreenshotService(transport)

    await service.initialize(readySnapshot)

    const refreshCall = transport.invoke.mock.calls.find((call) => call[1] === 'refresh')
    expect(refreshCall?.[2]).toEqual({
      includeWindowTitles: false,
      self: {
        processIds: [process.pid],
        bundleIds: ['com.talex.touch'],
        nativeWindowIds: ['7001']
      }
    })
    expect(JSON.stringify(service.listDisplays())).not.toContain('7001')
  })

  it('runs refresh, hit_test, and capture without legacy coordinate scaling', async () => {
    const { NativeScreenshotService } = await import('./screenshot-service')
    const transport = createProtocolTransport()
    const service = new NativeScreenshotService(transport)
    await service.initialize(readySnapshot)
    transport.invoke.mockClear()

    const captured = await service.capture({
      target: 'cursor-display',
      cursorPoint: { x: -50, y: 25 },
      writeClipboard: true
    })

    expect(transport.invoke.mock.calls.map((call) => call[1])).toEqual([
      'refresh',
      'hit_test',
      'capture'
    ])
    expect(transport.invoke.mock.calls[1][2]).toEqual({
      generation: 'generation:1',
      point: { x: -50, y: 25 },
      granularity: 'window',
      includePanels: false,
      maxCandidates: 1
    })
    expect(transport.invoke.mock.calls[2][2]).toEqual({
      target: {
        kind: 'display',
        generation: 'generation:1',
        displayId: 'display:left'
      },
      cursor: 'hidden',
      output: { format: 'png', scale: 'native-max' }
    })
    expect(mocks.createFile).toHaveBeenCalledWith({
      namespace: 'native/screenshots',
      ext: 'png',
      buffer: Buffer.from('png-data'),
      prefix: 'screenshot'
    })
    expect(mocks.clipboardWriteImage).toHaveBeenCalledOnce()
    expect(captured).toMatchObject({
      tfileUrl: 'tfile:///tmp/tuff/native/screenshots/shot.png',
      width: 2,
      height: 1,
      displayId: LEFT_PUBLIC_DISPLAY_ID,
      x: -100,
      y: 0,
      scaleFactor: 2,
      sizeBytes: 8,
      wroteClipboard: true
    })
    expect(captured).not.toHaveProperty('path')
    expect(captured).not.toHaveProperty('dataUrl')
  })

  it('keeps hit-test identity in main and captures the selected native candidate', async () => {
    const { NativeScreenshotService } = await import('./screenshot-service')
    const transport = createProtocolTransport()
    const service = new NativeScreenshotService(transport)
    await service.initialize(readySnapshot)
    transport.invoke.mockClear()

    const candidate = await service.hitTestCandidate({ x: -25, y: 20 }, 'ui-element')
    expect(candidate).toEqual({
      kind: 'ui-element',
      bounds: { x: -30, y: 15, width: 20, height: 10 },
      generation: 'generation:1',
      targetId: 'element:opaque'
    })
    await service.captureCandidate(candidate!)

    expect(transport.invoke.mock.calls.at(-1)?.[2]).toMatchObject({
      target: {
        kind: 'ui-element',
        generation: 'generation:1',
        elementId: 'element:opaque'
      }
    })
  })

  it('passes frozen managed resources to Rust compose and stores only its descriptor result', async () => {
    const { NativeScreenshotService } = await import('./screenshot-service')
    const transport = createProtocolTransport()
    const service = new NativeScreenshotService(transport)
    await service.initialize(readySnapshot)
    transport.invoke.mockClear()

    const composed = await service.composeFrozenRegion(
      [
        {
          display: service.listDisplays()[0],
          resource: {
            tfileUrl: 'tfile:///tmp/tuff/native/screenshots/left.png',
            mimeType: 'image/png',
            width: 200,
            height: 200,
            displayId: LEFT_PUBLIC_DISPLAY_ID,
            displayName: 'Left Retina',
            x: -100,
            y: 0,
            scaleFactor: 2,
            durationMs: 4,
            sizeBytes: 5,
            wroteClipboard: false
          }
        }
      ],
      { x: -25, y: 10, width: 50, height: 20 },
      { border: true, shadow: false }
    )

    const composeCall = transport.invoke.mock.calls.find((call) => call[1] === 'compose')
    expect(composeCall?.[2]).toEqual({
      generation: 'generation:1',
      rect: { x: -25, y: 10, width: 50, height: 20 },
      sources: [
        {
          globalRect: { x: -100, y: 0, width: 100, height: 100 },
          imageParts: [{ attachmentId: 'source:0:0', offset: 0, byteLength: 5 }]
        }
      ],
      effects: { border: true, shadow: false, cornerRadius: 0 }
    })
    expect(composeCall?.[3]).toMatchObject({
      attachments: [
        {
          id: 'source:0:0',
          data: Buffer.from('image'),
          mediaType: 'image/png',
          purpose: 'frozen-display'
        }
      ]
    })
    expect(composed).toMatchObject({
      tfileUrl: 'tfile:///tmp/tuff/native/screenshots/shot.png',
      width: 100,
      height: 40,
      x: -25,
      y: 10,
      wroteClipboard: false
    })
    expect(composed).not.toHaveProperty('path')
  })

  it('opens frames against the current hit-test generation without refreshing it away', async () => {
    const { NativeScreenshotService } = await import('./screenshot-service')
    const transport = createProtocolTransport()
    const service = new NativeScreenshotService(transport)
    await service.initialize(readySnapshot)
    transport.invoke.mockClear()

    const stream = await service.openFrames({
      target: {
        kind: 'display',
        generation: 'generation:1',
        displayId: 'display:left'
      },
      framesPerSecond: 24,
      maxFrameBytes: 4096,
      initialWindow: 2
    })

    expect(transport.invoke).not.toHaveBeenCalled()
    expect(transport.openStream).toHaveBeenCalledWith(
      'screenshot.capture',
      'frames',
      {
        target: {
          kind: 'display',
          generation: 'generation:1',
          displayId: 'display:left'
        },
        cursor: 'hidden',
        framesPerSecond: 24,
        pixelFormat: 'bgra8-premultiplied',
        maxFrameBytes: 4096
      },
      { initialWindow: 2, signal: undefined }
    )
    expect(stream).toMatchObject({ id: 'stream:1' })
  })

  it('passes a cross-display region through as global DIP without selecting one monitor', async () => {
    const { NativeScreenshotService } = await import('./screenshot-service')
    const transport = createProtocolTransport()
    const service = new NativeScreenshotService(transport)
    await service.initialize(readySnapshot)
    transport.invoke.mockClear()

    await service.capture({
      target: 'region',
      region: { x: -25, y: 10, width: 50, height: 20 }
    })

    expect(transport.invoke.mock.calls[1][2]).toMatchObject({
      target: {
        kind: 'region',
        generation: 'generation:1',
        rect: { x: -25, y: 10, width: 50, height: 20 }
      }
    })
  })

  it('fails closed when the capability is not routable', async () => {
    const { NativeScreenshotService } = await import('./screenshot-service')
    const transport = createProtocolTransport()
    const service = new NativeScreenshotService(transport)

    await service.initialize({ ...readySnapshot, capabilities: [] })

    expect(transport.invoke).not.toHaveBeenCalled()
    expect(service.getSupport()).toMatchObject({
      supported: false,
      reason: 'capability-unavailable'
    })
    await expect(service.capture()).rejects.toMatchObject({
      code: 'ERR_NATIVE_SCREENSHOT_UNAVAILABLE'
    })
  })

  it('reads and copies only namespace-scoped tfile capture resources', async () => {
    const { NativeScreenshotService } = await import('./screenshot-service')
    const service = new NativeScreenshotService(createProtocolTransport())

    await expect(
      service.readCaptureResource('tfile:///tmp/tuff/native/screenshots/shot.png')
    ).resolves.toEqual(Buffer.from('image'))
    await service.copyCaptureResource(
      'tfile:///tmp/tuff/native/screenshots/shot.png',
      '/tmp/export.png'
    )
    expect(mocks.copyFile).toHaveBeenCalledWith(
      '/tmp/tuff/native/screenshots/shot.png',
      '/tmp/export.png'
    )
    await expect(
      service.readCaptureResource('tfile:///tmp/tuff/native/other/shot.png')
    ).rejects.toMatchObject({ code: 'ERR_NATIVE_SCREENSHOT_RESOURCE_INVALID' })
    await expect(
      service.readCaptureResource('/tmp/tuff/native/screenshots/shot.png')
    ).rejects.toMatchObject({
      code: 'ERR_NATIVE_SCREENSHOT_RESOURCE_INVALID'
    })
    mocks.realpath.mockImplementation(async (value: string) =>
      value.endsWith('shot.png') ? '/private/outside/shot.png' : value
    )
    await expect(
      service.readCaptureResource('tfile:///tmp/tuff/native/screenshots/shot.png')
    ).rejects.toMatchObject({ code: 'ERR_NATIVE_SCREENSHOT_RESOURCE_INVALID' })
  })

  it('rejects binary JSON output and malformed attachment correlation', async () => {
    const { NativeScreenshotService } = await import('./screenshot-service')
    const transport = createProtocolTransport()
    const service = new NativeScreenshotService(transport)
    await service.initialize(readySnapshot)

    await expect(
      service.capture({ output: 'data-url' } as unknown as Parameters<typeof service.capture>[0])
    ).rejects.toMatchObject({
      code: 'ERR_NATIVE_SCREENSHOT_OUTPUT_UNSUPPORTED'
    })

    transport.invoke.mockImplementation(
      async (_capability: string, operation: string, _input?: unknown) => {
        if (operation === 'refresh') return result(contentSnapshot)
        if (operation === 'hit_test') {
          return result({ generation: 'generation:1', point: { x: -50, y: 25 }, candidates: [] })
        }
        if (operation === 'capture') {
          return result(
            {
              generation: 'generation:1',
              targetKind: 'display',
              mimeType: 'image/png',
              width: 1,
              height: 1,
              outputScale: { x: 1, y: 1 },
              globalRect: { x: -100, y: 0, width: 100, height: 100 },
              byteLength: 4,
              imageParts: [{ attachmentId: 'image:missing', offset: 0, byteLength: 4 }]
            },
            [Buffer.from('data')],
            [{ id: 'image:0', index: 0, byteLength: 4 }]
          )
        }
        return result(probe)
      }
    )

    await expect(service.capture()).rejects.toMatchObject({
      code: 'ERR_NATIVE_SCREENSHOT_PROTOCOL'
    })
    expect(mocks.createFile).not.toHaveBeenCalled()
  })
})
