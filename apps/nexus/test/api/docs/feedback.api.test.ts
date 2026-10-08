import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1, type SqliteD1Database } from '../../helpers/d1-sqlite'

/**
 * Docs feedback against real SQLite: the tallies and the caller's vote are one query, the vote a
 * caller sees is the one their session owns, and a vote toggles off when cast twice.
 */

const authMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  readSessionTokenUserId: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  getQuery: vi.fn(),
  readBody: vi.fn(),
}))

const state = vi.hoisted(() => ({
  db: null as SqliteD1Database | null,
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return { ...actual, getQuery: h3Mocks.getQuery, readBody: h3Mocks.readBody }
})

vi.mock('../../../server/utils/auth', () => authMocks)
vi.mock('../../../server/utils/cloudflare', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../server/utils/cloudflare')>()),
  readCloudflareBindings: () => (state.db ? { DB: state.db } : undefined),
}))

let getFeedback: (event: any) => Promise<any>
let postFeedback: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  getFeedback = (await import('../../../server/api/docs/feedback.get')).default as (event: any) => Promise<any>
  postFeedback = (await import('../../../server/api/docs/feedback.post')).default as (event: any) => Promise<any>
})

function makeEvent() {
  return { path: '/api/docs/feedback', node: { req: { url: '/api/docs/feedback' } }, context: {} }
}

async function vote(userId: string, path: string, helpful: boolean) {
  authMocks.requireAuth.mockResolvedValueOnce({ userId, authSource: 'session' })
  h3Mocks.readBody.mockResolvedValueOnce({ path, helpful })
  return postFeedback(makeEvent())
}

async function read(path: string, query: Record<string, string> = {}) {
  h3Mocks.getQuery.mockReturnValueOnce({ path, ...query })
  return getFeedback(makeEvent())
}

describe('/api/docs/feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.db = createSqliteD1()
    authMocks.readSessionTokenUserId.mockResolvedValue(null)
  })

  it('records, switches and toggles off a vote', async () => {
    expect(await vote('alice', '/docs/intro/', true)).toEqual({ success: true, userVote: true })
    expect(await vote('alice', 'docs/intro', false)).toEqual({ success: true, userVote: false })
    expect(await vote('alice', 'docs/intro', false)).toEqual({ success: true, userVote: null })

    const rows = state.db!.sqlite.prepare('SELECT * FROM doc_feedback').all()
    expect(rows).toEqual([])
  })

  it('tallies the page and reports the vote of the session it is asked from', async () => {
    await vote('alice', 'docs/intro', true)
    await vote('bob', 'docs/intro', true)
    await vote('carol', 'docs/intro', false)
    await vote('bob', 'docs/other', false)

    authMocks.readSessionTokenUserId.mockResolvedValueOnce('carol')
    expect(await read('/Docs/Intro/')).toEqual({ helpful: 2, unhelpful: 1, userVote: false })

    expect(await read('docs/intro')).toEqual({ helpful: 2, unhelpful: 1, userVote: null })
    expect(await read('docs/missing')).toEqual({ helpful: 0, unhelpful: 0, userVote: null })
  })

  it('ignores a userId in the query: one account cannot read another one\'s vote', async () => {
    await vote('alice', 'docs/intro', true)

    authMocks.readSessionTokenUserId.mockResolvedValueOnce('mallory')
    expect(await read('docs/intro', { userId: 'alice' })).toEqual({ helpful: 1, unhelpful: 0, userVote: null })
  })
})
