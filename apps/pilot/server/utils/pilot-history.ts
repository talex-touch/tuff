import type { H3Event } from 'h3'
import { requirePilotDatabase } from './pilot-store'

const HISTORY_RETENTION_MS = 3 * 24 * 60 * 60 * 1000
const PRUNE_CACHE_KEY = '__pilotHistoryPrunedUsers'

function getRetentionCutoffIso(now = Date.now()): string {
  return new Date(now - HISTORY_RETENTION_MS).toISOString()
}

type PilotEventContext = H3Event['context'] & {
  [PRUNE_CACHE_KEY]?: Set<string>
}

export async function pruneExpiredPilotHistory(event: H3Event, userId: string): Promise<void> {
  const db = requirePilotDatabase(event)
  const cutoffIso = getRetentionCutoffIso()

  await db.prepare(`
    DELETE FROM pilot_chat_trace
    WHERE user_id = ?1
      AND session_id IN (
        SELECT session_id
        FROM pilot_chat_sessions
        WHERE user_id = ?1 AND updated_at < ?2
      )
  `).bind(userId, cutoffIso).run()

  await db.prepare(`
    DELETE FROM pilot_chat_messages
    WHERE user_id = ?1
      AND session_id IN (
        SELECT session_id
        FROM pilot_chat_sessions
        WHERE user_id = ?1 AND updated_at < ?2
      )
  `).bind(userId, cutoffIso).run()

  await db.prepare(`
    DELETE FROM pilot_chat_checkpoints
    WHERE user_id = ?1
      AND session_id IN (
        SELECT session_id
        FROM pilot_chat_sessions
        WHERE user_id = ?1 AND updated_at < ?2
      )
  `).bind(userId, cutoffIso).run()

  await db.prepare(`
    DELETE FROM pilot_chat_attachments
    WHERE user_id = ?1
      AND session_id IN (
        SELECT session_id
        FROM pilot_chat_sessions
        WHERE user_id = ?1 AND updated_at < ?2
      )
  `).bind(userId, cutoffIso).run()

  await db.prepare(`
    DELETE FROM pilot_chat_sessions
    WHERE user_id = ?1 AND updated_at < ?2
  `).bind(userId, cutoffIso).run()
}

export async function pruneExpiredPilotHistoryOnce(event: H3Event, userId: string): Promise<void> {
  const context = event.context as PilotEventContext
  if (!context[PRUNE_CACHE_KEY]) {
    context[PRUNE_CACHE_KEY] = new Set<string>()
  }
  const prunedUsers = context[PRUNE_CACHE_KEY]!

  if (prunedUsers.has(userId)) {
    return
  }

  await pruneExpiredPilotHistory(event, userId)
  prunedUsers.add(userId)
}
