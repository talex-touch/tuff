// @vitest-environment jsdom

/**
 * Two defects in the injected prelude:
 *
 * - #876 a message for an event with no registered listener went into `earlyMessageQueue` with no
 *   size or age cap. The queue exists for one race - a message arriving before its handler
 *   registers - so an event the plugin never handles (a broadcast on every search keystroke, say)
 *   appended the full rawData plus the IpcRendererEvent for the life of the session.
 * - #874 `__dispatch` called the listener and then replied `undefined` unconditionally, unlike the
 *   sibling plugin/channel.ts, so every handler return value was discarded.
 *
 * The prelude is a generated source string, so these evaluate it with a fake electron and drive
 * the real handler rather than asserting on the text. jsdom because it assigns to `window`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPluginChannelPreludeCode } from '../transport/prelude'

const UNIQUE_KEY = 'plugin-unique-key-abc'
/** Mirrors EARLY_MESSAGE_MAX_PER_EVENT / EARLY_MESSAGE_MAX_AGE_MS, kept private by the prelude. */
const EARLY_MESSAGE_MAX_PER_EVENT = 32
const EARLY_MESSAGE_MAX_AGE_MS = 30000

interface PreludeChannel {
  regChannel: (name: string, cb: (data: any) => unknown) => () => void
  earlyMessageQueue: Map<string, unknown[]>
}

interface Harness {
  deliver: (message: unknown) => void
  /** Everything the prelude sent back on @plugin-process-message. */
  sent: any[]
  channel: PreludeChannel
}

function loadPrelude(): Harness {
  const sent: any[] = []
  let listener: ((event: unknown, arg: unknown) => void) | null = null

  const fakeElectron = {
    ipcRenderer: {
      on(channel: string, handler: (event: unknown, arg: unknown) => void) {
        if (channel === '@plugin-process-message') listener = handler
      },
      send(_channel: string, payload: unknown) {
        sent.push(payload)
      },
      removeListener() {},
    },
  }

  const code = getPluginChannelPreludeCode({ uniqueKey: UNIQUE_KEY })
  // eslint-disable-next-line no-new-func
  new Function('require', 'window', `${code}`)(
    (name: string) => (name === 'electron' ? fakeElectron : {}),
    window,
  )

  const channel = (window as unknown as { $channel: PreludeChannel }).$channel
  if (!listener) throw new Error('prelude registered no listener')

  return {
    deliver: (message: unknown) =>
      (listener as (event: unknown, arg: unknown) => void)({}, message),
    sent,
    channel,
  }
}

function message(name: string, data: unknown = { n: 1 }) {
  return {
    name,
    code: 200,
    data,
    sync: { timeStamp: 1, timeout: 60000, id: `req-${String(data)}` },
    header: { status: 'request', type: 'main', uniqueKey: UNIQUE_KEY },
  }
}

describe('prelude early queue is bounded and dispatch replies with the result', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-01T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('无人监听的事件反复到达时,队列有条数上限 (#876)', () => {
    const harness = loadPrelude()

    for (let i = 0; i < EARLY_MESSAGE_MAX_PER_EVENT * 4; i += 1) {
      harness.deliver(message('unhandled-event', i))
    }

    expect(harness.channel.earlyMessageQueue.get('unhandled-event')!.length).toBeLessThanOrEqual(
      EARLY_MESSAGE_MAX_PER_EVENT,
    )
  })

  it('保留的是最新的那些,而不是最旧的(否则注册时会拿到一堆过时消息)', () => {
    const harness = loadPrelude()
    for (let i = 0; i < EARLY_MESSAGE_MAX_PER_EVENT + 5; i += 1) {
      harness.deliver(message('unhandled-event', i))
    }

    const received: unknown[] = []
    harness.channel.regChannel('unhandled-event', (data) => {
      received.push(data.data)
    })

    expect(received.at(-1)).toBe(EARLY_MESSAGE_MAX_PER_EVENT + 4)
    expect(received).not.toContain(0)
  })

  it('过老的排队消息被丢弃:它们已经不可能还在等某次注册 (#876)', () => {
    const harness = loadPrelude()
    harness.deliver(message('unhandled-event', 'stale'))

    vi.advanceTimersByTime(EARLY_MESSAGE_MAX_AGE_MS + 1)
    harness.deliver(message('unhandled-event', 'fresh'))

    const received: unknown[] = []
    harness.channel.regChannel('unhandled-event', (data) => {
      received.push(data.data)
    })

    expect(received).toEqual(['fresh'])
  })

  it('正常的早到消息仍然会在注册时补投(否则上面几条会掩盖"队列彻底坏掉")', () => {
    const harness = loadPrelude()
    harness.deliver(message('handled-later', 'early'))

    const received: unknown[] = []
    harness.channel.regChannel('handled-later', (data) => {
      received.push(data.data)
    })

    expect(received).toEqual(['early'])
  })

  it('handler 的返回值会被回复出去,而不是恒为 undefined (#874)', () => {
    const harness = loadPrelude()
    harness.channel.regChannel('demo-event', () => ({ answer: 42 }))

    harness.deliver(message('demo-event'))

    expect(harness.sent[0]).toMatchObject({ code: 200, data: { answer: 42 } })
  })

  it('异步 handler 回复的是解析后的值,而不是一个无法结构化克隆的 Promise (#874)', async () => {
    const harness = loadPrelude()
    harness.channel.regChannel('demo-event', async () => ({ answer: 'async' }))

    harness.deliver(message('demo-event'))
    await vi.waitFor(() => expect(harness.sent).toHaveLength(1))

    expect(harness.sent[0].data).toEqual({ answer: 'async' })
  })

  it('异步 handler 抛错时回复错误码,不留未处理的 rejection (#874)', async () => {
    const harness = loadPrelude()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    harness.channel.regChannel('demo-event', async () => {
      throw new Error('handler blew up')
    })

    harness.deliver(message('demo-event'))
    await vi.waitFor(() => expect(harness.sent).toHaveLength(1))

    expect(harness.sent[0]).toMatchObject({ code: 100, data: 'handler blew up' })
    consoleError.mockRestore()
  })

  it('handler 没有返回值时回复 undefined,而不是塞进别的东西', () => {
    const harness = loadPrelude()
    harness.channel.regChannel('demo-event', () => {})

    harness.deliver(message('demo-event'))

    expect(harness.sent[0].data).toBeUndefined()
  })
})
