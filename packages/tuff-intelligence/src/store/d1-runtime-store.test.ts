import { describe, expect, it, vi } from 'vitest'
import { D1RuntimeStoreAdapter } from './d1-runtime-store'

interface FakeSessionRow {
  session_id: string
  user_id: string
  status: string
}

function createFakeD1() {
  const sessions = new Map<string, FakeSessionRow>()
  const statements: string[] = []

  const db = {
    prepare(sql: string) {
      statements.push(sql)
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.includes('INSERT INTO ai_chat_sessions')) {
                const sessionId = String(args[0])
                const userId = String(args[1])
                const status = String(args[2])
                const existing = sessions.get(sessionId)
                if (!existing) {
                  sessions.set(sessionId, { session_id: sessionId, user_id: userId, status })
                  return { success: true, meta: { changes: 1 } }
                }
                if (sql.includes('WHERE user_id = ?2') && existing.user_id !== userId) {
                  return { success: true, meta: { changes: 0 } }
                }
                existing.status = status
                return { success: true, meta: { changes: 1 } }
              }
              return { success: true, meta: { changes: 1 } }
            },
            async first() {
              return null
            },
            async all() {
              return { results: [] }
            },
          }
        },
        async run() {
          return { success: true, meta: { changes: 0 } }
        },
      }
    },
  }

  return { db, sessions, statements }
}

describe('d1RuntimeStoreAdapter session creation security', () => {
  it('uses crypto.randomUUID rather than Math.random for generated session IDs', async () => {
    const mathRandomSpy = vi.spyOn(Math, 'random')
    try {
      const { db } = createFakeD1()
      const store = new D1RuntimeStoreAdapter(db as never, 'user-a')
      const session = await store.createSession({ message: 'hello' })

      expect(session.sessionId).toMatch(/^session_[0-9a-f]{32}$/i)
      expect(mathRandomSpy).not.toHaveBeenCalled()
    } finally {
      mathRandomSpy.mockRestore()
    }
  })

  it('prevents cross-user session overwrite on session_id conflict', async () => {
    const { db, sessions, statements } = createFakeD1()
    const userA = new D1RuntimeStoreAdapter(db as never, 'user-a')
    const userB = new D1RuntimeStoreAdapter(db as never, 'user-b')

    await userA.createSession({ sessionId: 'shared-session-id', message: 'owner' })
    await expect(
      userB.createSession({ sessionId: 'shared-session-id', message: 'attacker' })
    ).rejects.toThrow(/another user/i)

    expect(sessions.get('shared-session-id')?.user_id).toBe('user-a')
    expect(statements.some((sql) => sql.includes('WHERE user_id = ?2'))).toBe(true)
  })
})
