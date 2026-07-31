import type {
  NativeScreenshotCaptureResult,
  NativeScreenshotDisplay
} from '@talex-touch/utils/transport/events/types'
import { describe, expect, it, vi } from 'vitest'

import {
  ScreenshotSessionManager,
  type ScreenshotSessionCaptureService,
  type ScreenshotSessionWindowFactory,
  type ScreenshotSessionWindowHandle
} from './session-manager'

const displays: NativeScreenshotDisplay[] = [
  {
    id: 'display:left',
    name: 'Left',
    friendlyName: 'Left',
    x: -1280,
    y: 0,
    width: 1280,
    height: 720,
    scaleFactor: 2,
    rotation: 0,
    isPrimary: false
  },
  {
    id: 'display:primary',
    name: 'Primary',
    friendlyName: 'Primary',
    x: 0,
    y: 0,
    width: 1440,
    height: 900,
    scaleFactor: 2,
    rotation: 0,
    isPrimary: true
  }
]

function captureResult(display: NativeScreenshotDisplay): NativeScreenshotCaptureResult {
  return {
    tfileUrl: `tfile:///managed/${encodeURIComponent(display.id)}.png`,
    mimeType: 'image/png',
    width: display.width * display.scaleFactor,
    height: display.height * display.scaleFactor,
    displayId: display.id,
    displayName: display.name,
    x: display.x,
    y: display.y,
    scaleFactor: display.scaleFactor,
    durationMs: 4,
    sizeBytes: 1024,
    wroteClipboard: false
  }
}

interface TestWindowHandle extends ScreenshotSessionWindowHandle {
  load: ReturnType<typeof vi.fn>
  show: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  isDestroyed: ReturnType<typeof vi.fn>
  onClosed: ReturnType<typeof vi.fn>
  emitClosed(): void
}

interface Harness {
  manager: ScreenshotSessionManager
  service: ScreenshotSessionCaptureService
  factory: ScreenshotSessionWindowFactory
  saveResource: ReturnType<typeof vi.fn>
  windows: TestWindowHandle[]
  calls: string[]
}

function createHarness(options: { failLoadAt?: number } = {}): Harness {
  const calls: string[] = []
  const windows: TestWindowHandle[] = []
  let nextWebContentsId = 100
  const service: ScreenshotSessionCaptureService = {
    getSupport: vi.fn(() => ({
      supported: true,
      platform: 'darwin',
      engine: 'screen-capture-kit'
    })),
    getFeatures: vi.fn(() => [
      'display',
      'region',
      'window',
      'ui-element-hit-test',
      'frozen-compose'
    ]),
    listDisplays: vi.fn(() => displays),
    capture: vi.fn(async (request = {}) => {
      if (request.target === 'region' && request.region) {
        calls.push('capture:region')
        return {
          ...captureResult(displays[0]),
          tfileUrl: 'tfile:///managed/final-live.png',
          width: request.region.width * 2,
          height: request.region.height * 2,
          x: request.region.x,
          y: request.region.y
        }
      }
      const display = displays.find((item) => item.id === request.displayId)
      if (!display) throw new Error('DISPLAY_NOT_FOUND')
      calls.push(`capture:${display.id}`)
      return captureResult(display)
    }),
    captureCandidate: vi.fn(async (candidate) => {
      calls.push(`capture:${candidate.kind}`)
      return {
        ...captureResult(displays[0]),
        tfileUrl: 'tfile:///managed/final-object.png',
        width: candidate.bounds.width * 2,
        height: candidate.bounds.height * 2,
        x: candidate.bounds.x,
        y: candidate.bounds.y
      }
    }),
    hitTestCandidate: vi.fn(async (point) => ({
      kind: 'window' as const,
      bounds: { x: point.x - 10, y: point.y - 5, width: 200, height: 100 },
      generation: 'generation:test',
      targetId: 'window:opaque'
    })),
    composeFrozenRegion: vi.fn(async (_sources, region) => {
      calls.push('compose:region')
      return {
        ...captureResult(displays[0]),
        tfileUrl: 'tfile:///managed/final-frozen.png',
        width: region.width * 2,
        height: region.height * 2,
        x: region.x,
        y: region.y
      }
    }),
    writeCaptureResourceToClipboard: vi.fn(async () => true)
  }

  function createHandle(label: string, displayId: string | null): TestWindowHandle {
    const index = windows.length
    let destroyed = false
    let closedListener: (() => void) | null = null
    const handle: TestWindowHandle = {
      webContentsId: nextWebContentsId++,
      displayId,
      load: vi.fn(async () => {
        calls.push(`load:${label}`)
        if (options.failLoadAt === index) throw new Error('LOAD_FAILED')
      }),
      show: vi.fn(() => calls.push(`show:${label}`)),
      focus: vi.fn(() => calls.push(`focus:${label}`)),
      destroy: vi.fn(() => {
        destroyed = true
        calls.push(`destroy:${label}`)
      }),
      isDestroyed: vi.fn(() => destroyed),
      onClosed: vi.fn((listener) => {
        closedListener = listener
        return () => {
          closedListener = null
        }
      }),
      emitClosed: () => closedListener?.()
    }
    windows.push(handle)
    calls.push(`create:${label}`)
    return handle
  }

  const factory: ScreenshotSessionWindowFactory = {
    createOverlay: vi.fn(({ display }) => createHandle(display.id, display.id)),
    createEditor: vi.fn(() => createHandle('editor', null))
  }
  const saveResource = vi.fn(async () => true)

  return {
    manager: new ScreenshotSessionManager({
      service,
      windowFactory: factory,
      saveResource,
      getSafeAreaInsets: (display) =>
        display.id === 'display:left'
          ? { top: 38, right: 0, bottom: 24, left: 0 }
          : { top: 25, right: 0, bottom: 0, left: 0 }
    }),
    service,
    factory,
    saveResource,
    windows,
    calls
  }
}

describe('ScreenshotSessionManager', () => {
  it('captures every display before creating or showing bounded overlays', async () => {
    const harness = createHarness()

    const started = await harness.manager.start({
      entrypoint: 'shortcut',
      ownerKey: 'internal:shortcut',
      completionMode: 'editor',
      delayMs: 0,
      initialTarget: 'free-region'
    })

    expect(started).toMatchObject({ accepted: true, state: 'started' })
    expect(harness.calls).toEqual([
      'capture:display:left',
      'capture:display:primary',
      'create:display:left',
      'load:display:left',
      'create:display:primary',
      'load:display:primary',
      'show:display:left',
      'show:display:primary',
      'focus:display:primary'
    ])
    expect(harness.windows).toHaveLength(2)
  })

  it('keeps one active session and focuses it on duplicate start', async () => {
    const harness = createHarness()
    const first = await harness.manager.start({
      entrypoint: 'shortcut',
      ownerKey: 'internal:shortcut',
      completionMode: 'editor',
      delayMs: 0,
      initialTarget: 'free-region'
    })
    const second = await harness.manager.start({
      entrypoint: 'tray',
      ownerKey: 'internal:tray',
      completionMode: 'editor',
      delayMs: 0,
      initialTarget: 'free-region'
    })

    expect(second).toEqual({ accepted: true, sessionId: first.sessionId, state: 'existing' })
    expect(harness.service.capture).toHaveBeenCalledTimes(2)
    expect(harness.factory.createOverlay).toHaveBeenCalledTimes(2)
    expect(harness.windows[1].focus).toHaveBeenCalledTimes(2)
  })

  it('binds overlay state and commands to the exact session-created sender', async () => {
    const harness = createHarness()
    const started = await harness.manager.start({
      entrypoint: 'assistant',
      ownerKey: 'internal:assistant',
      completionMode: 'return-resource',
      delayMs: 0,
      initialTarget: 'free-region'
    })
    const sessionId = started.sessionId!

    expect(harness.manager.getOverlayState(sessionId, 999)).toBeNull()
    expect(await harness.manager.command(sessionId, 999, { type: 'cancel' })).toEqual({
      accepted: false,
      reason: 'sender-not-authorized'
    })

    const state = harness.manager.getOverlayState(sessionId, harness.windows[0].webContentsId)
    expect(state).toMatchObject({
      sessionId,
      phase: 'selecting',
      mode: 'frozen',
      desktopBounds: { x: -1280, y: 0, width: 2720, height: 900 },
      display: {
        id: 'display:left',
        bounds: { x: -1280, y: 0, width: 1280, height: 720 },
        frozenTfileUrl: 'tfile:///managed/display%3Aleft.png'
      },
      safeAreaInsets: { top: 38, right: 0, bottom: 24, left: 0 }
    })
    expect(JSON.stringify(state)).not.toContain('generation')
    expect(JSON.stringify(state)).not.toContain('nativeWindowId')
  })

  it('settles cancellation once and tears down all windows and bindings', async () => {
    const harness = createHarness()
    const started = await harness.manager.start({
      entrypoint: 'assistant',
      ownerKey: 'internal:assistant',
      completionMode: 'return-resource',
      delayMs: 0,
      initialTarget: 'free-region'
    })
    const sessionId = started.sessionId!
    const result = harness.manager.waitForResult(sessionId, 'internal:assistant')

    expect(
      await harness.manager.command(sessionId, harness.windows[0].webContentsId, {
        type: 'cancel'
      })
    ).toEqual({ accepted: true })
    expect(await result).toEqual({ status: 'canceled', sessionId, reason: 'caller-cancelled' })
    expect(harness.manager.cancel(sessionId, 'duplicate-cancel')).toBe(false)
    expect(harness.windows.every((window) => window.destroy.mock.calls.length === 1)).toBe(true)
    expect(harness.manager.getOverlayState(sessionId, harness.windows[0].webContentsId)).toBeNull()
    await expect(harness.manager.waitForResult(sessionId, 'wrong-owner')).rejects.toMatchObject({
      code: 'SCREENSHOT_SESSION_OWNER_MISMATCH'
    })
  })

  it('edits and exports inside the overlay without creating a secondary editor window', async () => {
    const harness = createHarness()
    const started = await harness.manager.start({
      entrypoint: 'shortcut',
      ownerKey: 'internal:shortcut',
      completionMode: 'editor',
      delayMs: 0,
      initialTarget: 'free-region'
    })
    const sessionId = started.sessionId!
    const senderId = harness.windows[0].webContentsId
    const result = harness.manager.waitForResult(sessionId, 'internal:shortcut')

    expect(
      await harness.manager.command(sessionId, senderId, {
        type: 'set-selection',
        selection: { x: -20, y: 10, width: 100, height: 40 }
      })
    ).toEqual({ accepted: true })
    expect(
      await harness.manager.command(sessionId, senderId, {
        type: 'set-options',
        options: { border: true, shadow: true }
      })
    ).toEqual({ accepted: true })
    expect(await harness.manager.command(sessionId, senderId, { type: 'copy' })).toEqual({
      accepted: true
    })

    expect(harness.service.composeFrozenRegion).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ display: expect.objectContaining({ id: 'display:left' }) })
      ]),
      { x: -20, y: 10, width: 100, height: 40 },
      { border: true, shadow: true, cornerRadius: 0 }
    )
    expect(harness.service.writeCaptureResourceToClipboard).toHaveBeenCalledWith(
      'tfile:///managed/final-frozen.png'
    )
    expect(await harness.manager.command(sessionId, senderId, { type: 'save' })).toEqual({
      accepted: true
    })
    expect(harness.saveResource).toHaveBeenCalledOnce()
    expect(harness.service.composeFrozenRegion).toHaveBeenCalledTimes(1)
    expect(harness.factory.createEditor).not.toHaveBeenCalled()
    expect(harness.windows).toHaveLength(2)
    expect(harness.windows.every((window) => window.destroy.mock.calls.length === 0)).toBe(true)

    expect(await harness.manager.command(sessionId, senderId, { type: 'confirm' })).toEqual({
      accepted: true
    })
    expect(harness.service.composeFrozenRegion).toHaveBeenCalledTimes(1)
    expect(harness.windows.every((window) => window.destroy.mock.calls.length === 1)).toBe(true)
    expect(await result).toEqual({
      status: 'completed',
      sessionId,
      resource: {
        tfileUrl: 'tfile:///managed/final-frozen.png',
        mimeType: 'image/png',
        width: 200,
        height: 80,
        sizeBytes: 1024
      }
    })
  })

  it('keeps native object identity in main while exposing only candidate bounds', async () => {
    const harness = createHarness()
    const started = await harness.manager.start({
      entrypoint: 'system-action',
      ownerKey: 'internal:system-action',
      completionMode: 'return-resource',
      delayMs: 0,
      initialTarget: 'window'
    })
    const sessionId = started.sessionId!
    const senderId = harness.windows[0].webContentsId
    const result = harness.manager.waitForResult(sessionId, 'internal:system-action')

    expect(
      await harness.manager.command(sessionId, senderId, {
        type: 'pointer',
        point: { x: 50, y: 40 }
      })
    ).toEqual({ accepted: true })
    const state = harness.manager.getOverlayState(sessionId, senderId)
    expect(state).toMatchObject({
      targetMode: 'object',
      candidate: {
        kind: 'window',
        bounds: { x: 40, y: 35, width: 200, height: 100 }
      }
    })
    expect(JSON.stringify(state)).not.toMatch(/opaque|generation|targetId/)

    expect(await harness.manager.command(sessionId, senderId, { type: 'confirm' })).toEqual({
      accepted: true
    })
    expect(harness.service.captureCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ targetId: 'window:opaque', generation: 'generation:test' })
    )
    await expect(result).resolves.toMatchObject({
      status: 'completed',
      resource: { tfileUrl: 'tfile:///managed/final-object.png' }
    })
  })

  it('captures a live region and resolves return-resource without creating an editor', async () => {
    const harness = createHarness()
    const started = await harness.manager.start({
      entrypoint: 'assistant',
      ownerKey: 'internal:assistant',
      completionMode: 'return-resource',
      delayMs: 0,
      initialTarget: 'free-region'
    })
    const sessionId = started.sessionId!
    const senderId = harness.windows[0].webContentsId
    const result = harness.manager.waitForResult(sessionId, 'internal:assistant')

    await harness.manager.command(sessionId, senderId, { type: 'set-mode', mode: 'live' })
    await harness.manager.command(sessionId, senderId, {
      type: 'set-selection',
      selection: { x: 10, y: 20, width: 30, height: 40 }
    })
    expect(await harness.manager.command(sessionId, senderId, { type: 'confirm' })).toEqual({
      accepted: true
    })

    expect(harness.service.capture).toHaveBeenLastCalledWith({
      target: 'region',
      region: { x: 10, y: 20, width: 30, height: 40 },
      cursor: 'hidden',
      writeClipboard: false
    })
    expect(harness.factory.createEditor).not.toHaveBeenCalled()
    await expect(result).resolves.toMatchObject({
      status: 'completed',
      resource: { tfileUrl: 'tfile:///managed/final-live.png' }
    })
  })

  it('rolls back partially created overlays when one load fails', async () => {
    const harness = createHarness({ failLoadAt: 1 })

    await expect(
      harness.manager.start({
        entrypoint: 'shortcut',
        ownerKey: 'internal:shortcut',
        completionMode: 'editor',
        delayMs: 0,
        initialTarget: 'free-region'
      })
    ).rejects.toThrow('SCREENSHOT_SESSION_START_FAILED')

    expect(harness.windows).toHaveLength(2)
    expect(harness.windows.every((window) => window.destroy.mock.calls.length === 1)).toBe(true)
    expect(harness.manager.getActiveSessionId()).toBeNull()
  })

  it('dispose cancels the live session, rejects new work, and leaves no window', async () => {
    const harness = createHarness()
    const started = await harness.manager.start({
      entrypoint: 'shortcut',
      ownerKey: 'internal:shortcut',
      completionMode: 'editor',
      delayMs: 0,
      initialTarget: 'free-region'
    })
    const result = harness.manager.waitForResult(started.sessionId!, 'internal:shortcut')

    await harness.manager.dispose()

    expect(await result).toMatchObject({ status: 'canceled', reason: 'manager-disposed' })
    expect(harness.windows.every((window) => window.destroy.mock.calls.length === 1)).toBe(true)
    await expect(
      harness.manager.start({
        entrypoint: 'tray',
        ownerKey: 'internal:tray',
        completionMode: 'editor',
        delayMs: 0,
        initialTarget: 'free-region'
      })
    ).rejects.toMatchObject({ code: 'SCREENSHOT_SESSION_DISPOSED' })
  })
})
