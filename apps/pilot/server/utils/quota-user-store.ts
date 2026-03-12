import type { H3Event } from 'h3'
import { requirePilotDatabase } from './pilot-store'

const USER_CONFIG_TABLE = 'pilot_quota_user_config'
const DUMMY_STATE_TABLE = 'pilot_quota_dummy_state'
const SIGNIN_LOG_TABLE = 'pilot_quota_signin_log'

export interface QuotaUserConfig {
  pubInfo: string
  priInfo: string
  updatedAt: string
}

export interface QuotaDummyState {
  points: number
  signinCount: number
  lastSigninDate: string
  updatedAt: string
}

function nowIso(): string {
  return new Date().toISOString()
}

function todayDate(): string {
  return nowIso().slice(0, 10)
}

export async function ensureQuotaUserSchema(event: H3Event): Promise<void> {
  const db = requirePilotDatabase(event)

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${USER_CONFIG_TABLE} (
      user_id TEXT PRIMARY KEY,
      pub_info TEXT NOT NULL,
      pri_info TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${DUMMY_STATE_TABLE} (
      user_id TEXT PRIMARY KEY,
      points INTEGER NOT NULL DEFAULT 1000,
      signin_count INTEGER NOT NULL DEFAULT 0,
      last_signin_date TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${SIGNIN_LOG_TABLE} (
      user_id TEXT NOT NULL,
      sign_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, sign_date)
    );
  `).run()
}

export async function getQuotaUserConfig(event: H3Event, userId: string): Promise<QuotaUserConfig> {
  const db = requirePilotDatabase(event)
  const row = await db.prepare(`
    SELECT pub_info, pri_info, updated_at
    FROM ${USER_CONFIG_TABLE}
    WHERE user_id = ?1
    LIMIT 1
  `).bind(userId).first<{
    pub_info: string
    pri_info: string
    updated_at: string
  }>()

  if (!row) {
    return {
      pubInfo: '',
      priInfo: '',
      updatedAt: '',
    }
  }

  return {
    pubInfo: String(row.pub_info || ''),
    priInfo: String(row.pri_info || ''),
    updatedAt: String(row.updated_at || ''),
  }
}

export async function upsertQuotaUserConfig(event: H3Event, input: {
  userId: string
  pubInfo: string
  priInfo: string
}): Promise<QuotaUserConfig> {
  const db = requirePilotDatabase(event)
  const now = nowIso()

  await db.prepare(`
    INSERT INTO ${USER_CONFIG_TABLE}
      (user_id, pub_info, pri_info, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT(user_id) DO UPDATE SET
      pub_info = excluded.pub_info,
      pri_info = excluded.pri_info,
      updated_at = excluded.updated_at
  `).bind(
    input.userId,
    String(input.pubInfo || ''),
    String(input.priInfo || ''),
    now,
    now,
  ).run()

  return {
    pubInfo: String(input.pubInfo || ''),
    priInfo: String(input.priInfo || ''),
    updatedAt: now,
  }
}

export async function getOrInitQuotaDummyState(event: H3Event, userId: string): Promise<QuotaDummyState> {
  const db = requirePilotDatabase(event)
  const now = nowIso()

  await db.prepare(`
    INSERT INTO ${DUMMY_STATE_TABLE}
      (user_id, points, signin_count, last_signin_date, created_at, updated_at)
    VALUES (?1, 1000, 0, '', ?2, ?3)
    ON CONFLICT(user_id) DO NOTHING
  `).bind(userId, now, now).run()

  const row = await db.prepare(`
    SELECT points, signin_count, last_signin_date, updated_at
    FROM ${DUMMY_STATE_TABLE}
    WHERE user_id = ?1
    LIMIT 1
  `).bind(userId).first<{
    points: number | string
    signin_count: number | string
    last_signin_date: string
    updated_at: string
  }>()

  return {
    points: Number(row?.points || 0),
    signinCount: Number(row?.signin_count || 0),
    lastSigninDate: String(row?.last_signin_date || ''),
    updatedAt: String(row?.updated_at || ''),
  }
}

export async function quotaDailySignin(event: H3Event, userId: string): Promise<{ amount: number, points: number, signedToday: boolean }> {
  const db = requirePilotDatabase(event)
  const today = todayDate()
  const now = nowIso()

  await getOrInitQuotaDummyState(event, userId)

  const existed = await db.prepare(`
    SELECT sign_date
    FROM ${SIGNIN_LOG_TABLE}
    WHERE user_id = ?1 AND sign_date = ?2
    LIMIT 1
  `).bind(userId, today).first<{ sign_date: string }>()

  if (!existed) {
    await db.prepare(`
      INSERT INTO ${SIGNIN_LOG_TABLE} (user_id, sign_date, created_at)
      VALUES (?1, ?2, ?3)
    `).bind(userId, today, now).run()

    await db.prepare(`
      UPDATE ${DUMMY_STATE_TABLE}
      SET signin_count = signin_count + 1,
          points = points + 10,
          last_signin_date = ?2,
          updated_at = ?3
      WHERE user_id = ?1
    `).bind(userId, today, now).run()
  }

  const state = await getOrInitQuotaDummyState(event, userId)

  return {
    amount: state.signinCount,
    points: state.points,
    signedToday: true,
  }
}

export async function getQuotaSigninCalendar(
  event: H3Event,
  userId: string,
  year: number,
  month: number,
): Promise<{ data: string, amount: number }> {
  const db = requirePilotDatabase(event)
  const monthValue = Math.min(Math.max(Math.floor(month), 1), 12)
  const yearValue = Math.max(1970, Math.floor(year))
  const firstDay = `${yearValue}-${String(monthValue).padStart(2, '0')}-01`
  const nextMonthDate = new Date(`${firstDay}T00:00:00.000Z`)
  nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth() + 1)
  const nextMonth = `${nextMonthDate.getUTCFullYear()}-${String(nextMonthDate.getUTCMonth() + 1).padStart(2, '0')}-01`

  const { results } = await db.prepare(`
    SELECT sign_date
    FROM ${SIGNIN_LOG_TABLE}
    WHERE user_id = ?1 AND sign_date >= ?2 AND sign_date < ?3
  `).bind(userId, firstDay, nextMonth).all<{ sign_date: string }>()

  const dayCount = new Date(yearValue, monthValue, 0).getDate()
  const signedDays = new Set((results || []).map(item => Number(String(item.sign_date || '').slice(-2))))
  let bitmap = ''
  for (let day = 1; day <= dayCount; day += 1) {
    bitmap += signedDays.has(day) ? '1' : '0'
  }

  const state = await getOrInitQuotaDummyState(event, userId)
  return {
    data: bitmap,
    amount: state.signinCount,
  }
}
