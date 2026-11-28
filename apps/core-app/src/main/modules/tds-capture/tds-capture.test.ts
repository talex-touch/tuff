import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient, type Client } from '@libsql/client'
import type { ModuleDestroyContext, ModuleInitContext } from '@talex-touch/utils'
import type { HandlerContext, ITuffTransportMain } from '@talex-touch/utils/transport/main'
import {
  createTdsCanvasSessionSdk,
  createTdsCaptureSdk,
  TdsCanvasSessionEvents,
  TdsCaptureEvents,
  type TdsCanvasSessionData
} from '@talex-touch/utils/transport/sdk/domains/tds-capture'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import type { MainDatabase } from '../../db/db-write'
import * as schema from '../../db/schema'
import { LOCAL_SECRET_FILE } from '../../utils/secure-store'

const { mockApp, mockTransportHandlers, mockResolveMainRuntime } = vi.hoisted(() => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  const appMock = {
    on: (event: string, listener: (...args: unknown[]) => void) => {
      const bucket = listeners.get(event) ?? new Set()
      bucket.add(listener)
      listeners.set(event, bucket)
      return appMock
    },
    removeListener: (event: string, listener: (...args: unknown[]) => void) => {
      listeners.get(event)?.delete(listener)
      return appMock
    },
    emit: (event: string, ...args: unknown[]) => {
      const bucket = listeners.get(event)
      if (!bucket) return false
      for (const listener of [...bucket]) {
        listener(...args)
      }
      return bucket.size > 0
    },
    removeAllListeners: (event?: string) => {
      if (event) listeners.delete(event)
      else listeners.clear()
      return appMock
    }
  }
  const handlers = new Map<string, (payload: unknown, context: HandlerContext) => unknown>()
  const transport = {
    on: vi.fn(
      (
        event: { toEventName: () => string },
        handler: (p: unknown, c: HandlerContext) => unknown
      ) => {
        const name = event.toEventName()
        handlers.set(name, handler)
        return () => {
          if (handlers.get(name) === handler) {
            handlers.delete(name)
          }
        }
      }
    )
  }
  return {
    mockApp: appMock,
    mockTransportHandlers: handlers,
    mockResolveMainRuntime: vi.fn(() => ({
      transport: transport as unknown as ITuffTransportMain
    }))
  }
})

vi.mock('electron', () => ({
  app: mockApp,
  BrowserWindow: vi.fn(),
  session: {
    fromPartition: vi.fn()
  }
}))

vi.mock('../../core/runtime-accessor', () => ({
  resolveMainRuntime: mockResolveMainRuntime
}))

import {
  assertAppRendererCaller,
  estimateCanvasSessionLowerBoundBytes,
  hashCanvasConversationId,
  IDLE_TTL_MS,
  injectCaptureCsp,
  isAllowedTdsCaptureUrl,
  MAX_CANVAS_FRAMES,
  MAX_CANVAS_HISTORY_BLOBS,
  MAX_CANVAS_HISTORY_ENTRIES,
  MAX_CANVAS_SESSION_BYTES,
  MAX_CANVAS_SESSIONS,
  MAX_CONCURRENT_SLOTS,
  MAX_DIMENSION,
  MAX_SRCDOC_BYTES,
  MAX_WAIT_QUEUE_LENGTH,
  MIN_DIMENSION,
  normalizeTdsCaptureRequest,
  sanitizeCanvasSessionData,
  secureTdsCaptureSession,
  TDS_CAPTURE_CSP,
  TDS_CAPTURE_PARTITION,
  TdsCanvasSessionStore,
  TdsCaptureModule,
  TdsOffscreenCaptureRenderer,
  type TdsCaptureSessionLike,
  type TdsCaptureTimerHandle,
  type TdsCaptureTimers,
  type TdsCaptureWebContentsLike,
  type TdsCaptureWindowFactoryOptions,
  type TdsCaptureWindowLike
} from './index'

interface FakeTimerEntry {
  id: number
  runAt: number
  callback: () => void
  cleared: boolean
}

class FakeClock {
  nowMs = 1_000
  private nextId = 1
  private readonly entries = new Map<number, FakeTimerEntry>()

  readonly timers: TdsCaptureTimers = {
    setTimeout: (callback, ms) => {
      const id = this.nextId++
      this.entries.set(id, {
        id,
        runAt: this.nowMs + Math.max(0, ms),
        callback,
        cleared: false
      })
      return id as unknown as TdsCaptureTimerHandle
    },
    clearTimeout: (handle) => {
      const id = handle as unknown as number
      const entry = this.entries.get(id)
      if (entry) {
        entry.cleared = true
        this.entries.delete(id)
      }
    }
  }

  now = (): number => this.nowMs

  pendingCount(): number {
    return this.entries.size
  }

  async advanceBy(ms: number): Promise<void> {
    const target = this.nowMs + ms
    while (true) {
      let earliest: FakeTimerEntry | null = null
      for (const entry of this.entries.values()) {
        if (entry.cleared) continue
        if (entry.runAt <= target && (!earliest || entry.runAt < earliest.runAt)) {
          earliest = entry
        }
      }
      if (!earliest) break
      this.nowMs = earliest.runAt
      this.entries.delete(earliest.id)
      earliest.callback()
      await flushMicrotasks()
    }
    this.nowMs = target
    await flushMicrotasks()
  }
}

async function flushMicrotasks(turns = 4): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await Promise.resolve()
  }
}

interface FakeSessionHarness {
  session: TdsCaptureSessionLike
  checkRequest: (url: string) => { cancel?: boolean }
  checkResponseHeaders: (
    url: string,
    responseHeaders?: Record<string, string[]>
  ) => Record<string, string[]> | undefined
  isListenerAttached: () => boolean
  emitDownload: () => { prevented: boolean }
  permissionRequestsDenied: () => boolean
  permissionCheckResult: () => boolean
  devicePermissionResult: () => boolean
}

function createFakeSession(): FakeSessionHarness {
  let beforeRequestListener:
    | ((details: { url: string }, callback: (response: { cancel?: boolean }) => void) => void)
    | null = null
  let headersReceivedListener:
    | ((
        details: { url: string; responseHeaders?: Record<string, string[]> },
        callback: (response: { responseHeaders?: Record<string, string[]> }) => void
      ) => void)
    | null = null
  let permissionRequestHandler:
    | ((wc: unknown, perm: string, cb: (granted: boolean) => void) => void)
    | null = null
  let permissionCheckHandler: (() => boolean) | null = null
  let devicePermissionHandler: (() => boolean) | null = null
  const downloadListeners = new Set<(event: { preventDefault: () => void }) => void>()

  const fakeSession: TdsCaptureSessionLike = {
    webRequest: {
      onBeforeRequest: (listener) => {
        beforeRequestListener = listener
      },
      onHeadersReceived: (listener) => {
        headersReceivedListener = listener
      }
    },
    setPermissionRequestHandler: (handler) => {
      permissionRequestHandler = handler
    },
    setPermissionCheckHandler: (handler) => {
      permissionCheckHandler = handler
    },
    setDevicePermissionHandler: (handler) => {
      devicePermissionHandler = handler
    },
    setDisplayMediaRequestHandler: () => {},
    on: (_event, listener) => {
      downloadListeners.add(listener)
    },
    removeListener: (_event, listener) => {
      downloadListeners.delete(listener)
    }
  }

  return {
    session: fakeSession,
    checkRequest: (url: string) => {
      if (!beforeRequestListener) {
        throw new Error('onBeforeRequest listener not installed')
      }
      let result: { cancel?: boolean } = {}
      beforeRequestListener({ url }, (response) => {
        result = response
      })
      return result
    },
    checkResponseHeaders: (url: string, responseHeaders?: Record<string, string[]>) => {
      if (!headersReceivedListener) {
        throw new Error('onHeadersReceived listener not installed')
      }
      let result: Record<string, string[]> | undefined
      headersReceivedListener({ url, responseHeaders }, (response) => {
        result = response.responseHeaders
      })
      return result
    },
    isListenerAttached: () => beforeRequestListener !== null,
    emitDownload: () => {
      let prevented = false
      for (const listener of downloadListeners) {
        listener({
          preventDefault: () => {
            prevented = true
          }
        })
      }
      return { prevented }
    },
    permissionRequestsDenied: () => {
      if (!permissionRequestHandler) return false
      let granted: boolean | null = null
      permissionRequestHandler({}, 'geolocation', (value) => {
        granted = value
      })
      return granted === false
    },
    permissionCheckResult: () => (permissionCheckHandler ? permissionCheckHandler() : true),
    devicePermissionResult: () => (devicePermissionHandler ? devicePermissionHandler() : true)
  }
}

interface FakeWindowBehavior {
  onLoad?: (url: string, emitter: EventEmitter, win: FakeWindowHarness) => Promise<void> | void
  onExecuteJs?: (code: string, userGesture?: boolean) => Promise<unknown> | unknown
  jpegBytes?: Buffer
  pngBytes?: Buffer
  supportsDeviceEmulation?: boolean
}

interface FakeWindowHarness {
  id: number
  options: TdsCaptureWindowFactoryOptions
  window: TdsCaptureWindowLike
  emitter: EventEmitter
  loadedUrls: string[]
  executedScripts: Array<{ code: string; userGesture?: boolean }>
  capturedRects: Array<{ x: number; y: number; width: number; height: number } | undefined>
  jpegQualities: number[]
  contentSizes: Array<{ width: number; height: number }>
  webRtcPolicies: string[]
  emulationCalls: Array<{
    screenPosition: string
    deviceScaleFactor: number
    screenSize: { width: number; height: number }
    viewSize: { width: number; height: number }
  }>
  windowOpenHandler: ((details: { url: string }) => { action: 'deny' }) | null
  destroyCount: number
  isDestroyed: () => boolean
  emitFinishLoad: () => void
}

function createFakeWindow(
  id: number,
  options: TdsCaptureWindowFactoryOptions,
  behavior: FakeWindowBehavior = {}
): FakeWindowHarness {
  const emitter = new EventEmitter()
  let destroyed = false
  const loadedUrls: string[] = []
  const executedScripts: Array<{ code: string; userGesture?: boolean }> = []
  const capturedRects: Array<{ x: number; y: number; width: number; height: number } | undefined> =
    []
  const jpegQualities: number[] = []
  const contentSizes: Array<{ width: number; height: number }> = []
  const webRtcPolicies: string[] = []
  const emulationCalls: FakeWindowHarness['emulationCalls'] = []

  const harness: FakeWindowHarness = {
    id,
    options,
    emitter,
    loadedUrls,
    executedScripts,
    capturedRects,
    jpegQualities,
    contentSizes,
    webRtcPolicies,
    emulationCalls,
    windowOpenHandler: null,
    destroyCount: 0,
    isDestroyed: () => destroyed,
    emitFinishLoad: () => {
      emitter.emit('did-finish-load')
    },
    window: null as unknown as TdsCaptureWindowLike
  }

  const webContents: TdsCaptureWebContentsLike = {
    on: emitter.on.bind(emitter) as TdsCaptureWebContentsLike['on'],
    removeListener: emitter.removeListener.bind(
      emitter
    ) as TdsCaptureWebContentsLike['removeListener'],
    setWindowOpenHandler: (handler) => {
      harness.windowOpenHandler = handler
    },
    setWebRTCIPHandlingPolicy: (policy) => {
      webRtcPolicies.push(policy)
    },
    ...(behavior.supportsDeviceEmulation !== false
      ? {
          enableDeviceEmulation: (params) => {
            emulationCalls.push({
              screenPosition: params.screenPosition,
              deviceScaleFactor: params.deviceScaleFactor,
              screenSize: params.screenSize,
              viewSize: params.viewSize
            })
          }
        }
      : {}),
    loadURL: async (url: string) => {
      loadedUrls.push(url)
      if (behavior.onLoad) {
        await behavior.onLoad(url, emitter, harness)
      } else {
        emitter.emit('did-finish-load')
      }
    },
    executeJavaScript: async (code: string, userGesture?: boolean) => {
      executedScripts.push({ code, userGesture })
      if (behavior.onExecuteJs) {
        return await behavior.onExecuteJs(code, userGesture)
      }
      return { probed: true }
    },
    capturePage: async (rect) => {
      capturedRects.push(rect)
      return {
        toJPEG: (quality: number) => {
          jpegQualities.push(quality)
          return behavior.jpegBytes ?? Buffer.from(`JPEG-${id}-q${quality}`)
        },
        toPNG: () => behavior.pngBytes ?? Buffer.from(`PNG-${id}`)
      }
    },
    invalidate: () => {},
    startPainting: () => {},
    stopPainting: () => {},
    isDestroyed: () => destroyed
  }

  harness.window = {
    webContents,
    setContentSize: (width: number, height: number) => {
      contentSizes.push({ width, height })
    },
    isDestroyed: () => destroyed,
    destroy: () => {
      if (!destroyed) {
        destroyed = true
        harness.destroyCount += 1
      }
    }
  }

  return harness
}

describe('tds-capture normalization & network isolation', () => {
  it('clamps dimensions, settleMs, timeoutMs, quality, and pixelRatio to safe bounds', () => {
    const low = normalizeTdsCaptureRequest({
      srcdoc: '<p>hi</p>',
      width: 12,
      height: -50,
      pixelRatio: 0.25,
      quality: 0,
      settleMs: -10,
      timeoutMs: 100
    })
    expect(low.ok).toBe(true)
    if (low.ok) {
      expect(low.value.width).toBe(MIN_DIMENSION)
      expect(low.value.height).toBe(MIN_DIMENSION)
      expect(low.value.pixelRatio).toBe(1)
      expect(low.value.quality).toBe(1)
      expect(low.value.settleMs).toBe(0)
      expect(low.value.timeoutMs).toBe(1_000)
      expect(low.value.format).toBe('jpeg')
    }

    const high = normalizeTdsCaptureRequest({
      srcdoc: '<p>hi</p>',
      width: 9_999,
      height: 5_000,
      pixelRatio: 8,
      quality: 150,
      settleMs: 5_000,
      timeoutMs: 60_000,
      format: 'png'
    })
    expect(high.ok).toBe(true)
    if (high.ok) {
      expect(high.value.width).toBe(MAX_DIMENSION)
      expect(high.value.height).toBe(MAX_DIMENSION)
      expect(high.value.pixelRatio).toBe(3)
      expect(high.value.quality).toBe(100)
      expect(high.value.settleMs).toBe(800)
      expect(high.value.timeoutMs).toBe(15_000)
      expect(high.value.format).toBe('png')
    }
  })

  it('rejects srcdoc exceeding MAX_SRCDOC_BYTES using UTF-8 byte length', () => {
    const oversizedAscii = 'a'.repeat(MAX_SRCDOC_BYTES + 1)
    const asciiResult = normalizeTdsCaptureRequest({
      srcdoc: oversizedAscii,
      width: 800,
      height: 600
    })
    expect(asciiResult.ok).toBe(false)
    if (!asciiResult.ok) {
      expect(asciiResult.error).toContain('SRCDOC_TOO_LARGE')
    }

    // 3 bytes per CJK character: 700,000 chars = 2.1M bytes > 2 MiB
    const oversizedUtf8 = '中'.repeat(700_000)
    const utf8Result = normalizeTdsCaptureRequest({
      srcdoc: oversizedUtf8,
      width: 800,
      height: 600
    })
    expect(utf8Result.ok).toBe(false)
    if (!utf8Result.ok) {
      expect(utf8Result.error).toContain('SRCDOC_TOO_LARGE')
    }
  })

  it('blocks all external/file/network URLs and allows only data: and about:', () => {
    const blockedUrls = [
      'http://example.com',
      'https://evil.com/exfil?cookie=1',
      'HTTPS://EVIL.COM/UPPER',
      '  https://evil.com/spaces',
      'ws://evil.com/socket',
      'wss://evil.com/socket',
      'ftp://files.evil.com/data',
      'file:///etc/passwd',
      'tfile:///Users/secret/file.txt',
      'blob:https://evil.com/uuid',
      'javascript:alert(1)',
      'about://evil.com',
      ''
    ]
    for (const url of blockedUrls) {
      expect(isAllowedTdsCaptureUrl(url), `expected blocked: ${url}`).toBe(false)
    }

    const allowedUrls = [
      'data:text/html;charset=utf-8,%3Ch1%3EHello%3C%2Fh1%3E',
      'DATA:image/png;base64,iVBORw0KGgo=',
      'about:blank',
      'about:srcdoc'
    ]
    for (const url of allowedUrls) {
      expect(isAllowedTdsCaptureUrl(url), `expected allowed: ${url}`).toBe(true)
    }

    const fakeSession = createFakeSession()
    const dispose = secureTdsCaptureSession(fakeSession.session)
    expect(fakeSession.checkRequest('https://evil.com')).toEqual({ cancel: true })
    expect(fakeSession.checkRequest('http://127.0.0.1:8080/leak')).toEqual({ cancel: true })
    expect(fakeSession.checkRequest('ws://evil.com')).toEqual({ cancel: true })
    expect(fakeSession.checkRequest('wss://evil.com')).toEqual({ cancel: true })
    expect(fakeSession.checkRequest('ftp://evil.com/a')).toEqual({ cancel: true })
    expect(fakeSession.checkRequest('file:///etc/passwd')).toEqual({ cancel: true })
    expect(fakeSession.checkRequest('data:text/html;charset=utf-8,<h1>ok</h1>')).toEqual({
      cancel: false
    })
    expect(fakeSession.checkRequest('about:blank')).toEqual({ cancel: false })
    expect(fakeSession.emitDownload().prevented).toBe(true)
    expect(fakeSession.permissionRequestsDenied()).toBe(true)
    expect(fakeSession.permissionCheckResult()).toBe(false)
    expect(fakeSession.devicePermissionResult()).toBe(false)

    dispose()
    expect(fakeSession.isListenerAttached()).toBe(false)
  })
})

describe('TdsOffscreenCaptureRenderer pool lifecycle', () => {
  let clock: FakeClock
  let sessionHarness: FakeSessionHarness
  let createdWindows: FakeWindowHarness[]
  let sessionArgs: Array<{ partition: string; options: { cache: boolean } }>

  beforeEach(() => {
    clock = new FakeClock()
    sessionHarness = createFakeSession()
    createdWindows = []
    sessionArgs = []
  })

  afterEach(() => {
    mockTransportHandlers.clear()
    mockApp.removeAllListeners('before-quit')
  })

  function createRenderer(
    windowBehavior?: (id: number) => FakeWindowBehavior
  ): TdsOffscreenCaptureRenderer {
    return new TdsOffscreenCaptureRenderer({
      timers: clock.timers,
      now: clock.now,
      sessionFactory: (partition, options) => {
        sessionArgs.push({ partition, options })
        return sessionHarness.session
      },
      windowFactory: (options) => {
        const id = createdWindows.length + 1
        const harness = createFakeWindow(id, options, windowBehavior?.(id))
        createdWindows.push(harness)
        return harness.window
      }
    })
  }

  it('configures isolated ephemeral partition and hardened webPreferences, outputting JPEG and PNG', async () => {
    const renderer = createRenderer(() => ({
      jpegBytes: Buffer.from('jpeg-payload'),
      pngBytes: Buffer.from('png-payload')
    }))

    const jpegPromise = renderer.renderFrame({
      srcdoc: '<h1>Hello TDS</h1>',
      width: 400,
      height: 300,
      format: 'jpeg',
      quality: 72,
      settleMs: 100
    })
    await flushMicrotasks()
    await clock.advanceBy(100)
    const jpegResult = await jpegPromise

    expect(jpegResult.ok).toBe(true)
    expect(jpegResult.width).toBe(400)
    expect(jpegResult.height).toBe(300)
    expect(jpegResult.bitmapDataUrl).toBe(
      `data:image/jpeg;base64,${Buffer.from('jpeg-payload').toString('base64')}`
    )
    expect(sessionArgs).toEqual([{ partition: TDS_CAPTURE_PARTITION, options: { cache: false } }])
    expect(createdWindows).toHaveLength(1)

    const win = createdWindows[0]!
    expect(win.options.webPreferences).toMatchObject({
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      webviewTag: false,
      backgroundThrottling: false,
      session: sessionHarness.session
    })
    expect(win.windowOpenHandler?.({ url: 'https://evil.com' })).toEqual({ action: 'deny' })
    expect(win.jpegQualities).toEqual([72])

    // Verify will-navigate blocks external URLs and allows data:/about:
    let navPrevented = false
    win.emitter.emit(
      'will-navigate',
      {
        preventDefault: () => {
          navPrevented = true
        }
      },
      'https://evil.com/escape'
    )
    expect(navPrevented).toBe(true)

    // Second render with PNG and new size reuses warm slot and calls setContentSize
    const pngPromise = renderer.renderFrame({
      srcdoc: '<h1>PNG Frame</h1>',
      width: 640,
      height: 480,
      format: 'png',
      settleMs: 0
    })
    const pngResult = await pngPromise
    expect(pngResult.ok).toBe(true)
    expect(pngResult.bitmapDataUrl).toBe(
      `data:image/png;base64,${Buffer.from('png-payload').toString('base64')}`
    )
    expect(createdWindows).toHaveLength(1)
    expect(win.contentSizes).toEqual([{ width: 640, height: 480 }])

    renderer.disposeAll()
  })

  it('forwards domProbeScript results with userGesture=true and skips capturePage when format=none', async () => {
    const probePayload = {
      issues: [{ id: 'contrast-1', severity: 'warn', message: 'Low contrast' }],
      nodesChecked: 42
    }
    const renderer = createRenderer(() => ({
      onExecuteJs: () => probePayload
    }))

    const result = await renderer.renderFrame({
      srcdoc: '<div>Audit me</div>',
      width: 390,
      height: 844,
      format: 'none',
      settleMs: 0,
      domProbeScript: '(() => ({ probed: true }))()'
    })

    expect(result.ok).toBe(true)
    expect(result.bitmapDataUrl).toBeUndefined()
    expect(result.domProbeResult).toEqual(probePayload)
    expect(createdWindows[0]!.capturedRects).toHaveLength(0)
    expect(createdWindows[0]!.executedScripts).toEqual([
      { code: '(() => ({ probed: true }))()', userGesture: true }
    ])

    renderer.disposeAll()
  })

  it('catches domProbeScript errors gracefully while preserving bitmap capture when format != none', async () => {
    const renderer = createRenderer(() => ({
      onExecuteJs: () => {
        throw new Error('SyntaxError: broken probe')
      },
      jpegBytes: Buffer.from('still-captured')
    }))

    const withBitmap = await renderer.renderFrame({
      srcdoc: '<p>ok</p>',
      width: 320,
      height: 240,
      format: 'jpeg',
      settleMs: 0,
      domProbeScript: 'invalid((('
    })
    expect(withBitmap.ok).toBe(true)
    expect(withBitmap.bitmapDataUrl).toBe(
      `data:image/jpeg;base64,${Buffer.from('still-captured').toString('base64')}`
    )
    expect(withBitmap.domProbeResult).toBeUndefined()
    expect(withBitmap.error).toContain('DOM_PROBE_FAILED')

    const probeOnly = await renderer.renderFrame({
      srcdoc: '<p>ok</p>',
      width: 320,
      height: 240,
      format: 'none',
      settleMs: 0,
      domProbeScript: 'invalid((('
    })
    expect(probeOnly.ok).toBe(false)
    expect(probeOnly.error).toContain('DOM_PROBE_FAILED')

    renderer.disposeAll()
  })

  it('enforces MAX_CONCURRENT_SLOTS = 2 and queues excess requests FIFO', async () => {
    const loadResolvers: Array<{ url: string; finish: () => void }> = []
    const startOrder: string[] = []
    const renderer = createRenderer(() => ({
      onLoad: (url, emitter) => {
        const decoded = decodeURIComponent(url.replace('data:text/html;charset=utf-8,', ''))
        const label = /req-\d+/.exec(decoded)?.[0] ?? decoded
        startOrder.push(label)
        return new Promise<void>((resolve) => {
          loadResolvers.push({
            url: label,
            finish: () => {
              emitter.emit('did-finish-load')
              resolve()
            }
          })
        })
      }
    }))

    const p1 = renderer.renderFrame({ srcdoc: 'req-1', width: 320, height: 240, settleMs: 0 })
    const p2 = renderer.renderFrame({ srcdoc: 'req-2', width: 320, height: 240, settleMs: 0 })
    const p3 = renderer.renderFrame({ srcdoc: 'req-3', width: 320, height: 240, settleMs: 0 })
    const p4 = renderer.renderFrame({ srcdoc: 'req-4', width: 320, height: 240, settleMs: 0 })
    await flushMicrotasks()

    expect(MAX_CONCURRENT_SLOTS).toBe(2)
    expect(createdWindows).toHaveLength(2)
    expect(renderer.getActiveSlotCount()).toBe(2)
    expect(renderer.getQueueLength()).toBe(2)
    expect(startOrder).toEqual(['req-1', 'req-2'])

    // Finish req-1 -> req-3 immediately acquires the freed slot
    loadResolvers[0]!.finish()
    await flushMicrotasks(8)
    expect((await p1).ok).toBe(true)
    expect(startOrder).toEqual(['req-1', 'req-2', 'req-3'])
    expect(renderer.getQueueLength()).toBe(1)

    // Finish req-2 -> req-4 immediately acquires the second slot
    loadResolvers[1]!.finish()
    await flushMicrotasks(8)
    expect((await p2).ok).toBe(true)
    expect(startOrder).toEqual(['req-1', 'req-2', 'req-3', 'req-4'])
    expect(renderer.getQueueLength()).toBe(0)

    // Finish req-3 and req-4
    loadResolvers[2]!.finish()
    loadResolvers[3]!.finish()
    await flushMicrotasks(8)

    expect((await p3).ok).toBe(true)
    expect((await p4).ok).toBe(true)
    expect(createdWindows).toHaveLength(2)

    renderer.disposeAll()
  })

  it('recovers cleanly from timeouts by destroying the hung window and serving subsequent requests', async () => {
    const renderer = createRenderer((id) =>
      id === 1
        ? {
            // First window hangs forever during loadURL
            onLoad: () => new Promise<void>(() => {})
          }
        : {}
    )

    const hungPromise = renderer.renderFrame({
      srcdoc: '<script>while(true){}</script>',
      width: 400,
      height: 300,
      timeoutMs: 1_500,
      settleMs: 0
    })
    await flushMicrotasks()
    expect(renderer.getActiveSlotCount()).toBe(1)

    await clock.advanceBy(1_500)
    const hungResult = await hungPromise

    expect(hungResult.ok).toBe(false)
    expect(hungResult.error).toBe('TDS_CAPTURE_TIMEOUT:1500ms')
    expect(createdWindows[0]!.isDestroyed()).toBe(true)
    expect(renderer.getActiveSlotCount()).toBe(0)

    // Follow-up request spawns a fresh window and succeeds cleanly
    const recovered = await renderer.renderFrame({
      srcdoc: '<p>recovered</p>',
      width: 400,
      height: 300,
      settleMs: 0
    })
    expect(recovered.ok).toBe(true)
    expect(createdWindows).toHaveLength(2)
    expect(createdWindows[1]!.isDestroyed()).toBe(false)

    renderer.disposeAll()
  })

  it('destroys idle hidden windows after 30s TTL and resets TTL on reuse', async () => {
    const renderer = createRenderer()

    const first = await renderer.renderFrame({
      srcdoc: '<p>first</p>',
      width: 300,
      height: 200,
      settleMs: 0
    })
    expect(first.ok).toBe(true)
    expect(renderer.getActiveSlotCount()).toBe(1)

    // Still warm right before 30s
    await clock.advanceBy(IDLE_TTL_MS - 1)
    expect(createdWindows[0]!.isDestroyed()).toBe(false)
    expect(renderer.getActiveSlotCount()).toBe(1)

    // Reusing resets idle timer
    const second = await renderer.renderFrame({
      srcdoc: '<p>second</p>',
      width: 300,
      height: 200,
      settleMs: 0
    })
    expect(second.ok).toBe(true)
    expect(createdWindows).toHaveLength(1)

    // Advance 20s -> still alive
    await clock.advanceBy(20_000)
    expect(createdWindows[0]!.isDestroyed()).toBe(false)

    // Advance remaining 10s -> idle TTL expires and destroys hidden window
    await clock.advanceBy(10_000)
    expect(createdWindows[0]!.isDestroyed()).toBe(true)
    expect(renderer.getActiveSlotCount()).toBe(0)
    expect(clock.pendingCount()).toBe(0)

    renderer.disposeAll()
  })

  it('releases pinned sessions cleanly via releaseSession', async () => {
    const renderer = createRenderer()
    await renderer.renderFrame({
      srcdoc: '<p>session-a</p>',
      width: 300,
      height: 200,
      sessionKey: 'frame-a',
      settleMs: 0
    })
    expect(renderer.getActiveSlotCount()).toBe(1)
    expect(renderer.releaseSession('unknown-session')).toEqual({ released: false })
    expect(renderer.releaseSession('frame-a')).toEqual({ released: true })
    expect(createdWindows[0]!.isDestroyed()).toBe(true)
    expect(renderer.getActiveSlotCount()).toBe(0)
    expect(clock.pendingCount()).toBe(0)

    renderer.disposeAll()
  })

  it('cleans up all windows, queued waiters, timers, and session hooks on disposeAll()', async () => {
    const renderer = createRenderer(() => ({
      onLoad: () => new Promise<void>(() => {})
    }))

    const p1 = renderer.renderFrame({ srcdoc: '1', width: 320, height: 240, settleMs: 0 })
    const p2 = renderer.renderFrame({ srcdoc: '2', width: 320, height: 240, settleMs: 0 })
    const p3 = renderer.renderFrame({ srcdoc: '3', width: 320, height: 240, settleMs: 0 })
    await flushMicrotasks()

    expect(createdWindows).toHaveLength(2)
    expect(renderer.getQueueLength()).toBe(1)
    expect(sessionHarness.isListenerAttached()).toBe(true)

    renderer.disposeAll()

    const [r1, r2, r3] = await Promise.all([p1, p2, p3])
    expect(r1.ok).toBe(false)
    expect(r2.ok).toBe(false)
    expect(r3.ok).toBe(false)
    expect(r3.error).toBe('TDS_CAPTURE_DISPOSED')
    expect(createdWindows[0]!.isDestroyed()).toBe(true)
    expect(createdWindows[1]!.isDestroyed()).toBe(true)
    expect(renderer.getActiveSlotCount()).toBe(0)
    expect(renderer.getQueueLength()).toBe(0)
    expect(sessionHarness.isListenerAttached()).toBe(false)
    expect(clock.pendingCount()).toBe(0)

    const afterDispose = await renderer.renderFrame({
      srcdoc: 'after',
      width: 320,
      height: 240
    })
    expect(afterDispose.ok).toBe(false)
    expect(afterDispose.error).toBe('TDS_CAPTURE_DISPOSED')
    expect(createdWindows).toHaveLength(2)
  })
})

describe('TdsCaptureModule & createTdsCaptureSdk integration', () => {
  afterEach(() => {
    mockTransportHandlers.clear()
    mockApp.removeAllListeners('before-quit')
  })

  it('registers transport handlers, round-trips SDK calls, blocks plugin callers, and cleans up on destroy', async () => {
    const clock = new FakeClock()
    const fakeSession = createFakeSession()
    const windows: FakeWindowHarness[] = []

    const mod = new TdsCaptureModule({
      timers: clock.timers,
      now: clock.now,
      sessionFactory: () => fakeSession.session,
      windowFactory: (options) => {
        const harness = createFakeWindow(windows.length + 1, options)
        windows.push(harness)
        return harness.window
      }
    })

    mod.onInit({} as ModuleInitContext<TalexEvents>)

    const appContext = { sender: { id: 1 } } as unknown as HandlerContext
    const sdk = createTdsCaptureSdk({
      send: (async (event: { toEventName: () => string }, payload?: unknown) => {
        const handler = mockTransportHandlers.get(event.toEventName())
        if (!handler) throw new Error(`No handler for ${event.toEventName()}`)
        return await handler(payload, appContext)
      }) as Parameters<typeof createTdsCaptureSdk>[0]['send']
    })

    const frame = await sdk.renderFrame({
      srcdoc: '<h1>SDK OK</h1>',
      width: 360,
      height: 640,
      format: 'png',
      sessionKey: 'canvas-1',
      settleMs: 0
    })
    expect(frame.ok).toBe(true)
    expect(frame.bitmapDataUrl).toMatch(/^data:image\/png;base64,/)
    expect(windows).toHaveLength(1)

    const release = await sdk.releaseSession('canvas-1')
    expect(release).toEqual({ released: true })
    expect(windows[0]!.isDestroyed()).toBe(true)

    // Untrusted plugin caller must be rejected
    const renderHandler = mockTransportHandlers.get(TdsCaptureEvents.renderFrame.toEventName())!
    await expect(
      renderHandler({ srcdoc: '<p>x</p>', width: 320, height: 240 }, {
        sender: { id: 2 },
        plugin: { name: 'untrusted' }
      } as unknown as HandlerContext)
    ).rejects.toThrow('TDS_CAPTURE_HOST_ONLY')

    mod.onDestroy({} as ModuleDestroyContext<TalexEvents>)
    expect(mockTransportHandlers.size).toBe(0)
    expect(fakeSession.isListenerAttached()).toBe(false)
    expect(clock.pendingCount()).toBe(0)
  })

  it('disposes offscreen windows immediately on app before-quit', async () => {
    const clock = new FakeClock()
    const fakeSession = createFakeSession()
    const windows: FakeWindowHarness[] = []

    const mod = new TdsCaptureModule({
      timers: clock.timers,
      now: clock.now,
      sessionFactory: () => fakeSession.session,
      windowFactory: (options) => {
        const harness = createFakeWindow(windows.length + 1, options)
        windows.push(harness)
        return harness.window
      }
    })

    mod.onInit({} as ModuleInitContext<TalexEvents>)
    const renderHandler = mockTransportHandlers.get(TdsCaptureEvents.renderFrame.toEventName())!
    await renderHandler({ srcdoc: '<p>warm</p>', width: 320, height: 240, settleMs: 0 }, {
      sender: { id: 1 }
    } as unknown as HandlerContext)
    expect(windows).toHaveLength(1)
    expect(windows[0]!.isDestroyed()).toBe(false)

    mockApp.emit('before-quit')
    expect(windows[0]!.isDestroyed()).toBe(true)
    expect(clock.pendingCount()).toBe(0)

    mod.onDestroy({} as ModuleDestroyContext<TalexEvents>)
  })

  it('enforces WebRTC egress policy + strict CSP headers & document meta in capture partition', async () => {
    const clock = new FakeClock()
    const fakeSession = createFakeSession()
    const windows: FakeWindowHarness[] = []

    const renderer = new TdsOffscreenCaptureRenderer({
      timers: clock.timers,
      now: clock.now,
      sessionFactory: () => fakeSession.session,
      windowFactory: (options) => {
        const harness = createFakeWindow(windows.length + 1, options)
        windows.push(harness)
        return harness.window
      }
    })

    const res = await renderer.renderFrame({
      srcdoc: '<!doctype html><html><head><title>x</title></head><body>Hi</body></html>',
      width: 400,
      height: 600,
      settleMs: 0
    })
    expect(res.ok).toBe(true)
    expect(windows[0]!.webRtcPolicies).toEqual(['disable_non_proxied_udp'])

    const headers = fakeSession.checkResponseHeaders('data:text/html;charset=utf-8,x', {
      'Content-Security-Policy': ['default-src *']
    })
    expect(headers?.['Content-Security-Policy']).toEqual([TDS_CAPTURE_CSP])
    expect(TDS_CAPTURE_CSP).toContain("connect-src 'none'")
    expect(TDS_CAPTURE_CSP).toContain("form-action 'none'")

    const decodedLoaded = decodeURIComponent(windows[0]!.loadedUrls[0]!)
    expect(decodedLoaded).toContain(TDS_CAPTURE_CSP)
    expect(injectCaptureCsp('<p>bare</p>')).toContain(TDS_CAPTURE_CSP)

    renderer.disposeAll()
  })

  it('applies requested DPR on cold capture & slot reuse, and replaces slot when emulation is unavailable', async () => {
    const clock = new FakeClock()
    const fakeSession = createFakeSession()
    const windows: FakeWindowHarness[] = []

    const renderer = new TdsOffscreenCaptureRenderer({
      timers: clock.timers,
      now: clock.now,
      sessionFactory: () => fakeSession.session,
      windowFactory: (options) => {
        const harness = createFakeWindow(windows.length + 1, options)
        windows.push(harness)
        return harness.window
      }
    })

    const cold = await renderer.renderFrame({
      srcdoc: '<p>dpr2</p>',
      width: 390,
      height: 844,
      pixelRatio: 2,
      sessionKey: 's-dpr',
      settleMs: 0
    })
    expect(cold.ok).toBe(true)
    expect(windows).toHaveLength(1)
    expect(windows[0]!.emulationCalls).toHaveLength(1)
    expect(windows[0]!.emulationCalls[0]!.deviceScaleFactor).toBe(2)

    // Reusing the same slot with DPR 1 reconfigures device emulation without recreating the window
    const reused = await renderer.renderFrame({
      srcdoc: '<p>dpr1</p>',
      width: 390,
      height: 844,
      pixelRatio: 1,
      sessionKey: 's-dpr',
      settleMs: 0
    })
    expect(reused.ok).toBe(true)
    expect(windows).toHaveLength(1)
    expect(windows[0]!.emulationCalls).toHaveLength(2)
    expect(windows[0]!.emulationCalls[1]!.deviceScaleFactor).toBe(1)
    renderer.disposeAll()

    // Without enableDeviceEmulation, DPR change replaces the window cleanly
    const legacyWindows: FakeWindowHarness[] = []
    const legacyRenderer = new TdsOffscreenCaptureRenderer({
      timers: clock.timers,
      now: clock.now,
      sessionFactory: () => createFakeSession().session,
      windowFactory: (options) => {
        const harness = createFakeWindow(legacyWindows.length + 1, options, {
          supportsDeviceEmulation: false
        })
        legacyWindows.push(harness)
        return harness.window
      }
    })
    await legacyRenderer.renderFrame({
      srcdoc: '<p>a</p>',
      width: 320,
      height: 480,
      pixelRatio: 1,
      sessionKey: 's-legacy',
      settleMs: 0
    })
    await legacyRenderer.renderFrame({
      srcdoc: '<p>b</p>',
      width: 320,
      height: 480,
      pixelRatio: 2,
      sessionKey: 's-legacy',
      settleMs: 0
    })
    expect(legacyWindows).toHaveLength(2)
    expect(legacyWindows[0]!.isDestroyed()).toBe(true)
    expect(legacyWindows[1]!.options.pixelRatio).toBe(2)
    legacyRenderer.disposeAll()
  })

  it('rejects queued waiters for a released session while keeping other sessions queued', async () => {
    const clock = new FakeClock()
    const fakeSession = createFakeSession()
    const pendingLoads: Array<() => void> = []

    const renderer = new TdsOffscreenCaptureRenderer({
      maxConcurrentSlots: 1,
      timers: clock.timers,
      now: clock.now,
      sessionFactory: () => fakeSession.session,
      windowFactory: (options) =>
        createFakeWindow(pendingLoads.length + 1, options, {
          onLoad: (_url, emitter) => {
            pendingLoads.push(() => emitter.emit('did-finish-load'))
          }
        }).window
    })

    const active = renderer.renderFrame({
      srcdoc: '<p>active</p>',
      width: 320,
      height: 240,
      sessionKey: 'session-a',
      settleMs: 0
    })
    await flushMicrotasks()

    const queuedA = renderer.renderFrame({
      srcdoc: '<p>queued-a</p>',
      width: 320,
      height: 240,
      sessionKey: 'session-a',
      settleMs: 0
    })
    const queuedB = renderer.renderFrame({
      srcdoc: '<p>queued-b</p>',
      width: 320,
      height: 240,
      sessionKey: 'session-b',
      settleMs: 0
    })
    await flushMicrotasks()
    expect(renderer.getQueueLength()).toBe(2)

    const releaseRes = renderer.releaseSession('session-a')
    expect(releaseRes).toEqual({ released: true })
    expect(renderer.getQueueLength()).toBe(1)

    const queuedARes = await queuedA
    expect(queuedARes.ok).toBe(false)
    expect(queuedARes.error).toBe('TDS_CAPTURE_SESSION_RELEASED')

    // Finish active load -> session-b waiter gets served normally
    pendingLoads.shift()!()
    await flushMicrotasks(12)
    pendingLoads.shift()!()
    await flushMicrotasks(12)

    const [activeRes, queuedBRes] = await Promise.all([active, queuedB])
    expect(activeRes.ok).toBe(true)
    expect(queuedBRes.ok).toBe(true)

    renderer.disposeAll()
  })

  it('enforces bounded waitQueue capacity and expires queued requests past admission deadline', async () => {
    const clock = new FakeClock()
    const fakeSession = createFakeSession()
    const pendingLoads: Array<() => void> = []

    const renderer = new TdsOffscreenCaptureRenderer({
      maxConcurrentSlots: 1,
      maxWaitQueueLength: 2,
      timers: clock.timers,
      now: clock.now,
      sessionFactory: () => fakeSession.session,
      windowFactory: (options) =>
        createFakeWindow(pendingLoads.length + 1, options, {
          onLoad: (_url, emitter) => {
            pendingLoads.push(() => emitter.emit('did-finish-load'))
          }
        }).window
    })

    expect(MAX_WAIT_QUEUE_LENGTH).toBe(16)

    const active = renderer.renderFrame({
      srcdoc: '<p>slot-busy</p>',
      width: 320,
      height: 240,
      timeoutMs: 10_000,
      settleMs: 0
    })
    await flushMicrotasks()

    const q1 = renderer.renderFrame({
      srcdoc: '<p>q1-expires</p>',
      width: 320,
      height: 240,
      timeoutMs: 1_500,
      settleMs: 0
    })
    const q2 = renderer.renderFrame({
      srcdoc: '<p>q2-survives</p>',
      width: 320,
      height: 240,
      timeoutMs: 8_000,
      settleMs: 0
    })
    await flushMicrotasks()
    expect(renderer.getQueueLength()).toBe(2)

    // Third queued request exceeds maxWaitQueueLength=2 -> immediate distinct overflow error
    const overflow = await renderer.renderFrame({
      srcdoc: '<p>overflow</p>',
      width: 320,
      height: 240,
      timeoutMs: 5_000,
      settleMs: 0
    })
    expect(overflow.ok).toBe(false)
    expect(overflow.error).toBe('TDS_CAPTURE_QUEUE_OVERFLOW:2')

    // Advance past q1's 1500ms admission deadline while slot is still busy -> q1 expires & leaves queue
    await clock.advanceBy(1_600)
    const q1Res = await q1
    expect(q1Res.ok).toBe(false)
    expect(q1Res.error).toBe('TDS_CAPTURE_QUEUE_TIMEOUT:1500ms')
    expect(renderer.getQueueLength()).toBe(1)

    // Release active slot -> q2 runs and completes cleanly
    pendingLoads.shift()!()
    await flushMicrotasks(12)
    pendingLoads.shift()!()
    await flushMicrotasks(12)

    const [activeRes, q2Res] = await Promise.all([active, q2])
    expect(activeRes.ok).toBe(true)
    expect(q2Res.ok).toBe(true)

    renderer.disposeAll()
  })
})

function makeSampleCanvasSession(
  overrides: Partial<TdsCanvasSessionData> = {}
): TdsCanvasSessionData {
  return {
    version: 1,
    frames: [
      {
        id: 'frame-1',
        title: 'Dashboard',
        kind: 'html',
        source: '<!doctype html><html><body><h1>Dashboard</h1></body></html>',
        deviceId: 'desktop-hd',
        showShell: true,
        x: 180,
        y: 96,
        sourceRef: 'message:asst-1'
      }
    ],
    notes: [
      {
        id: 'note-1',
        frameId: 'frame-1',
        xRatio: 0.45,
        yRatio: 0.3,
        text: 'Tighten card padding',
        resolved: false,
        createdAt: 1700000000100
      }
    ],
    selectedFrameId: 'frame-1',
    history: {
      blobs: {
        h1: '<!doctype html><html><body><h1>Snapshot 1</h1></body></html>'
      },
      entries: [
        {
          id: 'hist-1',
          label: 'Initial layout',
          createdAt: 1700000000050,
          frameSnapshots: [
            {
              id: 'frame-1',
              title: 'Dashboard',
              kind: 'html',
              deviceId: 'desktop-hd',
              showShell: true,
              x: 0,
              y: 0,
              sourceHash: 'h1'
            }
          ]
        }
      ],
      cursor: 0
    },
    deletedAutoFrameIds: ['asst-0:fence:0'],
    antiSlop: false,
    canvasThemePackId: 'tds-paper-ink',
    ...overrides
  }
}

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../resources/db/migrations'
)

interface CanvasStoreTestEnv {
  tempDir: string
  rootPath: string
  dbPath: string
  legacyDir: string
  client: Client
  db: MainDatabase
  scheduleWrite: <T>(label: string, op: () => Promise<T>) => Promise<T>
}

describe('TdsCanvasSessionStore & host-only persistence IPC', () => {
  const activeEnvs: CanvasStoreTestEnv[] = []

  async function createStoreEnv(): Promise<CanvasStoreTestEnv> {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tds-canvas-store-test-'))
    const rootPath = path.join(tempDir, 'root')
    const legacyDir = path.join(tempDir, 'legacy-tds-canvas-sessions')
    const dbPath = path.join(tempDir, 'test.db')
    const client = createClient({ url: `file:${dbPath}` })
    const db = drizzle(client, { schema })
    await migrate(db, { migrationsFolder })
    const env: CanvasStoreTestEnv = {
      tempDir,
      rootPath,
      dbPath,
      legacyDir,
      client,
      db,
      scheduleWrite: async (_label, op) => await op()
    }
    activeEnvs.push(env)
    return env
  }

  afterEach(async () => {
    vi.restoreAllMocks()
    mockTransportHandlers.clear()
    mockApp.removeAllListeners('before-quit')
    while (activeEnvs.length > 0) {
      const env = activeEnvs.pop()!
      env.client.close()
      await rm(env.tempDir, { recursive: true, force: true })
    }
  })

  it('encrypts sessions into SQLite via secure-store across restarts with zero plaintext on disk', async () => {
    const env = await createStoreEnv()
    let nowMs = 10_000
    const storeA = new TdsCanvasSessionStore({
      getDb: () => env.db,
      scheduleWrite: env.scheduleWrite,
      rootPath: env.rootPath,
      legacyStorageDir: env.legacyDir,
      now: () => nowMs
    })

    const conversationId = '../conv/secret:id?v=1'
    const canaryFrame = 'CANARY-FRAME-SECRET-8841'
    const canaryNote = 'CANARY-NOTE-SECRET-9912'
    const canaryHistory = 'CANARY-HIST-SECRET-4477'
    const sample = makeSampleCanvasSession({
      frames: [
        {
          ...makeSampleCanvasSession().frames[0]!,
          source: `<!doctype html><html><body><h1>${canaryFrame}</h1></body></html>`
        }
      ],
      notes: [
        {
          ...makeSampleCanvasSession().notes[0]!,
          text: canaryNote
        }
      ],
      history: {
        ...makeSampleCanvasSession().history,
        blobs: {
          h1: `<!doctype html><html><body><h1>${canaryHistory}</h1></body></html>`
        }
      }
    })

    const saveRes = await storeA.save(conversationId, sample)
    expect(saveRes.ok).toBe(true)
    expect(saveRes.bytes).toBeGreaterThan(0)

    // Verify raw SQLite row stores ONLY hashed key and AES-256-GCM envelope with zero plaintext
    const expectedHash = hashCanvasConversationId(conversationId)!
    const rows = await env.client.execute({
      sql: 'SELECT key_hash, envelope, updated_at FROM tds_canvas_sessions',
      args: []
    })
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]?.key_hash).toBe(expectedHash)
    const rawEnvelope = String(rows.rows[0]?.envelope ?? '')
    const parsedEnvelope = JSON.parse(rawEnvelope) as {
      v: number
      backend: string
      alg: string
      c: string
    }
    expect(parsedEnvelope.v).toBe(1)
    expect(parsedEnvelope.backend).toBe('local-secret')
    expect(parsedEnvelope.alg).toBe('A256GCM')
    expect(rawEnvelope).not.toContain(canaryFrame)
    expect(rawEnvelope).not.toContain(canaryNote)
    expect(rawEnvelope).not.toContain(canaryHistory)
    expect(rawEnvelope).not.toContain(conversationId)

    // Verify raw SQLite database file contains zero plaintext as well
    const dbBytes = await readFile(env.dbPath, 'latin1')
    expect(dbBytes).not.toContain(canaryFrame)
    expect(dbBytes).not.toContain(canaryNote)
    expect(dbBytes).not.toContain(canaryHistory)
    expect(dbBytes).not.toContain('secret:id')

    if (process.platform !== 'win32') {
      const secretStats = await stat(path.join(env.rootPath, 'config', LOCAL_SECRET_FILE))
      expect(secretStats.mode & 0o777).toBe(0o600)
    }

    // Re-instantiate store to simulate a full process restart
    const storeB = new TdsCanvasSessionStore({
      getDb: () => env.db,
      scheduleWrite: env.scheduleWrite,
      rootPath: env.rootPath,
      legacyStorageDir: env.legacyDir,
      now: () => (nowMs += 100)
    })
    const loaded = await storeB.load(conversationId)
    expect(loaded.ok).toBe(true)
    expect(loaded.session).toEqual(sample)

    // Moving an envelope to another keyHash fails authentication with explicit error
    const otherHash = hashCanvasConversationId('other-conv')!
    await env.client.execute({
      sql: 'INSERT INTO tds_canvas_sessions (key_hash, envelope, updated_at) VALUES (?, ?, ?)',
      args: [otherHash, rawEnvelope, nowMs]
    })
    expect(await storeB.load('other-conv')).toEqual({
      ok: false,
      session: null,
      error: 'CANVAS_SESSION_DECRYPT_FAILED'
    })

    // Tampering ciphertext fails closed with explicit error without throwing
    const tampered = JSON.stringify({
      ...parsedEnvelope,
      c: `${parsedEnvelope.c[0] === 'A' ? 'B' : 'A'}${parsedEnvelope.c.slice(1)}`
    })
    await env.client.execute({
      sql: 'UPDATE tds_canvas_sessions SET envelope = ? WHERE key_hash = ?',
      args: [tampered, otherHash]
    })
    expect(await storeB.load('other-conv')).toEqual({
      ok: false,
      session: null,
      error: 'CANVAS_SESSION_DECRYPT_FAILED'
    })

    const deleted = await storeB.delete(conversationId)
    expect(deleted).toEqual({ ok: true, deleted: true })
    expect(await storeB.load(conversationId)).toEqual({ ok: true, session: null })

    // Corrupt root secret fails closed on save (never falls back to plaintext)
    await writeFile(path.join(env.rootPath, 'config', LOCAL_SECRET_FILE), 'bad-secret', 'utf8')
    const encryptFail = await storeB.save('conv-fail-closed', sample)
    expect(encryptFail.ok).toBe(false)
    expect(encryptFail.error).toBe('CANVAS_SESSION_ENCRYPT_FAILED')
  })

  it('cleans up legacy plaintext JSON files best-effort while ignoring symlinks and unrelated files', async () => {
    const env = await createStoreEnv()
    await mkdir(env.legacyDir, { recursive: true })
    const legacyHash = hashCanvasConversationId('legacy-conv')!
    const symlinkHash = hashCanvasConversationId('legacy-symlink')!
    const legacyJson = path.join(env.legacyDir, `${legacyHash}.json`)
    const legacyTmp = path.join(env.legacyDir, `${legacyHash}.1234.aabbcc.tmp`)
    const outsideTarget = path.join(env.tempDir, 'outside.txt')
    const symlinkFile = path.join(env.legacyDir, `${symlinkHash}.json`)
    const unrelatedFile = path.join(env.legacyDir, 'keep-me.txt')

    await writeFile(legacyJson, '{"plaintext":"secret"}', 'utf8')
    await writeFile(legacyTmp, 'partial', 'utf8')
    await writeFile(outsideTarget, 'do-not-delete', 'utf8')
    await writeFile(unrelatedFile, 'unrelated', 'utf8')
    await symlink(outsideTarget, symlinkFile)

    const store = new TdsCanvasSessionStore({
      getDb: () => env.db,
      scheduleWrite: env.scheduleWrite,
      rootPath: env.rootPath,
      legacyStorageDir: env.legacyDir
    })
    await store.cleanupLegacyPlaintextFiles()

    const remaining = await readdir(env.legacyDir)
    expect(remaining.sort()).toEqual([`${symlinkHash}.json`, 'keep-me.txt'].sort())
    expect(await readFile(outsideTarget, 'utf8')).toBe('do-not-delete')
  })

  it('sanitizes untrusted session payloads, strips prototype-polluting keys, and tolerates corrupt SQLite envelopes', async () => {
    const env = await createStoreEnv()
    const rawBlobs = JSON.parse(
      '{"good":"<p>ok</p>","__proto__":"evil","constructor":"evil","prototype":"evil","orphan":"<p>unused</p>"}'
    ) as Record<string, string>
    const polluted = {
      ...makeSampleCanvasSession(),
      extraField: 'should-be-stripped',
      notes: [
        {
          id: 'n1',
          frameId: 'frame-1',
          xRatio: 2.5,
          yRatio: -0.4,
          text: 'Clamped coords',
          resolved: 'yes',
          createdAt: Number.NaN
        }
      ],
      history: {
        blobs: rawBlobs,
        entries: [
          {
            id: 'e-valid',
            label: 'Valid',
            createdAt: 100,
            frameSnapshots: [
              {
                id: 'frame-1',
                title: 'Valid',
                kind: 'html',
                deviceId: 'desktop-hd',
                x: 0,
                y: 0,
                sourceHash: 'good'
              }
            ]
          },
          {
            id: 'e-missing-blob',
            label: 'Broken',
            createdAt: 200,
            frameSnapshots: [
              {
                id: 'frame-1',
                title: 'Broken',
                kind: 'html',
                deviceId: 'desktop-hd',
                x: 0,
                y: 0,
                sourceHash: 'does-not-exist'
              }
            ]
          }
        ],
        cursor: 99
      }
    }

    const sanitized = sanitizeCanvasSessionData(polluted)
    expect(sanitized.ok).toBe(true)
    if (sanitized.ok) {
      expect('extraField' in sanitized.session).toBe(false)
      expect(sanitized.session.notes[0]).toEqual({
        id: 'n1',
        frameId: 'frame-1',
        xRatio: 1,
        yRatio: 0,
        text: 'Clamped coords',
        resolved: false,
        createdAt: 0
      })
      expect(Object.keys(sanitized.session.history.blobs)).toEqual(['good'])
      expect(sanitized.session.history.entries.map((e) => e.id)).toEqual(['e-valid'])
      expect(sanitized.session.history.cursor).toBe(0)
    }

    // Corrupt/undecryptable payload in SQLite returns an error instead of masquerading as missing
    const store = new TdsCanvasSessionStore({
      getDb: () => env.db,
      scheduleWrite: env.scheduleWrite,
      rootPath: env.rootPath,
      legacyStorageDir: env.legacyDir
    })
    const hash = hashCanvasConversationId('conv-corrupt')!
    await env.client.execute({
      sql: 'INSERT INTO tds_canvas_sessions (key_hash, envelope, updated_at) VALUES (?, ?, ?)',
      args: [hash, '{broken-envelope', 1_000]
    })
    expect(await store.load('conv-corrupt')).toEqual({
      ok: false,
      session: null,
      error: 'CANVAS_SESSION_DECRYPT_FAILED'
    })
    // A genuinely absent conversation still returns ok: true, session: null
    expect(await store.load('conv-truly-missing')).toEqual({ ok: true, session: null })
  })

  it('preserves every retained snapshot blob for >128 distinct sources and prunes oldest snapshots past MAX_CANVAS_HISTORY_BLOBS', async () => {
    expect(MAX_CANVAS_HISTORY_ENTRIES).toBe(50)
    expect(MAX_CANVAS_HISTORY_BLOBS).toBe(512)

    const env = await createStoreEnv()
    const store = new TdsCanvasSessionStore({
      getDb: () => env.db,
      scheduleWrite: env.scheduleWrite,
      rootPath: env.rootPath,
      legacyStorageDir: env.legacyDir
    })

    // 40 snapshots x 4 distinct frames = 160 distinct referenced blobs (> 128 legacy cap)
    const blobs160: Record<string, string> = {}
    const entries40 = Array.from({ length: 40 }, (_, snapIdx) => ({
      id: `snap-${snapIdx}`,
      label: `Snapshot ${snapIdx}`,
      createdAt: 1000 + snapIdx,
      frameSnapshots: Array.from({ length: 4 }, (_, frameIdx) => {
        const hash = `h-${snapIdx}-${frameIdx}`
        blobs160[hash] = `<p>snap=${snapIdx},frame=${frameIdx}</p>`
        return {
          id: `f-${frameIdx}`,
          title: `Frame ${frameIdx}`,
          kind: 'html' as const,
          deviceId: 'desktop-hd',
          x: frameIdx * 100,
          y: 0,
          sourceHash: hash
        }
      })
    }))

    const session160 = makeSampleCanvasSession({
      history: {
        blobs: blobs160,
        entries: entries40,
        cursor: 39
      }
    })
    expect((await store.save('conv-160-blobs', session160)).ok).toBe(true)

    const reloaded = await store.load('conv-160-blobs')
    expect(reloaded.ok).toBe(true)
    expect(reloaded.session?.history.entries).toHaveLength(40)
    expect(Object.keys(reloaded.session?.history.blobs ?? {})).toHaveLength(160)
    for (const entry of reloaded.session!.history.entries) {
      for (const snap of entry.frameSnapshots) {
        expect(reloaded.session!.history.blobs[snap.sourceHash]).toBe(blobs160[snap.sourceHash])
      }
    }

    // 30 snapshots x 20 distinct frames = 600 distinct blobs (> MAX_CANVAS_HISTORY_BLOBS = 512)
    // Oldest snapshots must be pruned so ZERO retained snapshot references a dropped blob.
    const blobs600: Record<string, string> = {}
    const entries30 = Array.from({ length: 30 }, (_, snapIdx) => ({
      id: `big-${snapIdx}`,
      label: `Big ${snapIdx}`,
      createdAt: 2000 + snapIdx,
      frameSnapshots: Array.from({ length: 20 }, (_, frameIdx) => {
        const hash = `big-${snapIdx}-${frameIdx}`
        blobs600[hash] = `<div>${snapIdx}:${frameIdx}</div>`
        return {
          id: `bf-${frameIdx}`,
          title: `Big Frame ${frameIdx}`,
          kind: 'html' as const,
          deviceId: 'desktop-hd',
          x: 0,
          y: 0,
          sourceHash: hash
        }
      })
    }))

    const pruned = sanitizeCanvasSessionData(
      makeSampleCanvasSession({
        history: { blobs: blobs600, entries: entries30, cursor: 29 }
      })
    )
    expect(pruned.ok).toBe(true)
    if (pruned.ok) {
      expect(pruned.session.history.entries.length).toBe(25)
      expect(pruned.session.history.entries[0]?.id).toBe('big-5')
      expect(pruned.session.history.entries.at(-1)?.id).toBe('big-29')
      expect(Object.keys(pruned.session.history.blobs).length).toBeLessThanOrEqual(
        MAX_CANVAS_HISTORY_BLOBS
      )
      for (const entry of pruned.session.history.entries) {
        for (const snap of entry.frameSnapshots) {
          expect(pruned.session.history.blobs[snap.sourceHash]).toBe(blobs600[snap.sourceHash])
        }
      }
    }
  })

  it('rejects over-limit frame snapshots with CANVAS_SESSION_FRAME_LIMIT while keeping previous session intact', async () => {
    expect(MAX_CANVAS_FRAMES).toBe(64)
    const env = await createStoreEnv()
    const store = new TdsCanvasSessionStore({
      getDb: () => env.db,
      scheduleWrite: env.scheduleWrite,
      rootPath: env.rootPath,
      legacyStorageDir: env.legacyDir
    })

    const initial = makeSampleCanvasSession()
    expect((await store.save('conv-frame-limit', initial)).ok).toBe(true)

    const tooManyFrames = makeSampleCanvasSession({
      frames: Array.from({ length: MAX_CANVAS_FRAMES + 1 }, (_, index) => ({
        id: `frame-${index}`,
        title: `Frame ${index}`,
        kind: 'html' as const,
        source: `<p>${index}</p>`,
        deviceId: 'desktop-hd',
        x: index * 10,
        y: 0
      }))
    })
    const frameLimitRes = await store.save('conv-frame-limit', tooManyFrames)
    expect(frameLimitRes.ok).toBe(false)
    expect(frameLimitRes.error).toContain('CANVAS_SESSION_FRAME_LIMIT')

    // Previous saved session must remain intact
    expect((await store.load('conv-frame-limit')).session).toEqual(initial)

    // History snapshot exceeding MAX_CANVAS_FRAMES also rejects cleanly
    const overLimitHistory = makeSampleCanvasSession({
      history: {
        blobs: { shared: '<p>x</p>' },
        entries: [
          {
            id: 'hist-over',
            label: 'Over limit',
            createdAt: 1,
            frameSnapshots: Array.from({ length: MAX_CANVAS_FRAMES + 1 }, (_, index) => ({
              id: `hf-${index}`,
              title: `H ${index}`,
              kind: 'html' as const,
              deviceId: 'desktop-hd',
              x: 0,
              y: 0,
              sourceHash: 'shared'
            }))
          }
        ],
        cursor: 0
      }
    })
    const historyLimitRes = await store.save('conv-frame-limit', overLimitHistory)
    expect(historyLimitRes.ok).toBe(false)
    expect(historyLimitRes.error).toContain('CANVAS_SESSION_FRAME_LIMIT')
    expect((await store.load('conv-frame-limit')).session).toEqual(initial)
  })

  it('enforces pre-stringify byte budget, exact UTF-8 byte bounds, and LRU eviction across restarts', async () => {
    expect(MAX_CANVAS_SESSIONS).toBe(20)
    expect(MAX_CANVAS_SESSION_BYTES).toBe(4 * 1024 * 1024)

    const env = await createStoreEnv()
    let clockMs = 1_000
    const store = new TdsCanvasSessionStore({
      getDb: () => env.db,
      scheduleWrite: env.scheduleWrite,
      rootPath: env.rootPath,
      legacyStorageDir: env.legacyDir,
      maxSessions: 2,
      maxSessionBytes: 4 * 1024,
      now: () => (clockMs += 100)
    })

    const initial = makeSampleCanvasSession()
    expect((await store.save('conv-1', initial)).ok).toBe(true)

    // Aggregate frame + note + blob bytes > 4 KiB -> rejected BEFORE calling JSON.stringify
    const oversized = makeSampleCanvasSession({
      frames: [
        {
          ...initial.frames[0]!,
          source: `<p>${'x'.repeat(5_000)}</p>`
        }
      ]
    })
    expect(estimateCanvasSessionLowerBoundBytes(oversized)).toBeGreaterThan(4 * 1024)
    const stringifySpy = vi.spyOn(JSON, 'stringify')
    const oversizedRes = await store.save('conv-1', oversized)
    expect(oversizedRes.ok).toBe(false)
    expect(oversizedRes.error).toContain('CANVAS_SESSION_TOO_LARGE')
    expect(stringifySpy).not.toHaveBeenCalled()
    stringifySpy.mockRestore()
    expect((await store.load('conv-1')).session).toEqual(initial)

    // Borderline session: lower bound <= 4096, but full serialized JSON envelope > 4096 -> still rejected
    const borderline = makeSampleCanvasSession({
      frames: [
        {
          ...initial.frames[0]!,
          source: 'a'.repeat(3_600)
        }
      ]
    })
    expect(estimateCanvasSessionLowerBoundBytes(borderline)).toBeLessThanOrEqual(4 * 1024)
    const borderlineRes = await store.save('conv-1', borderline)
    expect(borderlineRes.ok).toBe(false)
    expect(borderlineRes.error).toContain('CANVAS_SESSION_TOO_LARGE')
    expect((await store.load('conv-1')).session).toEqual(initial)

    // Save conv-2, then touch conv-1 via load() so conv-2 becomes oldest LRU
    expect(
      (
        await store.save(
          'conv-2',
          makeSampleCanvasSession({ canvasThemePackId: 'tds-obsidian-cobalt' })
        )
      ).ok
    ).toBe(true)
    expect((await store.load('conv-1')).session?.canvasThemePackId).toBe('tds-paper-ink')

    // Saving conv-3 exceeds maxSessions=2 -> evicts conv-2, keeps conv-1 and conv-3
    expect(
      (
        await store.save(
          'conv-3',
          makeSampleCanvasSession({ canvasThemePackId: 'tds-graphite-emerald' })
        )
      ).ok
    ).toBe(true)
    expect(await store.getStoredSessionCount()).toBe(2)
    expect((await store.load('conv-2')).session).toBeNull()
    expect((await store.load('conv-1')).session?.canvasThemePackId).toBe('tds-paper-ink')
    expect((await store.load('conv-3')).session?.canvasThemePackId).toBe('tds-graphite-emerald')
  })

  it('retains index tracking and surfaces cleanup failures when SQLite delete or eviction fails', async () => {
    const env = await createStoreEnv()
    let clockMs = 1_000
    let failLabel: string | null = null
    const store = new TdsCanvasSessionStore({
      getDb: () => env.db,
      scheduleWrite: async (label, op) => {
        if (failLabel === label) {
          throw new Error(`FORCED_FAIL:${label}`)
        }
        return await op()
      },
      rootPath: env.rootPath,
      legacyStorageDir: env.legacyDir,
      maxSessions: 2,
      now: () => (clockMs += 100)
    })

    const sample = makeSampleCanvasSession()
    expect((await store.save('conv-a', sample)).ok).toBe(true)
    expect((await store.save('conv-b', sample)).ok).toBe(true)
    expect(await store.getStoredSessionCount()).toBe(2)

    // Failing explicit delete must NOT drop conv-a from index tracking
    failLabel = 'tds-canvas.delete'
    const failedDelete = await store.delete('conv-a')
    expect(failedDelete).toEqual({
      ok: false,
      deleted: false,
      error: 'FORCED_FAIL:tds-canvas.delete'
    })
    expect(await store.getStoredSessionCount()).toBe(2)
    expect((await store.load('conv-a')).session).toEqual(sample)

    // Failing LRU eviction must propagate observably AND keep failed victim tracked in index
    failLabel = 'tds-canvas.evict'
    const failedEvictSave = await store.save('conv-c', sample)
    expect(failedEvictSave.ok).toBe(false)
    expect(failedEvictSave.error).toBe('FORCED_FAIL:tds-canvas.evict')
    expect(await store.getStoredSessionCount()).toBe(3)

    // Once DB recovers, next save evicts both excess rows cleanly back down to maxSessions=2
    failLabel = null
    expect((await store.save('conv-c', sample)).ok).toBe(true)
    expect(await store.getStoredSessionCount()).toBe(2)
  })

  it('fences late or queued saves for deleted conversations via tombstones and clears on recreation', async () => {
    const env = await createStoreEnv()
    let clockMs = 10_000
    const store = new TdsCanvasSessionStore({
      getDb: () => env.db,
      scheduleWrite: env.scheduleWrite,
      rootPath: env.rootPath,
      legacyStorageDir: env.legacyDir,
      deleteTombstoneTtlMs: 30_000,
      now: () => clockMs
    })

    const sample = makeSampleCanvasSession()
    expect((await store.save('conv-race', sample)).ok).toBe(true)

    const delRes = await store.deleteForDeletedConversation('conv-race')
    expect(delRes).toEqual({ ok: true, deleted: true })

    // Late queued save within tombstone window must be rejected and NOT recreate row
    const lateSave = await store.save('conv-race', sample)
    expect(lateSave).toEqual({ ok: false, error: 'CANVAS_SESSION_CONVERSATION_DELETED' })
    expect((await store.load('conv-race')).session).toBeNull()

    // Explicit tombstone clear (when conversation ID is legitimately created again) re-enables saves
    store.clearConversationDeletedTombstone('conv-race')
    expect((await store.save('conv-race', sample)).ok).toBe(true)
  })

  it('enforces strict host-window & main-frame IPC checks across all TDS transport handlers', async () => {
    const env = await createStoreEnv()
    const mainFrame = { parent: null, detached: false, isDestroyed: () => false }
    const subFrame = { parent: mainFrame, detached: false, isDestroyed: () => false }
    const detachedFrame = { parent: null, detached: true, isDestroyed: () => false }
    const hostWebContents = {
      id: 1,
      mainFrame,
      isDestroyed: () => false,
      getType: () => 'window'
    }
    const hostWindow = {
      isDestroyed: () => false,
      webContents: hostWebContents
    }

    const mod = new TdsCaptureModule({
      hostWindow: hostWindow as unknown as Electron.BrowserWindow,
      canvasSessionStore: {
        getDb: () => env.db,
        scheduleWrite: env.scheduleWrite,
        rootPath: env.rootPath,
        legacyStorageDir: env.legacyDir
      }
    })
    mod.onInit({} as ModuleInitContext<TalexEvents>)

    const appContext = {
      sender: hostWebContents,
      senderFrame: mainFrame
    } as unknown as HandlerContext

    const sdk = createTdsCanvasSessionSdk({
      send: (async (event: { toEventName: () => string }, payload?: unknown) => {
        const handler = mockTransportHandlers.get(event.toEventName())
        if (!handler) throw new Error(`No handler for ${event.toEventName()}`)
        return await handler(payload, appContext)
      }) as Parameters<typeof createTdsCanvasSessionSdk>[0]['send']
    })

    const sample = makeSampleCanvasSession()
    expect((await sdk.save('conv-ipc', sample)).ok).toBe(true)
    expect((await sdk.load('conv-ipc')).session).toEqual(sample)
    expect(await sdk.delete('conv-ipc')).toEqual({ ok: true, deleted: true })

    const untrustedContexts: HandlerContext[] = [
      {
        sender: hostWebContents,
        senderFrame: mainFrame,
        plugin: { name: 'untrusted-plugin' }
      } as unknown as HandlerContext,
      {
        sender: hostWebContents,
        senderFrame: subFrame
      } as unknown as HandlerContext,
      {
        sender: hostWebContents,
        senderFrame: detachedFrame
      } as unknown as HandlerContext,
      {
        sender: hostWebContents,
        senderFrame: null
      } as unknown as HandlerContext,
      {
        sender: { id: 99, mainFrame, isDestroyed: () => false, getType: () => 'window' },
        senderFrame: mainFrame
      } as unknown as HandlerContext,
      {
        sender: { id: 100, mainFrame, isDestroyed: () => false, getType: () => 'webview' },
        senderFrame: mainFrame
      } as unknown as HandlerContext,
      {
        sender: { id: 1, mainFrame, isDestroyed: () => true, getType: () => 'window' },
        senderFrame: mainFrame
      } as unknown as HandlerContext
    ]

    for (const event of [
      TdsCanvasSessionEvents.load,
      TdsCanvasSessionEvents.save,
      TdsCanvasSessionEvents.delete
    ]) {
      const handler = mockTransportHandlers.get(event.toEventName())!
      for (const badContext of untrustedContexts) {
        await expect(
          handler({ conversationId: 'conv-ipc', session: sample }, badContext)
        ).rejects.toThrow('TDS_CAPTURE_HOST_ONLY')
      }
    }

    // Direct helper check for destroyed host window
    const destroyedHost = {
      isDestroyed: () => true,
      webContents: hostWebContents
    } as unknown as Electron.BrowserWindow
    expect(() => assertAppRendererCaller(appContext, destroyedHost)).toThrow(
      'TDS_CAPTURE_HOST_ONLY'
    )

    mod.onDestroy({} as ModuleDestroyContext<TalexEvents>)
    expect(mockTransportHandlers.size).toBe(0)
  })
})
