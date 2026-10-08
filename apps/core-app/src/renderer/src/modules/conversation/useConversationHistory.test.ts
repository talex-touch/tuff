import { ConversationEvents } from '@talex-touch/utils/transport/sdk/domains/conversation'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.fn()

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({ send, on: () => () => {} })
}))

const { useConversationHistory, createConversationId } = await import('./useConversationHistory')

beforeEach(() => {
  send.mockReset()
  send.mockResolvedValue([])
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
  it('shares one list across instances so the sidebar sees a refresh made elsewhere', async () => {
    // Main settles turns; a refresh in Home must reach the sidebar's list as well.
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

/**
 * Parts ride inside `meta.parts` in storage; `load` must pull them back out so the meta the side
 * panel reads stays the plain turn metadata it always was. The save side that folded them in lives
 * in Main's conversation store now, so only the restore half is exercised here.
 */
describe('parts on load', () => {
  it('splits stored parts out of meta and leaves the turn metadata behind', async () => {
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
          meta: {
            provider: 'pi',
            model: 'gpt',
            parts: [
              { type: 'reasoning', text: 'thinking', done: true },
              { type: 'tool-call', id: 'c1', name: 'read', status: 'done', output: 'data' },
              { type: 'text', text: 'Found it.' }
            ]
          }
        }
      ]
    })

    const restored = await useConversationHistory().load('c1')

    expect(restored?.messages[0]?.parts).toHaveLength(3)
    expect(restored?.messages[0]?.parts?.[1]).toMatchObject({ type: 'tool-call', output: 'data' })
    expect(restored?.messages[0]?.meta).toEqual({ provider: 'pi', model: 'gpt' })
  })

  it('leaves a message with no stored parts without a parts array', async () => {
    send.mockResolvedValueOnce({
      id: 'c1',
      title: 'Title',
      createdAt: 1,
      updatedAt: 1,
      messages: [
        {
          id: 'u1',
          role: 'user',
          content: 'hi',
          status: 'complete',
          seq: 0,
          createdAt: 1
        }
      ]
    })

    const restored = await useConversationHistory().load('c1')

    expect(restored?.messages[0]?.parts).toBeUndefined()
    expect(restored?.messages[0]?.meta).toBeUndefined()
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

/**
 * A conversation's project is what keeps a project-local thread out of Home and back in its folder
 * group. Home owns the write now; `load` must still hand the owner back, or the next autosave after
 * a reload would silently reassign the thread to Home.
 */
describe('project ownership', () => {
  it('restores the stored project id so a reload keeps writing into the same project', async () => {
    send.mockResolvedValueOnce({
      id: 'c1',
      title: 'Title',
      projectId: 'p1',
      createdAt: 1,
      updatedAt: 1,
      messages: [
        { id: 'u1', role: 'user', content: 'hi', status: 'complete', seq: 0, createdAt: 1 }
      ]
    })

    await expect(useConversationHistory().load('c1')).resolves.toMatchObject({
      projectId: 'p1'
    })
  })

  it('reports a conversation stored before projects existed as unowned', async () => {
    send.mockResolvedValueOnce({
      id: 'legacy',
      title: 'Legacy',
      projectId: null,
      createdAt: 1,
      updatedAt: 1,
      messages: [
        { id: 'u1', role: 'user', content: 'hi', status: 'complete', seq: 0, createdAt: 1 }
      ]
    })

    await expect(useConversationHistory().load('legacy')).resolves.toMatchObject({
      projectId: null
    })
  })
})

describe('rename', () => {
  it('renames only the requested thread and refreshes the shared sidebar list', async () => {
    const rows = [
      { id: 'c1', title: 'Original', createdAt: 1, updatedAt: 2 },
      { id: 'c2', title: 'Other', createdAt: 1, updatedAt: 2 }
    ]
    send.mockImplementation(async (event, request) => {
      if (event === ConversationEvents.list) return rows.map((row) => ({ ...row }))
      if (event === ConversationEvents.rename) {
        const row = rows.find((entry) => entry.id === request.id)
        if (!row) throw new Error('conversation not found')
        row.title = request.title
        return { renamed: true }
      }
      throw new Error('unexpected conversation operation')
    })
    const history = useConversationHistory()
    const sidebar = useConversationHistory()
    await history.refresh()

    await history.rename('c1', 'Renamed')

    expect(sidebar.conversations.value.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: 'c1', title: 'Renamed' },
      { id: 'c2', title: 'Other' }
    ])
  })

  it('does not apply a rename that the store rejected', async () => {
    send.mockRejectedValueOnce(new Error('rename denied'))

    await expect(useConversationHistory().rename('c1', 'Title')).rejects.toThrow('rename denied')
  })
})

describe('remove', () => {
  it('deletes only the requested thread and refreshes the shared sidebar list', async () => {
    let rows = [
      { id: 'c1', title: 'Removed', createdAt: 1, updatedAt: 2 },
      { id: 'kept', title: 'Kept', createdAt: 1, updatedAt: 2 }
    ]
    send.mockImplementation(async (event, request) => {
      if (event === ConversationEvents.list) return rows.map((row) => ({ ...row }))
      if (event === ConversationEvents.remove) {
        rows = rows.filter((row) => row.id !== request.id)
        return { deleted: true }
      }
      throw new Error('unexpected conversation operation')
    })
    const history = useConversationHistory()
    const sidebar = useConversationHistory()
    await history.refresh()

    await history.remove('c1')

    expect(sidebar.conversations.value).toEqual([
      { id: 'kept', title: 'Kept', createdAt: 1, updatedAt: 2 }
    ])
  })
})
