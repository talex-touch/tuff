import type { ConversationMessage } from './useHomeConversation'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.fn()

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({ send })
}))

const { useConversationHistory, createConversationId } = await import('./useConversationHistory')

function message(overrides: Partial<ConversationMessage>): ConversationMessage {
  return {
    id: 'm1',
    role: 'user',
    content: 'hi',
    status: 'complete',
    ...overrides
  }
}

beforeEach(() => {
  send.mockReset()
  send.mockResolvedValue([])
})

describe('persist', () => {
  it('stores a streaming placeholder as failed', async () => {
    // The stream cannot survive the write, so restoring `streaming` would bring back a bubble that
    // waits forever for deltas that will never arrive.
    const history = useConversationHistory()
    await history.persist('c1', 'Title', [
      message({ id: 'u1' }),
      message({ id: 'a1', role: 'assistant', content: '', status: 'streaming' })
    ])

    const saved = send.mock.calls[0]?.[1]
    expect(saved.messages.map((entry: { status: string }) => entry.status)).toEqual([
      'complete',
      'failed'
    ])
  })

  it('keeps complete and failed statuses untouched', async () => {
    const history = useConversationHistory()
    await history.persist('c1', 'Title', [
      message({ id: 'u1' }),
      message({ id: 'a1', role: 'assistant', status: 'failed' })
    ])

    const saved = send.mock.calls[0]?.[1]
    expect(saved.messages.map((entry: { status: string }) => entry.status)).toEqual([
      'complete',
      'failed'
    ])
  })

  it('forwards the title verbatim so long titles are not cut in the data layer', async () => {
    const long = 'x'.repeat(400)
    const history = useConversationHistory()
    await history.persist('c1', long, [message({})])

    expect(send.mock.calls[0]?.[1].title).toBe(long)
  })

  it('carries turn metadata through to storage', async () => {
    const history = useConversationHistory()
    await history.persist('c1', 'Title', [
      message({ id: 'a1', role: 'assistant', meta: { model: 'gpt-5.6-terra', totalTokens: 42 } })
    ])

    expect(send.mock.calls[0]?.[1].messages[0].meta).toEqual({
      model: 'gpt-5.6-terra',
      totalTokens: 42
    })
  })

  it('writes nothing for an empty thread', async () => {
    const history = useConversationHistory()
    await history.persist('c1', '', [])
    expect(send).not.toHaveBeenCalled()
  })
})

describe('load', () => {
  it('returns null when the id is unknown, so the caller can keep the current thread', async () => {
    send.mockResolvedValueOnce(null)
    const history = useConversationHistory()
    expect(await history.load('missing')).toBeNull()
  })

  it('maps stored rows back onto conversation messages', async () => {
    send.mockResolvedValueOnce({
      id: 'c1',
      title: 'Title',
      createdAt: 1,
      updatedAt: 2,
      messages: [
        { id: 'u1', role: 'user', content: 'hi', status: 'complete', seq: 0, createdAt: 1 },
        {
          id: 'a1',
          role: 'assistant',
          content: 'yo',
          status: 'complete',
          meta: { model: 'm' },
          seq: 1,
          createdAt: 2
        }
      ]
    })

    const restored = await useConversationHistory().load('c1')

    expect(restored?.messages.map((entry) => entry.content)).toEqual(['hi', 'yo'])
    expect(restored?.messages[1]?.meta).toEqual({ model: 'm' })
    // The stored title survives the trip out (#969): restore has to know whether it is custom.
    expect(restored?.title).toBe('Title')
  })

  it('repairs duplicate ids stored by the old per-conversation counters', async () => {
    // Threads persisted while ids were `user-N` counters can carry real
    // duplicates; loaded as-is they corrupt the stream's keyed diff and
    // height cache (the message pile-up bug).
    send.mockResolvedValueOnce({
      id: 'c1',
      title: 'Title',
      createdAt: 1,
      updatedAt: 2,
      messages: [
        { id: 'user-5', role: 'user', content: 'one', status: 'complete', seq: 0, createdAt: 1 },
        {
          id: 'assistant-6',
          role: 'assistant',
          content: 'two',
          status: 'complete',
          seq: 1,
          createdAt: 2
        },
        { id: 'user-5', role: 'user', content: 'three', status: 'complete', seq: 2, createdAt: 3 }
      ]
    })

    const restored = await useConversationHistory().load('c1')

    const ids = restored?.messages.map((entry) => entry.id) ?? []
    expect(new Set(ids).size).toBe(ids.length)
    // Order and content untouched; only the collision got a suffix.
    expect(restored?.messages.map((entry) => entry.content)).toEqual(['one', 'two', 'three'])
    expect(ids[0]).toBe('user-5')
    expect(ids[2]).not.toBe('user-5')
  })
})

describe('refresh', () => {
  it('degrades to an empty list rather than propagating a transport failure', async () => {
    // The sidebar failing must not take down the conversation surface it sits next to.
    send.mockRejectedValueOnce(new Error('offline'))
    const history = useConversationHistory()
    await history.refresh()
    expect(history.conversations.value).toEqual([])
  })
})

describe('shared list', () => {
  it('shares one list across instances so the sidebar sees a persist made elsewhere', async () => {
    // HomePage owns persist, ShellConversationList owns rendering; a per-call
    // ref would leave the sidebar stale after every send.
    const rows = [{ id: 'c1', title: 'T', createdAt: 1, updatedAt: 2 }]
    send.mockResolvedValue(rows)
    const sidebar = useConversationHistory()
    const home = useConversationHistory()
    await home.refresh()
    expect(sidebar.conversations.value).toEqual(rows)
  })
})

describe('createConversationId', () => {
  it('is unique per call', () => {
    expect(createConversationId()).not.toBe(createConversationId())
  })
})

describe('parts persistence', () => {
  it('folds parts into meta.parts on save and splits them back out on load', async () => {
    const history = useConversationHistory()
    await history.persist('c1', 'Title', [
      message({
        id: 'a1',
        role: 'assistant',
        content: 'Found it.',
        meta: { provider: 'pi', model: 'gpt' },
        parts: [
          { type: 'reasoning', text: 'thinking', done: true },
          { type: 'tool-call', id: 'c1', name: 'read', status: 'done', output: 'data' },
          { type: 'text', text: 'Found it.' }
        ]
      })
    ])

    const saved = send.mock.calls[0]?.[1]
    const savedMeta = saved.messages[0].meta
    expect(savedMeta.provider).toBe('pi')
    expect(Array.isArray(savedMeta.parts)).toBe(true)
    expect(savedMeta.parts).toHaveLength(3)

    // Round trip: get() returns what save stored; load() must split parts out.
    send.mockResolvedValueOnce({
      id: 'c1',
      title: 'Title',
      createdAt: 1,
      updatedAt: 1,
      messages: [
        {
          id: 'a1',
          role: 'assistant',
          content: 'Found it.',
          status: 'complete',
          seq: 0,
          createdAt: 1,
          meta: savedMeta
        }
      ]
    })

    const restored = await history.load('c1')
    expect(restored?.messages[0]?.parts).toHaveLength(3)
    expect(restored?.messages[0]?.parts?.[1]).toMatchObject({ type: 'tool-call', output: 'data' })
    expect(restored?.messages[0]?.meta).toEqual({ provider: 'pi', model: 'gpt' })
  })

  it('truncates verbose tool output before storing', async () => {
    const history = useConversationHistory()
    const huge = 'x'.repeat(10 * 1024)
    await history.persist('c1', 'Title', [
      message({
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'tool-call', id: 'c1', name: 'read', status: 'done', output: huge }]
      })
    ])

    const stored = send.mock.calls[0]?.[1].messages[0].meta.parts[0]
    expect(stored.output.length).toBeLessThanOrEqual(8 * 1024 + 1)
    expect(stored.output.endsWith('…')).toBe(true)
  })

  it('stores a long answer whole, because the body renders prose from the parts', async () => {
    // Capping this would reload a long reply visibly cut off; the cap is for
    // trail material, not for the answer itself.
    const history = useConversationHistory()
    const huge = 'x'.repeat(10 * 1024)
    await history.persist('c1', 'Title', [
      message({ id: 'a1', role: 'assistant', parts: [{ type: 'text', text: huge }] })
    ])

    const stored = send.mock.calls[0]?.[1].messages[0].meta.parts[0]
    expect(stored.text).toBe(huge)
  })

  it('still caps a runaway reasoning span, which is trail material', async () => {
    const history = useConversationHistory()
    const huge = 'x'.repeat(10 * 1024)
    await history.persist('c1', 'Title', [
      message({
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'reasoning', text: huge, done: true }]
      })
    ])

    const stored = send.mock.calls[0]?.[1].messages[0].meta.parts[0]
    expect(stored.text.length).toBeLessThanOrEqual(8 * 1024 + 1)
    expect(stored.text.endsWith('…')).toBe(true)
  })

  it('stores no meta at all for plain messages', async () => {
    const history = useConversationHistory()
    await history.persist('c1', 'Title', [message({ id: 'u1' })])

    expect(send.mock.calls[0]?.[1].messages[0].meta).toBeUndefined()
  })
})

/**
 * `load()` called sdk.get with no try/catch, unlike its sibling refresh(). Its only caller is
 * HomePage's async route watcher, which has none either, so an IPC failure became an unhandled
 * rejection: the view kept showing the previous thread while the URL named the new one (#827).
 */
describe('load survives a store failure', () => {
  it('sdk 拒绝时返回 null,而不是把 rejection 抛给路由 watcher', async () => {
    send.mockRejectedValue(new Error('conversation store unavailable'))
    const history = useConversationHistory()

    await expect(history.load('c1')).resolves.toBeNull()
  })

  it('依然会记录失败原因,而不是静默吞掉', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    send.mockRejectedValue(new Error('conversation store unavailable'))

    await useConversationHistory().load('c1')

    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('正常返回的会话仍然被还原(否则上面两条会掩盖"永远返回 null")', async () => {
    send.mockResolvedValue({
      id: 'c1',
      messages: [{ id: 'm1', role: 'user', content: 'hi', status: 'complete', meta: {} }]
    })

    await expect(useConversationHistory().load('c1')).resolves.toMatchObject({
      messages: [{ id: 'm1', role: 'user', content: 'hi' }]
    })
  })

  it('不存在的会话仍然返回 null', async () => {
    send.mockResolvedValue(null)

    await expect(useConversationHistory().load('missing')).resolves.toBeNull()
  })
})
