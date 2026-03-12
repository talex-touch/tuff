import type { H3Event } from 'h3'
import { D1RuntimeStoreAdapter } from '@talex-touch/tuff-intelligence'
import { toGuestUserId } from './auth'
import { readPilotDeviceId } from './pilot-device'
import { ensurePilotQuotaSessionSchema } from './pilot-quota-session'
import { requirePilotDatabase } from './pilot-store'
import { ensureQuotaHistorySchema } from './quota-history-store'
import { ensureQuotaShareSchema } from './quota-share-store'
import { ensureQuotaUserSchema } from './quota-user-store'

const RUNTIME_TABLES = [
  'pilot_chat_sessions',
  'pilot_chat_messages',
  'pilot_chat_trace',
  'pilot_chat_checkpoints',
  'pilot_chat_attachments',
] as const

function toNonEmpty(value: unknown): string {
  return String(value || '').trim()
}

function toChanges(result: unknown): number {
  if (!result || typeof result !== 'object') {
    return 0
  }

  const raw = (result as { meta?: { changes?: number | string } }).meta?.changes
  const parsed = Number(raw || 0)
  if (!Number.isFinite(parsed)) {
    return 0
  }
  return Math.max(0, Math.floor(parsed))
}

export interface PilotGuestMergeReport {
  sourceUserId: string
  targetUserId: string
  changed: boolean
  stats: {
    runtimeRowsMoved: number
    quotaHistoryUpserted: number
    quotaSessionUpserted: number
    quotaShareUpserted: number
    quotaUserConfigInserted: number
    quotaDummyInserted: number
    quotaSigninInserted: number
    guestRowsDeleted: number
  }
}

export async function mergePilotGuestDataToUser(
  event: H3Event,
  input: {
    sourceUserId: string
    targetUserId: string
    reason: 'register' | 'login'
  },
): Promise<PilotGuestMergeReport> {
  const sourceUserId = toNonEmpty(input.sourceUserId)
  const targetUserId = toNonEmpty(input.targetUserId)
  const db = requirePilotDatabase(event)

  const report: PilotGuestMergeReport = {
    sourceUserId,
    targetUserId,
    changed: false,
    stats: {
      runtimeRowsMoved: 0,
      quotaHistoryUpserted: 0,
      quotaSessionUpserted: 0,
      quotaShareUpserted: 0,
      quotaUserConfigInserted: 0,
      quotaDummyInserted: 0,
      quotaSigninInserted: 0,
      guestRowsDeleted: 0,
    },
  }

  if (!sourceUserId || !targetUserId || sourceUserId === targetUserId) {
    return report
  }

  await ensureQuotaHistorySchema(event)
  await ensurePilotQuotaSessionSchema(event)
  await ensureQuotaUserSchema(event)
  await ensureQuotaShareSchema(event)
  await new D1RuntimeStoreAdapter(db, targetUserId).ensureSchema()

  for (const tableName of RUNTIME_TABLES) {
    const moved = toChanges(await db.prepare(`
      UPDATE ${tableName}
      SET user_id = ?1
      WHERE user_id = ?2
    `).bind(targetUserId, sourceUserId).run())
    report.stats.runtimeRowsMoved += moved
  }

  report.stats.quotaHistoryUpserted += toChanges(await db.prepare(`
    INSERT INTO pilot_quota_history
      (chat_id, user_id, topic, value, meta, created_at, updated_at)
    SELECT chat_id, ?1, topic, value, meta, created_at, updated_at
    FROM pilot_quota_history
    WHERE user_id = ?2
    ON CONFLICT(chat_id, user_id) DO UPDATE SET
      topic = excluded.topic,
      value = excluded.value,
      meta = excluded.meta,
      updated_at = excluded.updated_at
    WHERE excluded.updated_at > pilot_quota_history.updated_at
  `).bind(targetUserId, sourceUserId).run())

  report.stats.quotaSessionUpserted += toChanges(await db.prepare(`
    INSERT INTO pilot_quota_sessions
      (chat_id, user_id, runtime_session_id, channel_id, topic, created_at, updated_at)
    SELECT chat_id, ?1, runtime_session_id, channel_id, topic, created_at, updated_at
    FROM pilot_quota_sessions
    WHERE user_id = ?2
    ON CONFLICT(chat_id, user_id) DO UPDATE SET
      runtime_session_id = excluded.runtime_session_id,
      channel_id = excluded.channel_id,
      topic = excluded.topic,
      updated_at = excluded.updated_at
    WHERE excluded.updated_at > pilot_quota_sessions.updated_at
  `).bind(targetUserId, sourceUserId).run())

  report.stats.quotaShareUpserted += toChanges(await db.prepare(`
    INSERT INTO pilot_quota_shares
      (share_id, chat_id, user_id, topic, value, created_at, updated_at)
    SELECT
      'share_' || lower(hex(randomblob(8))) || lower(hex(randomblob(4))),
      chat_id,
      ?1,
      topic,
      value,
      created_at,
      updated_at
    FROM pilot_quota_shares
    WHERE user_id = ?2
    ON CONFLICT(chat_id, user_id) DO UPDATE SET
      topic = excluded.topic,
      value = excluded.value,
      updated_at = excluded.updated_at
    WHERE excluded.updated_at > pilot_quota_shares.updated_at
  `).bind(targetUserId, sourceUserId).run())

  report.stats.quotaUserConfigInserted += toChanges(await db.prepare(`
    INSERT OR IGNORE INTO pilot_quota_user_config
      (user_id, pub_info, pri_info, created_at, updated_at)
    SELECT ?1, pub_info, pri_info, created_at, updated_at
    FROM pilot_quota_user_config
    WHERE user_id = ?2
  `).bind(targetUserId, sourceUserId).run())

  report.stats.quotaDummyInserted += toChanges(await db.prepare(`
    INSERT OR IGNORE INTO pilot_quota_dummy_state
      (user_id, points, signin_count, last_signin_date, created_at, updated_at)
    SELECT ?1, points, signin_count, last_signin_date, created_at, updated_at
    FROM pilot_quota_dummy_state
    WHERE user_id = ?2
  `).bind(targetUserId, sourceUserId).run())

  report.stats.quotaSigninInserted += toChanges(await db.prepare(`
    INSERT OR IGNORE INTO pilot_quota_signin_log
      (user_id, sign_date, created_at)
    SELECT ?1, sign_date, created_at
    FROM pilot_quota_signin_log
    WHERE user_id = ?2
  `).bind(targetUserId, sourceUserId).run())

  const cleanupTables = [
    'pilot_quota_history',
    'pilot_quota_sessions',
    'pilot_quota_shares',
    'pilot_quota_user_config',
    'pilot_quota_dummy_state',
    'pilot_quota_signin_log',
  ] as const

  for (const tableName of cleanupTables) {
    const deleted = toChanges(await db.prepare(`
      DELETE FROM ${tableName}
      WHERE user_id = ?1
    `).bind(sourceUserId).run())
    report.stats.guestRowsDeleted += deleted
  }

  report.changed = Object.values(report.stats).some(value => value > 0)

  console.info('[pilot-auth] guest data merge completed', {
    reason: input.reason,
    sourceUserId: report.sourceUserId,
    targetUserId: report.targetUserId,
    changed: report.changed,
    stats: report.stats,
  })

  return report
}

export async function mergePilotGuestDataAfterAuth(
  event: H3Event,
  targetUserId: string,
  reason: 'register' | 'login',
): Promise<PilotGuestMergeReport | null> {
  const normalizedTargetUserId = toNonEmpty(targetUserId)
  if (!normalizedTargetUserId) {
    return null
  }

  const deviceId = readPilotDeviceId(event)
  if (!deviceId) {
    return null
  }

  const guestUserId = toGuestUserId(deviceId)
  if (!guestUserId || guestUserId === normalizedTargetUserId) {
    return null
  }

  return mergePilotGuestDataToUser(event, {
    sourceUserId: guestUserId,
    targetUserId: normalizedTargetUserId,
    reason,
  })
}
