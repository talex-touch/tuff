import type { H3Event } from 'h3'
import { getPilotDatabase, requirePilotDatabase } from './pilot-store'

const SETTINGS_TABLE = 'pilot_admin_settings'
const SETTINGS_PREFIX = 'storage.'
const CACHE_KEY = '__pilotAdminStorageSettings'

const STORAGE_KEYS = {
  attachmentProvider: `${SETTINGS_PREFIX}attachmentProvider`,
  attachmentPublicBaseUrl: `${SETTINGS_PREFIX}attachmentPublicBaseUrl`,
  minioEndpoint: `${SETTINGS_PREFIX}minioEndpoint`,
  minioBucket: `${SETTINGS_PREFIX}minioBucket`,
  minioAccessKey: `${SETTINGS_PREFIX}minioAccessKey`,
  minioSecretKey: `${SETTINGS_PREFIX}minioSecretKey`,
  minioRegion: `${SETTINGS_PREFIX}minioRegion`,
  minioForcePathStyle: `${SETTINGS_PREFIX}minioForcePathStyle`,
  minioPublicBaseUrl: `${SETTINGS_PREFIX}minioPublicBaseUrl`,
} as const

export interface PilotAdminStorageSettings {
  attachmentProvider?: 'auto' | 'memory' | 'r2' | 's3'
  attachmentPublicBaseUrl?: string
  minioEndpoint?: string
  minioBucket?: string
  minioAccessKey?: string
  minioSecretKey?: string
  minioRegion?: string
  minioForcePathStyle?: boolean
  minioPublicBaseUrl?: string
}

export interface UpdatePilotAdminStorageSettingsInput {
  attachmentProvider?: string | null
  attachmentPublicBaseUrl?: string | null
  minioEndpoint?: string | null
  minioBucket?: string | null
  minioAccessKey?: string | null
  minioSecretKey?: string | null
  minioRegion?: string | null
  minioForcePathStyle?: boolean | null
  minioPublicBaseUrl?: string | null
}

type PilotEventContext = H3Event['context'] & {
  [CACHE_KEY]?: PilotAdminStorageSettings
}

function normalizeStorageProvider(value: string | null | undefined): PilotAdminStorageSettings['attachmentProvider'] {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'auto' || normalized === 'memory' || normalized === 'r2' || normalized === 's3') {
    return normalized
  }
  if (normalized === 'minio') {
    return 's3'
  }
  return undefined
}

function normalizeString(value: string | null | undefined): string {
  return String(value || '').trim()
}

function normalizeUrl(value: string | null | undefined): string {
  return normalizeString(value).replace(/\/+$/, '')
}

function parseBoolean(value: string | null | undefined): boolean | undefined {
  const normalized = normalizeString(value).toLowerCase()
  if (!normalized) {
    return undefined
  }
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false
  }
  return undefined
}

async function ensurePilotAdminSettingsSchema(event: H3Event): Promise<void> {
  const db = getPilotDatabase(event)
  if (!db) {
    return
  }

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${SETTINGS_TABLE} (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `).run()
}

function parseSettingsRows(rows: Array<{ key: string, value: string }>): PilotAdminStorageSettings {
  const rowMap = new Map(rows.map(item => [item.key, item.value]))
  const attachmentProvider = normalizeStorageProvider(rowMap.get(STORAGE_KEYS.attachmentProvider))

  return {
    attachmentProvider,
    attachmentPublicBaseUrl: normalizeUrl(rowMap.get(STORAGE_KEYS.attachmentPublicBaseUrl)),
    minioEndpoint: normalizeUrl(rowMap.get(STORAGE_KEYS.minioEndpoint)),
    minioBucket: normalizeString(rowMap.get(STORAGE_KEYS.minioBucket)),
    minioAccessKey: normalizeString(rowMap.get(STORAGE_KEYS.minioAccessKey)),
    minioSecretKey: normalizeString(rowMap.get(STORAGE_KEYS.minioSecretKey)),
    minioRegion: normalizeString(rowMap.get(STORAGE_KEYS.minioRegion)),
    minioForcePathStyle: parseBoolean(rowMap.get(STORAGE_KEYS.minioForcePathStyle)),
    minioPublicBaseUrl: normalizeUrl(rowMap.get(STORAGE_KEYS.minioPublicBaseUrl)),
  }
}

function clearCache(event: H3Event): void {
  const context = event.context as PilotEventContext
  delete context[CACHE_KEY]
}

async function readSettingsRows(event: H3Event): Promise<Array<{ key: string, value: string }>> {
  const db = getPilotDatabase(event)
  if (!db) {
    return []
  }

  await ensurePilotAdminSettingsSchema(event)
  const { results } = await db.prepare(`
    SELECT key, value
    FROM ${SETTINGS_TABLE}
    WHERE key LIKE ?1
  `).bind(`${SETTINGS_PREFIX}%`).all<{ key: string, value: string }>()

  return Array.isArray(results) ? results : []
}

export async function getPilotAdminStorageSettings(event: H3Event): Promise<PilotAdminStorageSettings> {
  const context = event.context as PilotEventContext
  if (context[CACHE_KEY]) {
    return context[CACHE_KEY]
  }

  const rows = await readSettingsRows(event)
  const settings = parseSettingsRows(rows)
  context[CACHE_KEY] = settings
  return settings
}

async function upsertSetting(event: H3Event, key: string, value: string): Promise<void> {
  const db = requirePilotDatabase(event)
  await db.prepare(`
    INSERT INTO ${SETTINGS_TABLE} (key, value, updated_at)
    VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).bind(key, value).run()
}

async function deleteSetting(event: H3Event, key: string): Promise<void> {
  const db = requirePilotDatabase(event)
  await db.prepare(`
    DELETE FROM ${SETTINGS_TABLE}
    WHERE key = ?1
  `).bind(key).run()
}

async function upsertOptionalString(event: H3Event, key: string, value: string | null | undefined, normalize: (value: string) => string): Promise<void> {
  if (value === undefined) {
    return
  }
  const normalized = normalize(String(value || ''))
  if (!normalized) {
    await deleteSetting(event, key)
    return
  }
  await upsertSetting(event, key, normalized)
}

export async function updatePilotAdminStorageSettings(
  event: H3Event,
  input: UpdatePilotAdminStorageSettingsInput,
): Promise<PilotAdminStorageSettings> {
  await ensurePilotAdminSettingsSchema(event)

  if (input.attachmentProvider !== undefined) {
    const normalized = normalizeStorageProvider(input.attachmentProvider)
    if (!normalized) {
      await deleteSetting(event, STORAGE_KEYS.attachmentProvider)
    }
    else {
      await upsertSetting(event, STORAGE_KEYS.attachmentProvider, normalized)
    }
  }

  await upsertOptionalString(event, STORAGE_KEYS.attachmentPublicBaseUrl, input.attachmentPublicBaseUrl, value => value.trim().replace(/\/+$/, ''))
  await upsertOptionalString(event, STORAGE_KEYS.minioEndpoint, input.minioEndpoint, value => value.trim().replace(/\/+$/, ''))
  await upsertOptionalString(event, STORAGE_KEYS.minioBucket, input.minioBucket, value => value.trim())
  await upsertOptionalString(event, STORAGE_KEYS.minioAccessKey, input.minioAccessKey, value => value.trim())
  await upsertOptionalString(event, STORAGE_KEYS.minioSecretKey, input.minioSecretKey, value => value.trim())
  await upsertOptionalString(event, STORAGE_KEYS.minioRegion, input.minioRegion, value => value.trim())
  await upsertOptionalString(event, STORAGE_KEYS.minioPublicBaseUrl, input.minioPublicBaseUrl, value => value.trim().replace(/\/+$/, ''))

  if (input.minioForcePathStyle !== undefined && input.minioForcePathStyle !== null) {
    await upsertSetting(event, STORAGE_KEYS.minioForcePathStyle, input.minioForcePathStyle ? 'true' : 'false')
  }

  clearCache(event)
  return await getPilotAdminStorageSettings(event)
}
