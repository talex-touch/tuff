/**
 * Regression for local AI CLI session pointers (2026-09-13).
 *
 * A pointer is display metadata for a transcript Tuff does not own: it stores a bounded first-line
 * title and the opaque `sessionRef` row id, and nothing else. Two properties matter here and both
 * are SQLite properties, not plumbing:
 *
 *  - The row's identity is (provider, project_root, native_session_id). Re-observing the same native
 *    session must reuse the same opaque row id — the renderer's sessionRef — rather than minting a
 *    second row, and must never reach back for a later prompt's text, which is how a prompt body
 *    would leak into a synced-looking list.
 *  - The 120 code point title bound counts code points; cutting a UTF-16 string would halve a
 *    CJK/emoji title. Pi head verification is the only thing allowed to move a row between states,
 *    so an ordinary touch must not silently revive a `missing` pointer.
 */
import type { Client } from '@libsql/client'
import type { MainDatabase } from '../../db/db-write'
import type {
  StoredLocalAiCliSession,
  UpsertDiscoveredLocalAiCliSessionInput,
  UpsertLocalAiCliSessionInput
} from './session-store'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../db/schema'
import {
  forgetLocalAiCliSession,
  getLocalAiCliSession,
  getLocalAiCliSessionForConversation,
  listLocalAiCliSessions,
  markLocalAiCliSessionState,
  touchLocalAiCliSession,
  upsertDiscoveredLocalAiCliSessions,
  upsertLocalAiCliSession
} from './session-store'

const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../resources/db/migrations')

let db: MainDatabase
let client: Client
let tempDir: string

vi.mock('../database', () => ({
  databaseModule: {
    getDb: () => db
  }
}))

// The scheduler only serialises; running the task inline keeps these tests about the write itself.
vi.mock('../../db/db-write', () => ({
  scheduleDbWrite: (_name: string, task: () => Promise<unknown>) => task()
}))

type UpsertInput = Omit<UpsertLocalAiCliSessionInput, 'projectId'> & { projectId?: string | null }

function upsert(input: UpsertInput): Promise<StoredLocalAiCliSession> {
  return upsertLocalAiCliSession({ ...input, projectId: input.projectId ?? null })
}

describe('local AI CLI session pointer store', () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'local-ai-cli-sessions-'))
    client = createClient({ url: `file:${join(tempDir, 'test.db')}` })
    db = drizzle(client, { schema })
    await migrate(db, { migrationsFolder })
  })

  afterEach(async () => {
    client.close()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('bounds a Tuff-created title to the first nonblank line, in code points', async () => {
    const session = await upsert({
      provider: 'pi',
      projectRoot: '/projects/one',
      nativeSessionId: 'native-1',
      prompt: '\n\n   Project smoke title  \nPROMPT_BODY_CANARY\n'
    })
    expect(session.title).toBe('Project smoke title')

    const longTitle = await upsert({
      provider: 'pi',
      projectRoot: '/projects/one',
      nativeSessionId: 'native-long',
      prompt: '😀'.repeat(130)
    })
    expect(Array.from(longTitle.title)).toHaveLength(120)
    expect(longTitle.title).toBe('😀'.repeat(120))

    const blank = await upsert({
      provider: 'pi',
      projectRoot: '/projects/one',
      nativeSessionId: 'native-blank',
      prompt: '   \n\n'
    })
    expect(blank.title).toBe('')
  })

  it('reuses the opaque row id and first title when the same native triple is observed again', async () => {
    const first = await upsert({
      provider: 'pi',
      projectRoot: '/projects/one',
      nativeSessionId: 'native-keep',
      prompt: 'Original title\nBODY_ONE'
    })
    const second = await upsert({
      provider: 'pi',
      projectRoot: '/projects/one',
      nativeSessionId: 'native-keep',
      prompt: 'NEW_CANARY_TITLE\nBODY_TWO'
    })

    expect(second.id).toBe(first.id)
    expect(second.title).toBe('Original title')
    expect(second.title).not.toContain('NEW_CANARY_TITLE')
    expect(await listLocalAiCliSessions()).toHaveLength(1)
  })

  it('stores separate rows for one native id under another provider or project root', async () => {
    await upsert({
      provider: 'pi',
      projectRoot: '/projects/one',
      nativeSessionId: 'shared',
      prompt: 'a'
    })
    await upsert({
      provider: 'claude',
      projectRoot: '/projects/one',
      nativeSessionId: 'shared',
      prompt: 'b'
    })
    await upsert({
      provider: 'pi',
      projectRoot: '/projects/two',
      nativeSessionId: 'shared',
      prompt: 'c'
    })

    const sessions = await listLocalAiCliSessions()
    expect(sessions).toHaveLength(3)
    const ids = sessions.map((session) => session.id)
    expect(ids.filter((id, index) => ids.indexOf(id) === index)).toHaveLength(3)
  })

  it('keeps explicit state transitions and forgets only the pointer row', async () => {
    const created = await upsert({
      provider: 'pi',
      projectRoot: '/projects/one',
      nativeSessionId: 'native-state',
      prompt: 'state title'
    })
    expect(created.state).toBe('available')

    const missing = await markLocalAiCliSessionState(created.id, 'missing')
    expect(missing.state).toBe('missing')

    // A routine sighting updates the head and timestamps; it must not resurrect a missing pointer.
    const touched = await touchLocalAiCliSession(created.id, 'head-1')
    expect(touched.expectedHeadId).toBe('head-1')
    expect(touched.state).toBe('missing')

    await expect(markLocalAiCliSessionState('unknown-ref', 'missing')).rejects.toThrow(
      'LOCAL_AI_CLI_SESSION_NOT_FOUND'
    )

    expect(await forgetLocalAiCliSession(created.id)).toBe(true)
    expect(await forgetLocalAiCliSession(created.id)).toBe(false)
    expect(await getLocalAiCliSession(created.id)).toBeNull()
  })

  it('lists by project ownership and puts unowned pointers in Home', async () => {
    await client.execute({
      sql: `INSERT INTO projects (id, root_path, name, pinned, archived, created_at, updated_at, last_opened_at) VALUES ('project-filter', '/projects/filter', 'filter', 0, 0, 1, 1, 1)`
    })
    await upsert({
      projectId: 'project-filter',
      provider: 'pi',
      projectRoot: '/projects/filter',
      nativeSessionId: 'native-owned',
      prompt: 'owned'
    })
    await upsert({
      provider: 'pi',
      projectRoot: '/projects/one',
      nativeSessionId: 'native-home',
      prompt: 'home'
    })

    const owned = await listLocalAiCliSessions('project-filter')
    expect(owned.map((session) => session.projectId)).toEqual(['project-filter'])

    const home = await listLocalAiCliSessions(null)
    expect(home.map((session) => session.nativeSessionId)).toEqual(['native-home'])

    expect(await listLocalAiCliSessions()).toHaveLength(2)
  })

  it('binds a pointer to its conversation and hides it from the shell list', async () => {
    const bound = await upsert({
      conversationId: 'home-conversation-1',
      provider: 'pi',
      projectRoot: '/projects/one',
      nativeSessionId: 'native-bound',
      prompt: 'bound title'
    })
    const unbound = await upsert({
      provider: 'pi',
      projectRoot: '/projects/one',
      nativeSessionId: 'native-free',
      prompt: 'free title'
    })

    // Raw lookup by conversation is how the Pi provider recovers its own native id before a resume.
    const found = await getLocalAiCliSessionForConversation('home-conversation-1')
    expect(found?.id).toBe(bound.id)
    expect(found?.nativeSessionId).toBe('native-bound')
    expect(await getLocalAiCliSessionForConversation('home-conversation-2')).toBeNull()

    // The shell rows are pointers a user can open directly; a conversation-bound pointer is already
    // represented by its conversation, so listing it too would duplicate the row.
    const listed = await listLocalAiCliSessions()
    expect(listed.map((session) => session.id)).toEqual([unbound.id])
    expect((await listLocalAiCliSessions(null)).map((session) => session.id)).toEqual([unbound.id])
  })

  it('preserves an established conversation binding when a sighting omits it', async () => {
    const first = await upsert({
      conversationId: 'home-conversation-3',
      provider: 'pi',
      projectRoot: '/projects/one',
      nativeSessionId: 'native-keep-binding',
      prompt: 'title'
    })
    const refreshed = await upsert({
      provider: 'pi',
      projectRoot: '/projects/one',
      nativeSessionId: 'native-keep-binding',
      prompt: 'ignored title'
    })

    expect(refreshed.id).toBe(first.id)
    expect(refreshed.conversationId).toBe('home-conversation-3')
    expect((await getLocalAiCliSessionForConversation('home-conversation-3'))?.id).toBe(first.id)
  })

  it('marks adopted rows as discovered and only revives a missing pointer on rescan', async () => {
    await client.execute({
      sql: `INSERT INTO projects (id, root_path, name, pinned, archived, created_at, updated_at, last_opened_at) VALUES ('project-x', '/projects/x', 'x', 0, 0, 1, 1, 1)`
    })
    const candidate = {
      projectId: 'project-x',
      provider: 'pi' as const,
      projectRoot: '/projects/x',
      nativeSessionId: 'native-discovered',
      title: 'Discovered title',
      expectedHeadId: 'head-1',
      createdAt: 10,
      updatedAt: 20
    }

    const first = await upsertDiscoveredLocalAiCliSessions([candidate])
    expect(first.created).toBe(1)
    expect(first.sessions[0]).toMatchObject({
      origin: 'discovered',
      state: 'available',
      nativeSessionId: 'native-discovered',
      title: 'Discovered title',
      expectedHeadId: 'head-1'
    })
    const ref = first.sessions[0]!.id

    // A rescan reuses the opaque row, keeps the established title, and must not clear a conflict.
    await markLocalAiCliSessionState(ref, 'conflict')
    const rescanned = await upsertDiscoveredLocalAiCliSessions([candidate])
    expect(rescanned.created).toBe(0)
    expect(rescanned.sessions[0]!.id).toBe(ref)
    expect(rescanned.sessions[0]!.state).toBe('conflict')
    expect(rescanned.sessions[0]!.title).toBe('Discovered title')

    // Only `missing` is a state discovery is allowed to revive.
    await markLocalAiCliSessionState(ref, 'missing')
    const revived = await upsertDiscoveredLocalAiCliSessions([candidate])
    expect(revived.created).toBe(0)
    expect(revived.sessions[0]!.id).toBe(ref)
    expect(revived.sessions[0]!.state).toBe('available')

    expect(await listLocalAiCliSessions()).toHaveLength(1)
  })

  it('will not take over a Tuff-created pointer or its title during rescan', async () => {
    await client.execute({
      sql: `INSERT INTO projects (id, root_path, name, pinned, archived, created_at, updated_at, last_opened_at) VALUES ('project-y', '/projects/y', 'y', 0, 0, 1, 1, 1)`
    })
    const created = await upsert({
      projectId: 'project-y',
      provider: 'pi',
      projectRoot: '/projects/y',
      nativeSessionId: 'native-tuff',
      prompt: 'Tuff title'
    })

    const adopted = await upsertDiscoveredLocalAiCliSessions([
      {
        projectId: 'project-y',
        provider: 'pi',
        projectRoot: '/projects/y',
        nativeSessionId: 'native-tuff',
        title: 'Archive title',
        expectedHeadId: 'archive-head',
        createdAt: 1,
        updatedAt: 2
      }
    ])

    expect(adopted.created).toBe(0)
    expect(adopted.sessions[0]).toMatchObject({
      id: created.id,
      origin: 'tuff',
      title: 'Tuff title'
    })
  })

  it('rolls back the entire batch when one adopted candidate cannot be written', async () => {
    await client.execute({
      sql: `INSERT INTO projects (id, root_path, name, pinned, archived, created_at, updated_at, last_opened_at) VALUES ('project-z', '/projects/z', 'z', 0, 0, 1, 1, 1)`
    })
    const good = {
      projectId: 'project-z',
      provider: 'pi' as const,
      projectRoot: '/projects/z',
      nativeSessionId: 'native-good',
      title: 'good',
      expectedHeadId: null,
      createdAt: 1,
      updatedAt: 2
    }

    await expect(
      upsertDiscoveredLocalAiCliSessions([
        good,
        null as unknown as UpsertDiscoveredLocalAiCliSessionInput
      ])
    ).rejects.toThrow()

    // A partially committed batch would leave `native-good` behind.
    expect(await listLocalAiCliSessions()).toHaveLength(0)
  })
})
