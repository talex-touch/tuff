import type { LocalAiCliProviderId } from '@talex-touch/utils/transport/events/local-ai-cli'
import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { scheduleDbWrite } from '../../db/db-write'
import { localAiCliSessions } from '../../db/schema'
import { databaseModule } from '../database'

export type LocalAiCliSessionState = 'available' | 'missing' | 'conflict'
export type LocalAiCliSessionOrigin = 'tuff' | 'discovered'

export interface StoredLocalAiCliSession {
  id: string
  conversationId: string | null
  projectId: string | null
  provider: LocalAiCliProviderId
  projectRoot: string
  nativeSessionId: string
  title: string
  state: LocalAiCliSessionState
  origin: LocalAiCliSessionOrigin
  expectedHeadId: string | null
  createdAt: number
  updatedAt: number
  lastSeenAt: number
}

export interface UpsertLocalAiCliSessionInput {
  conversationId?: string
  projectId: string | null
  provider: LocalAiCliProviderId
  projectRoot: string
  nativeSessionId: string
  prompt: string
  expectedHeadId?: string | null
}

export interface UpsertDiscoveredLocalAiCliSessionInput {
  projectId: string
  provider: LocalAiCliProviderId
  projectRoot: string
  nativeSessionId: string
  title: string
  expectedHeadId: string | null
  createdAt: number
  updatedAt: number
}

export interface LocalAiCliSessionMutation {
  sessionRef: string
  projectId: string | null
  type: 'upsert' | 'forget'
}

const mutationListeners = new Set<(mutation: LocalAiCliSessionMutation) => void>()

export function subscribeLocalAiCliSessionMutations(
  listener: (mutation: LocalAiCliSessionMutation) => void
): () => void {
  mutationListeners.add(listener)
  return () => mutationListeners.delete(listener)
}

function publishSessionMutation(
  session: Pick<StoredLocalAiCliSession, 'id' | 'projectId'>,
  type: LocalAiCliSessionMutation['type']
): void {
  const mutation = { sessionRef: session.id, projectId: session.projectId, type }
  for (const listener of mutationListeners) listener(mutation)
}

function asStoredSession(row: typeof localAiCliSessions.$inferSelect): StoredLocalAiCliSession {
  if (
    (row.provider !== 'pi' &&
      row.provider !== 'codex' &&
      row.provider !== 'claude' &&
      row.provider !== 'oh-my-pi') ||
    (row.state !== 'available' && row.state !== 'missing' && row.state !== 'conflict') ||
    (row.origin !== 'tuff' && row.origin !== 'discovered')
  ) {
    throw new Error('LOCAL_AI_CLI_SESSION_INVALID')
  }
  return {
    ...row,
    provider: row.provider as LocalAiCliProviderId,
    state: row.state as LocalAiCliSessionState,
    origin: row.origin as LocalAiCliSessionOrigin
  }
}

function boundedPromptTitle(prompt: string): string {
  const firstLine = prompt
    .split(/\r?\n/u)
    .find((line) => line.trim())
    ?.trim()
  return firstLine ? Array.from(firstLine).slice(0, 120).join('') : ''
}

export async function listLocalAiCliSessions(
  projectId?: string | null
): Promise<StoredLocalAiCliSession[]> {
  const db = databaseModule.getDb()
  const query = db.select().from(localAiCliSessions)
  const rows =
    projectId === undefined
      ? await query
          .where(isNull(localAiCliSessions.conversationId))
          .orderBy(desc(localAiCliSessions.lastSeenAt))
      : await query
          .where(
            and(
              isNull(localAiCliSessions.conversationId),
              projectId === null
                ? isNull(localAiCliSessions.projectId)
                : eq(localAiCliSessions.projectId, projectId)
            )
          )
          .orderBy(desc(localAiCliSessions.lastSeenAt))
  return rows.map(asStoredSession)
}

export async function getLocalAiCliSession(
  sessionRef: string
): Promise<StoredLocalAiCliSession | null> {
  const [row] = await databaseModule
    .getDb()
    .select()
    .from(localAiCliSessions)
    .where(eq(localAiCliSessions.id, sessionRef))
  return row ? asStoredSession(row) : null
}

export async function getLocalAiCliSessionForConversation(
  conversationId: string
): Promise<StoredLocalAiCliSession | null> {
  const [row] = await databaseModule
    .getDb()
    .select()
    .from(localAiCliSessions)
    .where(eq(localAiCliSessions.conversationId, conversationId))
  return row ? asStoredSession(row) : null
}

export async function upsertLocalAiCliSession(
  input: UpsertLocalAiCliSessionInput
): Promise<StoredLocalAiCliSession> {
  const db = databaseModule.getDb()
  const now = Date.now()
  const title = boundedPromptTitle(input.prompt)
  const session = await scheduleDbWrite('local-ai-cli-session.upsert', async () => {
    const [existing] = await db
      .select()
      .from(localAiCliSessions)
      .where(
        and(
          eq(localAiCliSessions.provider, input.provider),
          eq(localAiCliSessions.projectRoot, input.projectRoot),
          eq(localAiCliSessions.nativeSessionId, input.nativeSessionId)
        )
      )

    if (existing) {
      const [updated] = await db
        .update(localAiCliSessions)
        .set({
          conversationId:
            input.conversationId === undefined ? existing.conversationId : input.conversationId,
          projectId: input.projectId,
          title: existing.title || title,
          state: 'available',
          expectedHeadId:
            input.expectedHeadId === undefined ? existing.expectedHeadId : input.expectedHeadId,
          updatedAt: now,
          lastSeenAt: now
        })
        .where(eq(localAiCliSessions.id, existing.id))
        .returning()
      if (!updated) throw new Error('LOCAL_AI_CLI_SESSION_WRITE_FAILED')
      return asStoredSession(updated)
    }

    const [created] = await db
      .insert(localAiCliSessions)
      .values({
        id: randomUUID(),
        conversationId: input.conversationId ?? null,
        projectId: input.projectId,
        provider: input.provider,
        projectRoot: input.projectRoot,
        nativeSessionId: input.nativeSessionId,
        title,
        state: 'available',
        origin: 'tuff',
        expectedHeadId: input.expectedHeadId ?? null,
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now
      })
      .returning()
    if (!created) throw new Error('LOCAL_AI_CLI_SESSION_WRITE_FAILED')
    return asStoredSession(created)
  })
  publishSessionMutation(session, 'upsert')
  return session
}

export async function upsertDiscoveredLocalAiCliSessions(
  inputs: readonly UpsertDiscoveredLocalAiCliSessionInput[]
): Promise<{ sessions: StoredLocalAiCliSession[]; created: number }> {
  const db = databaseModule.getDb()
  const now = Date.now()
  const result = await scheduleDbWrite('local-ai-cli-session.discover', () =>
    db.transaction(async (tx) => {
      const sessions: StoredLocalAiCliSession[] = []
      let createdCount = 0

      for (const input of inputs) {
        const sourceUpdatedAt =
          Number.isFinite(input.updatedAt) && input.updatedAt > 0
            ? Math.min(input.updatedAt, now)
            : now
        const sourceCreatedAt =
          Number.isFinite(input.createdAt) && input.createdAt > 0
            ? Math.min(input.createdAt, sourceUpdatedAt)
            : sourceUpdatedAt
        const title = boundedPromptTitle(input.title)
        const [existing] = await tx
          .select()
          .from(localAiCliSessions)
          .where(
            and(
              eq(localAiCliSessions.provider, input.provider),
              eq(localAiCliSessions.projectRoot, input.projectRoot),
              eq(localAiCliSessions.nativeSessionId, input.nativeSessionId)
            )
          )

        if (existing) {
          const [updated] = await tx
            .update(localAiCliSessions)
            .set({
              projectId: input.projectId,
              title: existing.title || title,
              state: existing.state === 'missing' ? 'available' : existing.state,
              updatedAt: now,
              lastSeenAt: Math.max(existing.lastSeenAt, sourceUpdatedAt)
            })
            .where(eq(localAiCliSessions.id, existing.id))
            .returning()
          if (!updated) throw new Error('LOCAL_AI_CLI_SESSION_WRITE_FAILED')
          sessions.push(asStoredSession(updated))
          continue
        }

        const [created] = await tx
          .insert(localAiCliSessions)
          .values({
            id: randomUUID(),
            projectId: input.projectId,
            provider: input.provider,
            projectRoot: input.projectRoot,
            nativeSessionId: input.nativeSessionId,
            title,
            state: 'available',
            origin: 'discovered',
            expectedHeadId: input.expectedHeadId,
            createdAt: sourceCreatedAt,
            updatedAt: now,
            lastSeenAt: sourceUpdatedAt
          })
          .returning()
        if (!created) throw new Error('LOCAL_AI_CLI_SESSION_WRITE_FAILED')
        sessions.push(asStoredSession(created))
        createdCount += 1
      }
      return { sessions, created: createdCount }
    })
  )
  for (const session of result.sessions) publishSessionMutation(session, 'upsert')
  return result
}

export async function markLocalAiCliSessionState(
  sessionRef: string,
  state: LocalAiCliSessionState,
  expectedHeadId?: string
): Promise<StoredLocalAiCliSession> {
  const db = databaseModule.getDb()
  const now = Date.now()
  const [updated] = await scheduleDbWrite('local-ai-cli-session.mark-state', () =>
    db
      .update(localAiCliSessions)
      .set({
        state,
        ...(expectedHeadId === undefined ? {} : { expectedHeadId }),
        updatedAt: now,
        lastSeenAt: now
      })
      .where(eq(localAiCliSessions.id, sessionRef))
      .returning()
  )
  if (!updated) throw new Error('LOCAL_AI_CLI_SESSION_NOT_FOUND')
  const session = asStoredSession(updated)
  publishSessionMutation(session, 'upsert')
  return session
}

export async function touchLocalAiCliSession(
  sessionRef: string,
  expectedHeadId?: string
): Promise<StoredLocalAiCliSession> {
  const db = databaseModule.getDb()
  const now = Date.now()
  const [updated] = await scheduleDbWrite('local-ai-cli-session.touch', () =>
    db
      .update(localAiCliSessions)
      .set({
        ...(expectedHeadId === undefined ? {} : { expectedHeadId }),
        updatedAt: now,
        lastSeenAt: now
      })
      .where(eq(localAiCliSessions.id, sessionRef))
      .returning()
  )
  if (!updated) throw new Error('LOCAL_AI_CLI_SESSION_NOT_FOUND')
  const session = asStoredSession(updated)
  publishSessionMutation(session, 'upsert')
  return session
}

export async function forgetLocalAiCliSession(sessionRef: string): Promise<boolean> {
  const db = databaseModule.getDb()
  const deleted = await scheduleDbWrite('local-ai-cli-session.forget', () =>
    db
      .delete(localAiCliSessions)
      .where(eq(localAiCliSessions.id, sessionRef))
      .returning({ id: localAiCliSessions.id, projectId: localAiCliSessions.projectId })
  )
  const session = deleted[0]
  if (!session) return false
  publishSessionMutation(session, 'forget')
  return true
}
