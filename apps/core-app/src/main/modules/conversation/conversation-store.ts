import { and, asc, desc, eq } from 'drizzle-orm'
import { scheduleDbWrite } from '../../db/db-write'
import { conversationMessages, conversations } from '../../db/schema'
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

  // One scheduled unit: the delete and the re-insert must not be separated by another writer, or a
  // concurrent read would see the thread with its messages already gone.
  await scheduleDbWrite('conversation.save', async () => {
    if (existing) {
      await db
        .update(conversations)
        .set({ title: input.title, updatedAt: now })
        .where(eq(conversations.id, input.id))
    } else {
      await db
        .insert(conversations)
        .values({ id: input.id, title: input.title, createdAt: now, updatedAt: now })
    }

    await db.delete(conversationMessages).where(eq(conversationMessages.conversationId, input.id))

    if (input.messages.length > 0) {
      await db.insert(conversationMessages).values(
        input.messages.map((message, index) => ({
          id: message.id,
          conversationId: input.id,
          role: message.role,
          content: message.content,
          status: message.status,
          meta: message.meta ? JSON.stringify(message.meta) : null,
          seq: index,
          createdAt: message.createdAt ?? now
        }))
      )
    }
  })

  return {
    id: input.id,
    title: input.title,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  }
}

export async function deleteConversation(id: string): Promise<{ deleted: boolean }> {
  const db = databaseModule.getDb()
  // The message rows go with it through the cascade declared on the foreign key.
  await scheduleDbWrite('conversation.delete', () =>
    db.delete(conversations).where(eq(conversations.id, id))
  )
  return { deleted: true }
}

export async function renameConversation(id: string, title: string): Promise<{ renamed: boolean }> {
  const db = databaseModule.getDb()
  await scheduleDbWrite('conversation.rename', () =>
    db
      .update(conversations)
      .set({ title, updatedAt: Date.now() })
      .where(and(eq(conversations.id, id)))
  )
  return { renamed: true }
}
