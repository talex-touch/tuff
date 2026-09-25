/**
 * Handlers are registered by the module chain, which finishes after the window is shown, so an
 * early renderer request can legitimately arrive before its handler exists.
 *
 * Answering it with the regular no-handler reply is not neutral: the renderer channel resolves that
 * reply's `data` (undefined) instead of rejecting, so a first-paint consumer commits an undefined
 * snapshot and never retries. A released build kept the Home session list broken for the whole
 * session with `sessions is not iterable` because of exactly this.
 *
 * These drive the real `__handle_main` to pin the deferral contract that fixes it.
 */
import { describe, expect, it, vi } from 'vitest'

// The import chain reaches talex-mica-electron, @sentry/electron and precore, all of which touch
// Electron at module scope. Shared with the other channel-core suites so the mocks cannot drift.
import '../modules/ai/intelligence-test-harness'

import { genTouchChannel } from './channel-core'

interface HandleMainCapable {
  __handle_main: (event: unknown, arg: unknown, lane?: unknown) => void
  regChannel: (type: unknown, eventName: string, callback: (data: unknown) => unknown) => unknown
}

function fakeSenderEvent(): { event: Record<string, unknown>; send: ReturnType<typeof vi.fn> } {
  const send = vi.fn()
  const event = {
    sender: { id: 1, isDestroyed: () => false, send },
    set returnValue(_value: unknown) {},
    get returnValue(): unknown {
      return undefined
    }
  }
  return { event, send }
}

/** An asynchronous request/response message: it carries `sync` correlation. */
function asyncRequest(name: string, id: string): Record<string, unknown> {
  return {
    name,
    header: { status: 'request' },
    sync: { id, timeStamp: Date.now(), timeout: 60_000 }
  }
}

/** A `sendSync` message: no `sync` correlation, answered through `e.returnValue`. */
function syncRequest(name: string): Record<string, unknown> {
  return { name, header: { status: 'request' } }
}

describe('channel-core defers requests that arrive before the runtime is initialized', () => {
  let releaseStartup: (() => void) | undefined
  const startup = new Promise<void>((resolve) => {
    releaseStartup = resolve
  })

  // TouchChannel is not exported, so the singleton is built through genTouchChannel. The channel
  // is created eagerly: `startupPending` starts true and only the replay clears it.
  const channel = genTouchChannel({
    window: { window: {} },
    app: { on: vi.fn() },
    waitUntilInitialized: () => startup
  } as never) as unknown as HandleMainCapable

  it('给同步调用方立即回复,不拖到启动完成', () => {
    const { event, send } = fakeSenderEvent()

    channel.__handle_main(event, syncRequest('touch:never-registered'))

    // The returnValue path cannot be deferred at all, so it must answer in the same tick.
    expect(send).not.toHaveBeenCalled()
  })

  it('启动完成前不发 no-handler,启动后把请求重放给注册好的处理器', async () => {
    const { event, send } = fakeSenderEvent()
    const received: unknown[] = []

    channel.__handle_main(event, asyncRequest('plugin:api:list', 'req-deferred'))

    // This is the regression: an early reply here became an undefined snapshot in the renderer.
    expect(send).not.toHaveBeenCalled()

    // The handler registers during startup, exactly like a module in the chain does.
    channel.regChannel('main', 'plugin:api:list', (data) => {
      received.push(data)
    })

    releaseStartup?.()

    await vi.waitFor(() => {
      expect(received).toHaveLength(1)
    })
  })

  it('启动完成后仍未注册的请求会得到 no-handler 回复,不再延迟', async () => {
    const { event, send } = fakeSenderEvent()

    channel.__handle_main(event, asyncRequest('touch:still-never-registered', 'req-late'))

    // Replay already cleared startupPending, so a handler that truly never registers cannot loop.
    expect(send).toHaveBeenCalledTimes(1)
  })
})
