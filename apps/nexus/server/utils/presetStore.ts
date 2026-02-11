import type { D1Database } from '@cloudflare/workers-types'
import type { PresetExportData } from '@talex-touch/utils'
import type { H3Event } from 'h3'
import { appSettingOriginData } from '@talex-touch/utils'
import { createHash } from 'node:crypto'
import { readCloudflareBindings } from './cloudflare'

const PRESET_TABLE = 'app_presets'
let schemaInitialized = false

export type PresetChannel = 'stable' | 'beta'

export interface PresetSummary {
  id: string
  slug: string
  name: string
  description: string
  channel: PresetChannel
  preview?: string
  source: 'nexus'
  compat?: {
    minAppVersion?: string
    maxAppVersion?: string
  }
  downloads: number
  updatedAt: string
}

interface PresetRow {
  id: string
  slug: string
  name: string
  description: string | null
  channel: string
  status: string
  tags: string | null
  preview_url: string | null
  payload_json: string | null
  payload_ref: string | null
  sha256: string | null
  compat_min: string | null
  compat_max: string | null
  download_count: number | null
  created_at: string
  updated_at: string
}

interface MemoryPresetRecord {
  id: string
  slug: string
  name: string
  description: string
  channel: PresetChannel
  status: 'published' | 'draft'
  tags: string[]
  previewUrl?: string
  payload: PresetExportData
  sha256: string
  compatMin?: string
  compatMax?: string
  downloadCount: number
  createdAt: string
  updatedAt: string
}

const memoryPresets = new Map<string, MemoryPresetRecord>()

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  )

  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`).join(',')}}`
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function ensureMemorySeed() {
  if (memoryPresets.size > 0) {
    return
  }

  const now = new Date().toISOString()
  const id = 'nexus-beta-default'
  const payload: PresetExportData = {
    version: 2,
    exportedAt: now,
    meta: {
      id,
      name: 'Nexus Beta Default',
      description: 'Default beta preset for layout and CoreBox canvas',
      channel: 'beta',
      source: 'nexus',
      compat: {
        minAppVersion: '2.4.0',
      },
      createdAt: now,
      updatedAt: now,
    },
    layout: appSettingOriginData.layoutAtomConfig,
    coreBox: appSettingOriginData.coreBoxThemeConfig,
    mainCanvas: {
      ...appSettingOriginData.layoutCanvasConfig,
      enabled: true,
      preset: 'custom',
    },
    coreBoxCanvas: {
      ...appSettingOriginData.coreBoxCanvasConfig,
      enabled: true,
      preset: 'custom',
    },
  }

  const digest = sha256Hex(stableSerialize(payload))

  memoryPresets.set(id, {
    id,
    slug: 'nexus-beta-default',
    name: payload.meta.name,
    description: payload.meta.description || '',
    channel: 'beta',
    status: 'published',
    tags: ['beta', 'layout', 'corebox'],
    payload,
    sha256: digest,
    compatMin: payload.meta.compat?.minAppVersion,
    compatMax: payload.meta.compat?.maxAppVersion,
    downloadCount: 0,
    createdAt: now,
    updatedAt: now,
  })
}

function normalizeChannel(value: unknown): PresetChannel {
  return value === 'stable' ? 'stable' : 'beta'
}

function mapRowToSummary(row: PresetRow): PresetSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description || '',
    channel: normalizeChannel(row.channel),
    preview: row.preview_url || undefined,
    source: 'nexus',
    compat: {
      minAppVersion: row.compat_min || undefined,
      maxAppVersion: row.compat_max || undefined,
    },
    downloads: row.download_count || 0,
    updatedAt: row.updated_at,
  }
}

function mapMemoryToSummary(row: MemoryPresetRecord): PresetSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    channel: row.channel,
    preview: row.previewUrl,
    source: 'nexus',
    compat: {
      minAppVersion: row.compatMin,
      maxAppVersion: row.compatMax,
    },
    downloads: row.downloadCount,
    updatedAt: row.updatedAt,
  }
}

function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

async function ensurePresetSchema(db: D1Database) {
  if (schemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${PRESET_TABLE} (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      channel TEXT NOT NULL DEFAULT 'beta',
      status TEXT NOT NULL DEFAULT 'draft',
      tags TEXT,
      preview_url TEXT,
      payload_json TEXT,
      payload_ref TEXT,
      sha256 TEXT,
      compat_min TEXT,
      compat_max TEXT,
      download_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_presets_status_channel ON ${PRESET_TABLE}(status, channel);`,
  ).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_presets_updated_at ON ${PRESET_TABLE}(updated_at);`).run()

  schemaInitialized = true
}

function parsePayload(raw: string | null): PresetExportData | null {
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as PresetExportData
  }
  catch {
    return null
  }
}

function enrichPayload(payload: PresetExportData, summary: PresetSummary): PresetExportData {
  return {
    ...payload,
    meta: {
      ...payload.meta,
      id: summary.id,
      name: payload.meta.name || summary.name,
      description: payload.meta.description || summary.description,
      channel: summary.channel,
      source: 'nexus',
      compat: {
        minAppVersion: summary.compat?.minAppVersion,
        maxAppVersion: summary.compat?.maxAppVersion,
      },
      updatedAt: summary.updatedAt,
    },
  }
}

export async function listPublishedPresets(
  event: H3Event,
  options: { channel?: PresetChannel } = {},
): Promise<PresetSummary[]> {
  const db = getD1Database(event)
  if (!db) {
    ensureMemorySeed()
    return Array.from(memoryPresets.values())
      .filter(item => item.status === 'published')
      .filter(item => !options.channel || item.channel === options.channel)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(mapMemoryToSummary)
  }

  await ensurePresetSchema(db)

  const params: unknown[] = ['published']
  let sql = `SELECT * FROM ${PRESET_TABLE} WHERE status = ?1`

  if (options.channel) {
    params.push(options.channel)
    sql += ` AND channel = ?${params.length}`
  }

  sql += ' ORDER BY updated_at DESC LIMIT 100'

  const result = await db.prepare(sql).bind(...params).all<PresetRow>()
  return (result.results || []).map(mapRowToSummary)
}

export async function getPublishedPresetDetail(
  event: H3Event,
  id: string,
): Promise<PresetSummary | null> {
  const db = getD1Database(event)
  if (!db) {
    ensureMemorySeed()
    const row = memoryPresets.get(id)
    if (!row || row.status !== 'published') {
      return null
    }
    return mapMemoryToSummary(row)
  }

  await ensurePresetSchema(db)

  const row = await db
    .prepare(`SELECT * FROM ${PRESET_TABLE} WHERE id = ?1 AND status = 'published' LIMIT 1`)
    .bind(id)
    .first<PresetRow>()

  return row ? mapRowToSummary(row) : null
}

export async function downloadPublishedPreset(
  event: H3Event,
  id: string,
): Promise<{ summary: PresetSummary; preset: PresetExportData; sha256: string; etag: string } | null> {
  const db = getD1Database(event)
  if (!db) {
    ensureMemorySeed()
    const row = memoryPresets.get(id)
    if (!row || row.status !== 'published') {
      return null
    }

    row.downloadCount += 1
    row.updatedAt = new Date().toISOString()

    const summary = mapMemoryToSummary(row)
    const preset = enrichPayload(row.payload, summary)
    const sha = row.sha256 || sha256Hex(stableSerialize(preset))

    return {
      summary,
      preset,
      sha256: sha,
      etag: `W/\"preset-${sha.slice(0, 20)}\"`,
    }
  }

  await ensurePresetSchema(db)

  const row = await db
    .prepare(`SELECT * FROM ${PRESET_TABLE} WHERE id = ?1 AND status = 'published' LIMIT 1`)
    .bind(id)
    .first<PresetRow>()

  if (!row) {
    return null
  }

  const payload = parsePayload(row.payload_json)
  if (!payload) {
    return null
  }

  const summary = mapRowToSummary(row)
  const preset = enrichPayload(payload, summary)
  const sha = row.sha256 || sha256Hex(stableSerialize(preset))

  await db
    .prepare(`UPDATE ${PRESET_TABLE} SET download_count = download_count + 1, updated_at = ?2 WHERE id = ?1`)
    .bind(id, new Date().toISOString())
    .run()

  return {
    summary,
    preset,
    sha256: sha,
    etag: `W/\"preset-${sha.slice(0, 20)}\"`,
  }
}
