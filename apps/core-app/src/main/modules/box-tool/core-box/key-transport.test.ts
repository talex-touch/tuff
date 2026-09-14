import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ForwardedKeyEvent } from './key-transport'

/**
 * A detached DivisionBox keeps the CoreBox header while its plugin UI lives in the session's own
 * WebContentsView, so keys submitted by that window (⌘/Ctrl+←|→) must reach the session instead of
 * the CoreBox window's UI view. The routing only exists inside the transport handler, so the
 * handler is captured through a register spy and invoked with the real sender context.
 */
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (payload: unknown, context: unknown) => unknown>(),
  register: vi.fn(
    (_scope: string, event: string, handler: (payload: unknown, context: unknown) => unknown) => {
      mocks.handlers.set(event, handler)
      return () => {}
    }
  ),
  session: {
    getWindowWebContentsId: vi.fn(() => 42),
    forwardKeyEventToUIView: vi.fn(() => true)
  },
  divisionBoxManager: {
    findSessionByWindowWebContentsId: vi.fn((): unknown => undefined)
  },
  isUIViewActive: vi.fn(() => false),
  forwardKeyEvent: vi.fn(),
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => mocks.logger)
  }
}))

vi.mock('./transport/core-box-transport', () => ({
  coreBoxTransport: {
    register: mocks.register
  }
}))

vi.mock('./window', () => ({
  windowManager: {
    isUIViewActive: mocks.isUIViewActive,
    isUIViewFocused: vi.fn(() => false),
    forwardKeyEvent: mocks.forwardKeyEvent
  }
}))

vi.mock('./manager', () => ({
  coreBoxManager: {
    isUIMode: false
  }
}))

vi.mock('../../division-box/manager', () => ({
  DivisionBoxManager: {
    getInstance: vi.fn(() => mocks.divisionBoxManager)
  }
}))

vi.mock('../../../utils/logger', () => ({
  createLogger: vi.fn(() => mocks.logger)
}))

import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { coreBoxKeyTransport } from './key-transport'

const DIVISION_BOX_WINDOW_ID = 42
const CORE_BOX_WINDOW_ID = 7

/** A real serialized ⌘→ event, the exact shape the renderer forwards. */
const KEY_EVENT: ForwardedKeyEvent = {
  key: 'ArrowRight',
  code: 'ArrowRight',
  metaKey: true,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false
}

type CapturedHandler = (
  payload: ForwardedKeyEvent,
  context: { sender: { id: number }; eventName: string }
) => unknown

function forwardKeyEventHandler(): CapturedHandler {
  const eventName = CoreBoxEvents.ui.forwardKeyEvent.toEventName()
  const handler = mocks.handlers.get(eventName) as CapturedHandler | undefined
  if (!handler) throw new Error(`key transport did not register a handler for ${eventName}`)
  return handler
}

function senderContext(id: number) {
  return { sender: { id }, eventName: CoreBoxEvents.ui.forwardKeyEvent.toEventName() }
}

describe('CoreBox key transport DivisionBox routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.handlers.clear()
    mocks.session.forwardKeyEventToUIView.mockReturnValue(true)
    mocks.divisionBoxManager.findSessionByWindowWebContentsId.mockReturnValue(undefined)
    mocks.isUIViewActive.mockReturnValue(false)
    coreBoxKeyTransport.register()
  })

  it('routes a key from a DivisionBox window to its session instead of the CoreBox UI view', () => {
    mocks.divisionBoxManager.findSessionByWindowWebContentsId.mockReturnValue(mocks.session)
    mocks.isUIViewActive.mockReturnValue(true)

    forwardKeyEventHandler()(KEY_EVENT, senderContext(DIVISION_BOX_WINDOW_ID))

    expect(mocks.session.forwardKeyEventToUIView).toHaveBeenCalledWith(KEY_EVENT)
    expect(mocks.forwardKeyEvent).not.toHaveBeenCalled()
  })

  it('keeps the CoreBox UI view path for a sender without a DivisionBox session', () => {
    mocks.isUIViewActive.mockReturnValue(true)

    forwardKeyEventHandler()(KEY_EVENT, senderContext(CORE_BOX_WINDOW_ID))

    expect(mocks.forwardKeyEvent).toHaveBeenCalledWith(KEY_EVENT)
  })

  it('does not fall back to the CoreBox UI view when the sender session has no live plugin view', () => {
    mocks.session.forwardKeyEventToUIView.mockReturnValue(false)
    mocks.divisionBoxManager.findSessionByWindowWebContentsId.mockReturnValue(mocks.session)
    mocks.isUIViewActive.mockReturnValue(true)

    forwardKeyEventHandler()(KEY_EVENT, senderContext(DIVISION_BOX_WINDOW_ID))

    expect(mocks.session.forwardKeyEventToUIView).toHaveBeenCalledWith(KEY_EVENT)
    expect(mocks.forwardKeyEvent).not.toHaveBeenCalled()
  })
})
