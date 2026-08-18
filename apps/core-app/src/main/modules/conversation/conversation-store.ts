import { and, asc, desc, eq } from 'drizzle-orm'
import { scheduleDbWrite } from '../../db/db-write'
import { conversationMessages, conversations, conversationSyncState } from '../../db/schema'
import { databaseModule } from '../database'

export type ConversationRole = 'user' | 'assistant'
export type ConversationMessageStatus = 'complete' | 'streaming' | 'failed'

export interface StoredConversationMessage {
  id: string
  role: ConversationRole
  content: string
  status: ConversationMessageStatus
  meta?: Record<string, unknown>
  seq: number
  createdAt: number
}

export interface StoredConversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface ConversationWithMessages extends StoredConversation {
  messages: StoredConversationMessage[]
}

export interface SaveConversationInput {
  id: string
  title: string
  messages: Array<Omit<StoredConversationMessage, 'seq' | 'createdAt'> & { createdAt?: number }>
}

export interface ConversationSyncState {
  conversationId: string
  dirtyAt: number
  deletedAt: number | null
}

export interface ConversationMutation {
  type: 'upsert' | 'delete'
  conversationId: string
  updatedAt: number
  source: 'local' | 'sync'
}

const mutationListeners = new Set<(mutation: ConversationMutation) => void>()

export function subscribeConversationMutations(
  listener: (mutation: ConversationMutation) => void
): () => void {
  mutationListeners.add(listener)
  return () => mutationListeners.delete(listener)
}

function emitConversationMutation(mutation: ConversationMutation): void {
  for (const listener of mutationListeners) listener(mutation)
}

function parseMeta(value: string | null): Record<string, unknown> | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined
  } catch {
    // A row written by a newer build with a shape this one cannot read must not take down the whole
    // thread; the message text is the part the user actually needs back.
    return undefined
  }
}

async function writeConversationSnapshot(
  snapshot: ConversationWithMessages,
  label: string,
  notifySource: ConversationMutation['source'] | null
): Promise<void> {
  const db = databaseModule.getDb()
  await scheduleDbWrite(label, async () => {
    await db.transaction(async (tx) => {
      await tx
        .insert(conversations)
        .values({
          id: snapshot.id,
          title: snapshot.title,
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt
        })
        .onConflictDoUpdate({
          target: conversations.id,
          set: {
            title: snapshot.title,
            createdAt: snapshot.createdAt,
            updatedAt: snapshot.updatedAt
          }
        })

      await tx
        .delete(conversationMessages)
        .where(eq(conversationMessages.conversationId, snapshot.id))

      if (snapshot.messages.length > 0) {
        await tx.insert(conversationMessages).values(
          snapshot.messages.map((message, index) => ({
            id: message.id,
            conversationId: snapshot.id,
            role: message.role,
            content: message.content,
            status: message.status,
            meta: message.meta ? JSON.stringify(message.meta) : null,
            seq: index,
            createdAt: message.createdAt
          }))
        )
      }

      if (notifySource === 'local') {
        await tx
          .insert(conversationSyncState)
          .values({
            conversationId: snapshot.id,
            dirtyAt: snapshot.updatedAt,
            deletedAt: null
          })
          .onConflictDoUpdate({
            target: conversationSyncState.conversationId,
            set: { dirtyAt: snapshot.updatedAt, deletedAt: null }
          })
      } else {
        await tx
          .delete(conversationSyncState)
          .where(eq(conversationSyncState.conversationId, snapshot.id))
      }
    })
  })

  if (notifySource) {
    emitConversationMutation({
      type: 'upsert',
      conversationId: snapshot.id,
      updatedAt: snapshot.updatedAt,
      source: notifySource
    })
  }
}

export async function listConversations(limit = 200): Promise<StoredConversation[]> {
  const db = databaseModule.getDb()
  const rows = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.updatedAt))
    .limit(limit)
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }))
}

export async function getConversation(id: string): Promise<ConversationWithMessages | null> {
  const db = databaseModule.getDb()
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id))
  if (!conversation) return null

  const rows = await db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, id))
    .orderBy(asc(conversationMessages.seq))

  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages: rows.map((row) => ({
      id: row.id,
      role: row.role as ConversationRole,
      content: row.content,
      status: row.status as ConversationMessageStatus,
      meta: parseMeta(row.meta),
      seq: row.seq,
      createdAt: row.createdAt
    }))
  }
}

/**
 * Writes the whole thread.
 *
 * Replace-all rather than an append log because a turn is not append-only: streaming rewrites the
 * assistant message in place, retry clears and refills it, and stop can drop it entirely. Reconciling
 * those against stored rows would need the renderer to track a per-message dirty state it has no
 * other reason to keep. Threads are a few dozen short rows, so rewriting one is cheap.
 */
export async function saveConversation(input: SaveConversationInput): Promise<StoredConversation> {
  const db = databaseModule.getDb()
  const now = Date.now()
  const [existing] = await db.select().from(conversations).where(eq(conversations.id, input.id))
  const snapshot: ConversationWithMessages = {
    id: input.id,
    title: input.title,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    messages: input.messages.map((message, index) => ({
      ...message,
      seq: index,
      createdAt: message.createdAt ?? now
    }))
  }

  await writeConversationSnapshot(snapshot, 'conversation.save', 'local')
  return {
    id: snapshot.id,
    title: snapshot.title,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt
  }
}

export async function deleteConversation(id: string): Promise<{ deleted: boolean }> {
  const db = databaseModule.getDb()
  const deletedAt = Date.now()
  await scheduleDbWrite('conversation.delete', async () => {
    await db.transaction(async (tx) => {
      await tx.delete(conversations).where(eq(conversations.id, id))
      await tx
        .insert(conversationSyncState)
        .values({ conversationId: id, dirtyAt: deletedAt, deletedAt })
        .onConflictDoUpdate({
          target: conversationSyncState.conversationId,
          set: { dirtyAt: deletedAt, deletedAt }
        })
    })
  })
  emitConversationMutation({
    type: 'delete',
    conversationId: id,
    updatedAt: deletedAt,
    source: 'local'
  })
  return { deleted: true }
}

export async function renameConversation(id: string, title: string): Promise<{ renamed: boolean }> {
  const db = databaseModule.getDb()
  const updatedAt = Date.now()
  await scheduleDbWrite('conversation.rename', async () => {
    await db.transaction(async (tx) => {
      await tx
        .update(conversations)
        .set({ title, updatedAt })
        .where(and(eq(conversations.id, id)))
      await tx
        .insert(conversationSyncState)
        .values({ conversationId: id, dirtyAt: updatedAt, deletedAt: null })
        .onConflictDoUpdate({
          target: conversationSyncState.conversationId,
          set: { dirtyAt: updatedAt, deletedAt: null }
        })
    })
  })
  emitConversationMutation({ type: 'upsert', conversationId: id, updatedAt, source: 'local' })
  return { renamed: true }
}

export async function listConversationIdsForSync(): Promise<string[]> {
  const rows = await databaseModule.getDb().select({ id: conversations.id }).from(conversations)
  return rows.map((row) => row.id)
}

export async function listConversationSyncStates(): Promise<ConversationSyncState[]> {
  return databaseModule.getDb().select().from(conversationSyncState)
}

export async function getConversationSyncState(id: string): Promise<ConversationSyncState | null> {
  const [row] = await databaseModule
    .getDb()
    .select()
    .from(conversationSyncState)
    .where(eq(conversationSyncState.conversationId, id))
  return row ?? null
}

export async function clearConversationSyncState(
  id: string,
  expectedDirtyAt: number
): Promise<void> {
  const db = databaseModule.getDb()
  await scheduleDbWrite('conversation.sync-state.clear', () =>
    db
      .delete(conversationSyncState)
      .where(
        and(
          eq(conversationSyncState.conversationId, id),
          eq(conversationSyncState.dirtyAt, expectedDirtyAt)
        )
      )
  )
}

export async function applyConversationSyncSnapshot(
  snapshot: ConversationWithMessages
): Promise<void> {
  await writeConversationSnapshot(snapshot, 'conversation.sync-apply', 'sync')
}

export async function applyConversationSyncDeletion(id: string, deletedAt: number): Promise<void> {
  const db = databaseModule.getDb()
  await scheduleDbWrite('conversation.sync-delete', async () => {
    await db.transaction(async (tx) => {
      await tx.delete(conversations).where(eq(conversations.id, id))
      await tx.delete(conversationSyncState).where(eq(conversationSyncState.conversationId, id))
    })
  })
  emitConversationMutation({
    type: 'delete',
    conversationId: id,
    updatedAt: deletedAt,
    source: 'sync'
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeConversationSyncSnapshot(value: unknown): ConversationWithMessages | null {
  if (!isRecord(value) || !Array.isArray(value.messages)) return null
  if (
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.createdAt !== 'number' ||
    !Number.isFinite(value.createdAt) ||
    typeof value.updatedAt !== 'number' ||
    !Number.isFinite(value.updatedAt)
  ) {
    return null
  }

  const messages: StoredConversationMessage[] = []
  for (const [index, candidate] of value.messages.entries()) {
    if (!isRecord(candidate)) return null
    const role = candidate.role
    const status = candidate.status
    if (
      typeof candidate.id !== 'string' ||
      (role !== 'user' && role !== 'assistant') ||
      typeof candidate.content !== 'string' ||
      (status !== 'complete' && status !== 'streaming' && status !== 'failed') ||
      typeof candidate.createdAt !== 'number' ||
      !Number.isFinite(candidate.createdAt)
    ) {
      return null
    }
    messages.push({
      id: candidate.id,
      role,
      content: candidate.content,
      status,
      meta: isRecord(candidate.meta) ? candidate.meta : undefined,
      seq: index,
      createdAt: candidate.createdAt
    })
  }

  return {
    id: value.id,
    title: value.title,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    messages
  }
}
