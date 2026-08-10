/**
 * `ipcMain.on` listeners run inside an EventEmitter, so a throw from one becomes an uncaught
 * main-process exception. The only uncaughtException handler in the tree lives in
 * dev-process-manager, which returns early when app.isPackaged -- so in a released build any
 * renderer or plugin view could end the app with
 * `ipcRenderer.send('@main-process-message', 'x')` (#784).
 *
 * The payloads here are the ones from that report, driven through the real __handle_main.
 */
import { describe, expect, it, vi } from 'vitest'

// The import chain reaches talex-mica-electron, @sentry/electron and precore, all of which
// touch Electron at module scope. This harness is the repo's own answer to that; using it keeps
// one set of mocks rather than a parallel copy that can drift.
import '../modules/ai/intelligence-test-harness'

import { genTouchChannel } from './channel-core'

interface HandleMainCapable {
  __handle_main: (event: unknown, arg: unknown) => unknown
}

function fakeSenderEvent(): { event: Record<string, unknown>; returnValues: unknown[] } {
  const returnValues: unknown[] = []
  const event = {
    sender: { id: 1, isDestroyed: () => false, send: vi.fn() },
    set returnValue(value: unknown) {
      returnValues.push(value)
    },
    get returnValue(): unknown {
      return returnValues[returnValues.length - 1]
    }
  }
  return { event, returnValues }
}

describe('channel-core drops unparseable IPC payloads instead of crashing main', () => {
  // TouchChannel is not exported, so the singleton is built through genTouchChannel with a
  // stand-in app: only the ipcMain wiring matters for these payloads.
  const channel = genTouchChannel({
    window: { window: {} },
    app: { on: vi.fn() }
  } as never) as unknown as HandleMainCapable

  it.each([
    { name: 'a bare string', payload: 'x' },
    { name: 'a number', payload: 42 },
    { name: 'null', payload: null },
    { name: 'an object with no header', payload: { name: 'some:event' } },
    { name: 'an object whose header is a string', payload: { name: 'e', header: 'nope' } }
  ])('$name 不会把异常抛出监听器', ({ payload }) => {
    const { event } = fakeSenderEvent()

    expect(() => channel.__handle_main(event, payload)).not.toThrow()
  })

  it('丢弃畸形消息时会给同步调用方一个 returnValue,避免其永久阻塞', () => {
    const { event, returnValues } = fakeSenderEvent()

    channel.__handle_main(event, 'x')

    expect(returnValues).toEqual([null])
  })
})
