/**
 * `_sendTo` is declared `Promise<unknown>` and every other error path returns a resolved error
 * object. One path threw synchronously instead, so `_sendTo(...).catch(handler)` could not catch
 * it — the exception left before the promise existed. The main process has no production
 * uncaughtException handler (dev-process-manager returns early when app.isPackaged), so it could
 * end the app (#808).
 *
 * The same shape as #784, which is why that file's harness is reused here rather than a parallel
 * copy of the mocks.
 */
import { describe, expect, it, vi } from 'vitest'

// The import chain reaches talex-mica-electron, @sentry/electron and precore, all of which touch
// Electron at module scope.
import '../modules/ai/intelligence-test-harness'

import { genTouchChannel } from './channel-core'

interface SendToCapable {
  _sendTo: (
    win: unknown,
    type: string,
    eventName: string,
    arg: unknown,
    header?: Record<string, unknown>
  ) => Promise<unknown>
}

/** A live-looking target: the guard under test must be reached before anything is sent. */
function fakeWindow(): { win: unknown; sent: unknown[] } {
  const sent: unknown[] = []
  return {
    sent,
    win: {
      webContents: {
        isDestroyed: () => false,
        send: (channel: string, payload: unknown) => sent.push({ channel, payload })
      }
    }
  }
}

const channel = genTouchChannel({
  window: { window: {} },
  app: { on: vi.fn() }
} as never) as unknown as SendToCapable

describe('_sendTo reports a missing plugin name instead of throwing', () => {
  it('缺少 plugin 名时不同步抛出,而是返回一个 promise', () => {
    const { win } = fakeWindow()

    // The defect: this threw before the promise existed, so no .catch() could ever see it.
    expect(() => channel._sendTo(win, 'plugin', 'some:event', { data: 1 })).not.toThrow()
  })

  it('返回的 promise 解析为错误对象,与该函数其它错误路径一致', async () => {
    const { win } = fakeWindow()

    await expect(channel._sendTo(win, 'plugin', 'some:event', { data: 1 })).resolves.toMatchObject({
      data: { reason: 'invalid_plugin', eventName: 'some:event' }
    })
  })

  it('被拒绝的调用不会真的发出去', async () => {
    const { win, sent } = fakeWindow()

    await channel._sendTo(win, 'plugin', 'some:event', { data: 1 })

    expect(sent).toEqual([])
  })

  it('带 plugin 名的调用仍然照常发送(否则上面几条会掩盖"永远拒绝")', async () => {
    const { win, sent } = fakeWindow()

    void channel._sendTo(win, 'plugin', 'some:event', { plugin: 'com.acme.demo', data: 1 })
    await Promise.resolve()

    expect(sent).toHaveLength(1)
  })

  it('非 plugin 类型不受这条守卫影响', async () => {
    const { win, sent } = fakeWindow()

    void channel._sendTo(win, 'main', 'some:event', { data: 1 })
    await Promise.resolve()

    expect(sent).toHaveLength(1)
  })
})
