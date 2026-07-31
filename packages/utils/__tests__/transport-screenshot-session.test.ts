import { describe, expect, it } from 'vitest'

import {
  ScreenshotSessionEvents,
  normalizeScreenshotSessionStartRequest,
  type ScreenshotOverlayState,
  type ScreenshotSessionResult,
} from '../transport/events/screenshot-session'

const managedResult: ScreenshotSessionResult = {
  status: 'completed',
  sessionId: 'screenshot-session:test',
  resource: {
    tfileUrl: 'tfile:///managed/screenshot.png',
    mimeType: 'image/png',
    width: 640,
    height: 360,
    sizeBytes: 1024,
  },
}

const overlayState: ScreenshotOverlayState = {
  sessionId: 'screenshot-session:test',
  phase: 'selecting',
  mode: 'frozen',
  targetMode: 'free-region',
  display: {
    id: 'display:public:1',
    bounds: { x: -1280, y: 0, width: 1280, height: 720 },
    scaleFactor: 2,
    rotation: 0,
    frozenTfileUrl: 'tfile:///managed/display.png',
  },
  safeAreaInsets: { top: 38, right: 0, bottom: 24, left: 0 },
  desktopBounds: { x: -1280, y: 0, width: 2720, height: 900 },
  options: {
    cursor: false,
    cornerRadius: 0,
    border: false,
    shadow: false,
  },
  capabilities: {
    annotation: { available: false, reason: 'not-implemented' },
  },
}

function serialized(value: unknown): string {
  return JSON.stringify(value)
}

describe('screenshot session transport contract', () => {
  it('defines stable typed session event names', () => {
    expect(ScreenshotSessionEvents.lifecycle.start.toEventName()).toBe('screenshot-session:lifecycle:start')
    expect(ScreenshotSessionEvents.lifecycle.waitResult.toEventName()).toBe('screenshot-session:lifecycle:wait-result')
    expect(ScreenshotSessionEvents.overlay.command.toEventName()).toBe('screenshot-session:overlay:command')
    expect(ScreenshotSessionEvents.editor.action.toEventName()).toBe('screenshot-session:editor:action')
  })

  it('normalizes only the bounded caller-authored start options', () => {
    expect(
      normalizeScreenshotSessionStartRequest({
        completionMode: 'return-resource',
        delayMs: 3000,
        initialTarget: 'ui-element',
      }),
    ).toEqual({
      completionMode: 'return-resource',
      delayMs: 3000,
      initialTarget: 'ui-element',
    })
    expect(normalizeScreenshotSessionStartRequest(undefined)).toEqual({
      completionMode: 'editor',
      delayMs: 0,
      initialTarget: 'free-region',
    })
  })

  it('rejects invalid, unknown, and caller-authored identity fields', () => {
    expect(normalizeScreenshotSessionStartRequest(null)).toBeNull()
    expect(normalizeScreenshotSessionStartRequest({ completionMode: 'raw-buffer' })).toBeNull()
    expect(normalizeScreenshotSessionStartRequest({ delayMs: 1000 })).toBeNull()
    expect(normalizeScreenshotSessionStartRequest({ initialTarget: 'desktop' })).toBeNull()
    expect(normalizeScreenshotSessionStartRequest({ entrypoint: 'plugin' })).toBeNull()
    expect(normalizeScreenshotSessionStartRequest({ plugin: 'forged.plugin' })).toBeNull()
    expect(normalizeScreenshotSessionStartRequest({ verified: true })).toBeNull()
    expect(normalizeScreenshotSessionStartRequest({ futureField: true })).toBeNull()
  })

  it('keeps overlay and result JSON descriptor-only', () => {
    const output = `${serialized(overlayState)}${serialized(managedResult)}`

    for (const forbidden of [
      'dataUrl',
      'base64',
      'path',
      'attachment',
      'nativeWindowId',
      'generation',
      'windowTitle',
      'applicationPath',
      'plugin',
      'verified',
    ]) {
      expect(output).not.toContain(forbidden)
    }
    expect(output).toContain('tfile://')
  })
})
