// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Three defects in the same 40 lines of the legacy TouchChannel receive path:
 *
 * - #863 `JSON.parse(_arg)` assumed a JSON string, but the main process sends a plain object
 *   (`webContents.send(RAW_PLUGIN_PROCESS_CHANNEL, JSON.parse(encoded))`) and so does `send()`
 *   in the same class. The throw escaped straight out of the IPC listener.
 * - #862 a handler returning a Promise was dropped on the floor - `reply()` never ran and the
 *   main-process caller waited out its full 60s timeout.
 * - #861 `__parse_sender` copied the live `IpcRendererEvent` onto the reply, which carries
 *   `sender`/`ports` and cannot survive structured clone, so the reply throws on send.
 *
 * TouchChannel is `@deprecated` and cannot actually be constructed inside a shipped plugin view -
 * the plugin-view preload exposes `$plugin`/`$config`/`$channel` and neither `electron` nor
 * `require`, so `genChannel()` throws there. These fix the fallback rather than justify it.
 *
 * genChannel caches one instance per module, so each test re-imports with a fresh registry.
 */

interface Harness {
  /** Delivers a message as the main process would, through the registered IPC listener. */
  deliver: (payload: unknown) => void
  /** Everything the channel sent back on @plugin-process-message. */
  sent: unknown[]
  regChannel: (name: string, callback: (data: any) => unknown) => () => void
}

async function loadChannel(): Promise<Harness> {
  vi.resetModules()
  const sent: unknown[] = []
  let listener: ((event: unknown, arg: unknown) => void) | null = null

  const ipcRenderer = {
    on(channel: string, handler: (event: unknown, arg: unknown) => void) {
      if (channel === '@plugin-process-message') listener = handler
    },
    send(_channel: string, payload: unknown) {
      // Electron structured-clones this. A live IpcRendererEvent would throw here for real, so
      // the fake refuses the same shapes rather than silently accepting them.
      sent.push(structuredClone(payload))
    },
    removeListener() {},
  }

  Object.assign(window as unknown as Record<string, unknown>, {
    $plugin: { name: 'demo-plugin' },
    electron: { ipcRenderer },
    $channel: undefined,
  })

  const { genChannel } = await import('../plugin/channel')
  const channel = genChannel()
  if (!listener) throw new Error('TouchChannel registered no IPC listener')

  return {
    deliver: (payload: unknown) =>
      (listener as (event: unknown, arg: unknown) => void)({ sender: ipcRenderer }, payload),
    sent,
    // regChannel reads this.channelMap, so it has to stay attached to the instance.
    regChannel: channel.regChannel.bind(channel) as Harness['regChannel'],
  }
}

/** A request in the shape the main process actually sends. */
function request(name: string, data: unknown = { hello: 'world' }) {
  return {
    name,
    code: 200,
    data,
    plugin: 'demo-plugin',
    sync: { timeStamp: 1, timeout: 60_000, id: 'req-1' },
    header: { status: 'request', type: 'plugin' },
  }
}

describe('legacy plugin channel receive path', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('主进程发来的是普通对象,不再因为 JSON.parse 抛出 (#863)', async () => {
    const harness = await loadChannel()
    const handler = vi.fn(() => 'ok')
    harness.regChannel('demo-event', handler)

    expect(() => harness.deliver(request('demo-event'))).not.toThrow()
    expect(handler).toHaveBeenCalled()
  })

  it('JSON 字符串仍然照常解析(否则上一条会掩盖功能损坏)', async () => {
    const harness = await loadChannel()
    const handler = vi.fn(() => 'ok')
    harness.regChannel('demo-event', handler)

    harness.deliver(JSON.stringify(request('demo-event')))

    expect(handler).toHaveBeenCalled()
  })

  it('无法解析的载荷被丢弃,不会掀翻整个监听器', async () => {
    const harness = await loadChannel()
    const handler = vi.fn()
    harness.regChannel('demo-event', handler)

    expect(() => harness.deliver('}{ not json')).not.toThrow()
    expect(handler).not.toHaveBeenCalled()
  })

  it('异步 handler 的结果会被回复,而不是让调用方等到超时 (#862)', async () => {
    const harness = await loadChannel()
    harness.regChannel('demo-event', async () => ({ answer: 42 }))

    harness.deliver(request('demo-event'))
    await vi.waitFor(() => expect(harness.sent).toHaveLength(1))

    expect(harness.sent[0]).toMatchObject({ code: 200, data: { answer: 42 } })
  })

  it('异步 handler 抛错时回复错误码,同样不让调用方挂死 (#862)', async () => {
    const harness = await loadChannel()
    harness.regChannel('demo-event', async () => {
      throw new Error('handler blew up')
    })

    harness.deliver(request('demo-event'))
    await vi.waitFor(() => expect(harness.sent).toHaveLength(1))

    expect(harness.sent[0]).toMatchObject({ code: 100, data: 'handler blew up' })
  })

  it('同步 handler 的返回值仍然照常回复', async () => {
    const harness = await loadChannel()
    harness.regChannel('demo-event', () => 'sync-result')

    harness.deliver(request('demo-event'))

    expect(harness.sent[0]).toMatchObject({ code: 200, data: 'sync-result' })
  })

  it('回复里不再夹带无法结构化克隆的 IpcRendererEvent (#861)', async () => {
    const harness = await loadChannel()
    harness.regChannel('demo-event', () => 'ok')

    // The fake send() structured-clones; before the fix the live event made this throw.
    expect(() => harness.deliver(request('demo-event'))).not.toThrow()
    expect(harness.sent).toHaveLength(1)
    expect((harness.sent[0] as { header: Record<string, unknown> }).header).not.toHaveProperty(
      'event',
    )
  })

  it('回复仍然带回 sync.id,否则主进程无法把它配对回请求', async () => {
    const harness = await loadChannel()
    harness.regChannel('demo-event', () => 'ok')

    harness.deliver(request('demo-event'))

    expect(harness.sent[0]).toMatchObject({
      name: 'demo-event',
      sync: { id: 'req-1' },
      header: { status: 'reply' },
    })
  })
})
