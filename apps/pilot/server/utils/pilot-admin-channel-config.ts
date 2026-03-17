import type { H3Event } from 'h3'
import type {
  PilotBuiltinTool,
  PilotChannelAdapter,
  PilotChannelModelConfig,
  PilotChannelTransport,
} from './pilot-channel'
import { decryptConfigValue, encryptConfigValue } from './pilot-config-crypto'
import { getPilotDatabase, requirePilotDatabase } from './pilot-store'

const SETTINGS_TABLE = 'pilot_admin_settings'
const CHANNELS_KEY = 'channel.catalog'
const DEFAULT_CHANNEL_KEY = 'channel.defaultId'
const CACHE_KEY = '__pilotAdminChannelCatalog'
const DEFAULT_TIMEOUT_MS = 90_000
const MIN_TIMEOUT_MS = 3_000
const MAX_TIMEOUT_MS = 10 * 60 * 1000
const SUPPORTED_BUILTIN_TOOLS: PilotBuiltinTool[] = [
  'write_todos',
  'read_file',
  'write_file',
  'edit_file',
  'ls',
  'websearch',
]

type PilotEventContext = H3Event['context'] & {
  [CACHE_KEY]?: PilotAdminChannelCatalog
}

export interface PilotAdminChannelItem {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
  defaultModelId?: string
  models?: PilotChannelModelConfig[]
  adapter: PilotChannelAdapter
  transport: PilotChannelTransport
  timeoutMs: number
  builtinTools: PilotBuiltinTool[]
  enabled: boolean
  modelsLastSyncedAt?: string
  modelsSyncError?: string
}

export interface PilotAdminChannelCatalog {
  channels: PilotAdminChannelItem[]
  defaultChannelId: string
}

export interface UpdatePilotAdminChannelCatalogInput {
  channels: Array<Partial<PilotAdminChannelItem> & { id: string }>
  defaultChannelId?: string
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeAdapter(value: unknown): PilotChannelAdapter {
  return normalizeText(value).toLowerCase() === 'openai' ? 'openai' : 'legacy'
}

function normalizeTransport(value: unknown, adapter: PilotChannelAdapter): PilotChannelTransport {
  if (adapter === 'legacy') {
    return 'responses'
  }
  const normalized = normalizeText(value).toLowerCase()
  return normalized === 'chat.completions' || normalized === 'chat_completions' || normalized === 'completions'
    ? 'chat.completions'
    : 'responses'
}

function normalizeTimeoutMs(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TIMEOUT_MS
  }
  return Math.min(Math.max(Math.floor(parsed), MIN_TIMEOUT_MS), MAX_TIMEOUT_MS)
}

function normalizeTools(value: unknown): PilotBuiltinTool[] {
  if (!Array.isArray(value)) {
    return ['write_todos']
  }
  const list = value
    .map(item => normalizeText(item))
    .filter(item => SUPPORTED_BUILTIN_TOOLS.includes(item as PilotBuiltinTool)) as PilotBuiltinTool[]
  if (list.length <= 0) {
    return ['write_todos']
  }
  return Array.from(new Set(list))
}

function normalizeBoolean(value: unknown, fallback = true): boolean {
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized) {
    return fallback
  }
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false
  }
  return fallback
}

function normalizeChannelModelRow(raw: unknown): PilotChannelModelConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const row = raw as Record<string, unknown>
  const id = normalizeText(row.id)
  if (!id) {
    return null
  }
  return {
    id,
    label: normalizeText(row.label) || undefined,
    enabled: normalizeBoolean(row.enabled, true),
    thinkingSupported: normalizeBoolean(row.thinkingSupported, true),
    thinkingDefaultEnabled: normalizeBoolean(row.thinkingDefaultEnabled, false),
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : undefined,
  }
}

function normalizeChannelModels(value: unknown, fallbackModel: string): PilotChannelModelConfig[] {
  const models = Array.isArray(value)
    ? value
      .map(item => normalizeChannelModelRow(item))
      .filter((item): item is PilotChannelModelConfig => Boolean(item))
    : []

  if (models.length <= 0) {
    const fallbackId = normalizeText(fallbackModel) || 'gpt-5.2'
    return [{
      id: fallbackId,
      label: fallbackId,
      enabled: true,
      thinkingSupported: true,
      thinkingDefaultEnabled: false,
    }]
  }

  const deduped = new Map<string, PilotChannelModelConfig>()
  for (const item of models) {
    if (!deduped.has(item.id)) {
      deduped.set(item.id, item)
      continue
    }
    const existing = deduped.get(item.id)!
    deduped.set(item.id, {
      ...existing,
      ...item,
    })
  }
  return Array.from(deduped.values())
}

function normalizeDefaultModelId(
  value: unknown,
  models: PilotChannelModelConfig[],
  fallbackModel: string,
): string {
  const modelId = normalizeText(value)
  if (modelId && models.some(item => item.id === modelId)) {
    return modelId
  }

  const fallbackId = normalizeText(fallbackModel)
  if (fallbackId && models.some(item => item.id === fallbackId)) {
    return fallbackId
  }

  return models.find(item => item.enabled !== false)?.id || models[0]?.id || 'gpt-5.2'
}

function nowIso(): string {
  return new Date().toISOString()
}

async function ensureAdminSettingsSchema(event: H3Event): Promise<void> {
  const db = getPilotDatabase(event)
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${SETTINGS_TABLE} (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `).run()
}

async function readSetting(event: H3Event, key: string): Promise<string> {
  const db = getPilotDatabase(event)
  await ensureAdminSettingsSchema(event)
  const row = await db.prepare(`
    SELECT value
    FROM ${SETTINGS_TABLE}
    WHERE key = ?1
    LIMIT 1
  `).bind(key).first<{ value: string }>()
  return normalizeText(row?.value)
}

async function upsertSetting(event: H3Event, key: string, value: string): Promise<void> {
  const db = requirePilotDatabase(event)
  const now = nowIso()
  await ensureAdminSettingsSchema(event)
  await db.prepare(`
    INSERT INTO ${SETTINGS_TABLE} (key, value, updated_at)
    VALUES (?1, ?2, ?3)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).bind(key, value, now).run()
}

function clearCache(event: H3Event): void {
  const context = event.context as PilotEventContext
  delete context[CACHE_KEY]
}

function mergeChannelInputWithExisting(
  row: Partial<PilotAdminChannelItem> & { id: string },
  existingMap: Map<string, PilotAdminChannelItem>,
): Record<string, unknown> {
  const id = normalizeText(row.id)
  const existing = existingMap.get(id)
  const nextApiKey = normalizeText(row.apiKey)

  return {
    ...existing,
    ...row,
    id,
    apiKey: nextApiKey || existing?.apiKey || '',
    models: Array.isArray(row.models) ? row.models : existing?.models,
    defaultModelId: normalizeText(row.defaultModelId) || existing?.defaultModelId,
    modelsLastSyncedAt: normalizeText(row.modelsLastSyncedAt) || existing?.modelsLastSyncedAt,
    modelsSyncError: typeof row.modelsSyncError === 'string'
      ? row.modelsSyncError
      : existing?.modelsSyncError,
  }
}

function normalizeChannelRow(raw: unknown): PilotAdminChannelItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const row = raw as Record<string, unknown>
  const id = normalizeText(row.id)
  const baseUrl = normalizeText(row.baseUrl).replace(/\/+$/, '')
  const apiKey = normalizeText(row.apiKey)
  if (!id || !baseUrl || !apiKey) {
    return null
  }
  const adapter = normalizeAdapter(row.adapter)
  const fallbackModel = normalizeText(row.model) || 'gpt-5.2'
  const models = normalizeChannelModels(row.models, fallbackModel)
  const defaultModelId = normalizeDefaultModelId(row.defaultModelId, models, fallbackModel)
  return {
    id,
    name: normalizeText(row.name) || id,
    baseUrl,
    apiKey,
    model: defaultModelId,
    defaultModelId,
    models,
    adapter,
    transport: normalizeTransport(row.transport, adapter),
    timeoutMs: normalizeTimeoutMs(row.timeoutMs ?? row.timeout),
    builtinTools: normalizeTools(row.builtinTools),
    enabled: normalizeBoolean(row.enabled, true),
    modelsLastSyncedAt: normalizeText(row.modelsLastSyncedAt) || undefined,
    modelsSyncError: typeof row.modelsSyncError === 'string'
      ? normalizeText(row.modelsSyncError) || undefined
      : undefined,
  }
}

function encodeChannels(channels: PilotAdminChannelItem[]): string {
  const encoded = channels.map(item => ({
    ...item,
    apiKey: encryptConfigValue(item.apiKey),
  }))
  return JSON.stringify(encoded)
}

function decodeChannels(raw: string): PilotAdminChannelItem[] {
  if (!raw) {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null
        }
        const row = item as Record<string, unknown>
        return normalizeChannelRow({
          ...row,
          apiKey: decryptConfigValue(normalizeText(row.apiKey)),
        })
      })
      .filter((item): item is PilotAdminChannelItem => Boolean(item))
  }
  catch {
    return []
  }
}

export async function getPilotAdminChannelCatalog(event: H3Event): Promise<PilotAdminChannelCatalog> {
  const context = event.context as PilotEventContext
  if (context[CACHE_KEY]) {
    return context[CACHE_KEY]
  }

  const channelsRaw = await readSetting(event, CHANNELS_KEY)
  const channels = decodeChannels(channelsRaw)
  const configuredDefault = await readSetting(event, DEFAULT_CHANNEL_KEY)
  const enabled = channels.filter(item => item.enabled)
  const defaultCandidates = enabled.length > 0 ? enabled : channels
  const defaultChannelId = defaultCandidates.find(item => item.id === configuredDefault)?.id || defaultCandidates[0]?.id || ''
  const catalog: PilotAdminChannelCatalog = {
    channels,
    defaultChannelId,
  }
  context[CACHE_KEY] = catalog
  return catalog
}

export async function updatePilotAdminChannelCatalog(
  event: H3Event,
  input: UpdatePilotAdminChannelCatalogInput,
): Promise<PilotAdminChannelCatalog> {
  const existingCatalog = await getPilotAdminChannelCatalog(event)
  const existingMap = new Map<string, PilotAdminChannelItem>(
    existingCatalog.channels.map(item => [item.id, item]),
  )

  const normalizedChannels: PilotAdminChannelItem[] = []
  const rejectedChannels: Array<{ id: string, missing: string[] }> = []

  for (const row of input.channels) {
    const merged = mergeChannelInputWithExisting(row, existingMap)
    const normalized = normalizeChannelRow(merged)
    if (normalized) {
      normalizedChannels.push(normalized)
      continue
    }

    const missing: string[] = []
    if (!normalizeText(merged.id)) {
      missing.push('id')
    }
    if (!normalizeText(merged.baseUrl)) {
      missing.push('baseUrl')
    }
    if (!normalizeText(merged.apiKey)) {
      missing.push('apiKey')
    }
    rejectedChannels.push({
      id: normalizeText(row.id) || '(empty)',
      missing,
    })
  }

  if (rejectedChannels.length > 0) {
    console.warn('[pilot][channel] ignored invalid channels when saving catalog', {
      rejectedChannels,
    })
  }

  await upsertSetting(event, CHANNELS_KEY, encodeChannels(normalizedChannels))
  const defaultChannelId = normalizeText(input.defaultChannelId)
  await upsertSetting(event, DEFAULT_CHANNEL_KEY, defaultChannelId)

  console.info('[pilot][channel] catalog updated', {
    inputCount: input.channels.length,
    savedCount: normalizedChannels.length,
    defaultChannelId,
  })

  clearCache(event)
  return await getPilotAdminChannelCatalog(event)
}
