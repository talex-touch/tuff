import type { H3Event } from 'h3'
import process from 'node:process'
import { resolvePilotConfigString } from './pilot-config'

export type PilotChannelTransport = 'auto' | 'responses' | 'chat.completions'
export type PilotBuiltinTool = 'write_todos' | 'read_file' | 'write_file' | 'edit_file' | 'ls'

const DEFAULT_CHANNEL_ID = 'default'
const DEFAULT_MODEL = 'gpt-5.4'
const DEFAULT_AUTO_TRANSPORT: Exclude<PilotChannelTransport, 'auto'> = 'responses'
const DEFAULT_AUTO_CACHE_TTL_MS = 5 * 60 * 1000

const SUPPORTED_BUILTIN_TOOLS: PilotBuiltinTool[] = [
  'write_todos',
  'read_file',
  'write_file',
  'edit_file',
  'ls',
]

export interface PilotChannelConfig {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
  transport: PilotChannelTransport
  builtinTools: PilotBuiltinTool[]
  enabled: boolean
}

export interface PilotChannelCatalog {
  channels: PilotChannelConfig[]
  defaultChannelId: string
}

export interface ResolvePilotChannelSelectionOptions {
  requestChannelId?: string
  sessionChannelId?: string
}

export interface ResolvedPilotChannelSelection {
  channel: PilotChannelConfig
  channelId: string
  transport: Exclude<PilotChannelTransport, 'auto'>
  selectionSource: 'request' | 'session' | 'default' | 'fallback'
  usedCachedTransport: boolean
  defaultChannelId: string
}

interface AutoTransportCacheEntry {
  transport: Exclude<PilotChannelTransport, 'auto'>
  expiresAt: number
}

const autoTransportCache = new Map<string, AutoTransportCacheEntry>()

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) {
    return fallback
  }
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
    return true
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
    return false
  }
  return fallback
}

function normalizeTransport(value: unknown): PilotChannelTransport {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'responses') {
    return 'responses'
  }
  if (normalized === 'chat.completions' || normalized === 'chat_completions' || normalized === 'completions') {
    return 'chat.completions'
  }
  return 'auto'
}

function normalizeBuiltinTools(value: unknown): PilotBuiltinTool[] {
  if (!Array.isArray(value)) {
    return ['write_todos']
  }

  const list = value
    .map(item => String(item || '').trim())
    .filter((item): item is PilotBuiltinTool => SUPPORTED_BUILTIN_TOOLS.includes(item as PilotBuiltinTool))

  if (list.length <= 0) {
    return ['write_todos']
  }

  return Array.from(new Set(list))
}

function normalizeChannelItem(raw: unknown): PilotChannelConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }

  const row = raw as Record<string, unknown>
  const id = toStringValue(row.id)
  const baseUrl = toStringValue(row.baseUrl)
  const apiKey = toStringValue(row.apiKey)
  if (!id || !baseUrl || !apiKey) {
    return null
  }

  return {
    id,
    name: toStringValue(row.name) || id,
    baseUrl,
    apiKey,
    model: toStringValue(row.model) || DEFAULT_MODEL,
    transport: normalizeTransport(row.transport),
    builtinTools: normalizeBuiltinTools(row.builtinTools),
    enabled: toBoolean(row.enabled, true),
  }
}

function parseChannelsJson(raw: string): PilotChannelConfig[] {
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map(normalizeChannelItem)
      .filter((item): item is PilotChannelConfig => Boolean(item))
  }
  catch {
    return []
  }
}

function resolveRawFromCloudflare(event: H3Event, key: string): string {
  const cloudflareEnv = (event.context.cloudflare as { env?: Record<string, unknown> } | undefined)?.env
  return toStringValue(cloudflareEnv?.[key])
}

function resolveRawFromRuntimeConfig(event: H3Event, key: string): string {
  const runtimeConfig = (event.context as { runtimeConfig?: Record<string, unknown> }).runtimeConfig
  const pilot = runtimeConfig?.pilot && typeof runtimeConfig.pilot === 'object'
    ? (runtimeConfig.pilot as Record<string, unknown>)
    : {}
  return toStringValue(pilot[key])
}

function resolveRaw(event: H3Event, key: string): string {
  const fromCloudflare = resolveRawFromCloudflare(event, key)
  if (fromCloudflare) {
    return fromCloudflare
  }

  const fromProcess = toStringValue(process.env[key])
  if (fromProcess) {
    return fromProcess
  }

  return resolveRawFromRuntimeConfig(event, key)
}

function buildDefaultChannel(event: H3Event): PilotChannelConfig {
  const baseUrl = resolvePilotConfigString(event, 'baseUrl', ['NUXT_PILOT_BASE_URL'])
  const apiKey = resolvePilotConfigString(event, 'apiKey', ['NUXT_PILOT_API_KEY'])
  const model = resolveRaw(event, 'PILOT_CHANNEL_DEFAULT_MODEL') || DEFAULT_MODEL
  const transport = normalizeTransport(resolveRaw(event, 'PILOT_CHANNEL_DEFAULT_TRANSPORT'))
  const builtinTools = normalizeBuiltinTools(
    resolveRaw(event, 'PILOT_CHANNEL_DEFAULT_BUILTIN_TOOLS')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean),
  )

  return {
    id: DEFAULT_CHANNEL_ID,
    name: 'Default Channel',
    baseUrl,
    apiKey,
    model,
    transport,
    builtinTools,
    enabled: true,
  }
}

function getAutoCacheTtlMs(event: H3Event): number {
  const raw = resolveRaw(event, 'PILOT_CHANNEL_AUTO_CACHE_TTL_MS')
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_AUTO_CACHE_TTL_MS
  }
  return Math.min(Math.max(Math.floor(parsed), 10_000), 60 * 60 * 1000)
}

function getCachedAutoTransport(channelId: string): Exclude<PilotChannelTransport, 'auto'> | null {
  const item = autoTransportCache.get(channelId)
  if (!item) {
    return null
  }
  if (item.expiresAt <= Date.now()) {
    autoTransportCache.delete(channelId)
    return null
  }
  return item.transport
}

export function rememberAutoChannelTransport(
  event: H3Event,
  channelId: string,
  transport: Exclude<PilotChannelTransport, 'auto'>,
): void {
  const normalizedId = String(channelId || '').trim()
  if (!normalizedId) {
    return
  }

  autoTransportCache.set(normalizedId, {
    transport,
    expiresAt: Date.now() + getAutoCacheTtlMs(event),
  })
}

export function getPilotChannelCatalog(event: H3Event): PilotChannelCatalog {
  const channelsJson = resolveRaw(event, 'PILOT_CHANNELS_JSON')
  const parsedChannels = parseChannelsJson(channelsJson)
  const defaultChannel = buildDefaultChannel(event)

  const channels = parsedChannels.length > 0
    ? parsedChannels
    : [defaultChannel]

  const enabledChannels = channels.filter(channel => channel.enabled)
  const availableChannels = enabledChannels.length > 0 ? enabledChannels : [defaultChannel]

  const configuredDefaultId = resolveRaw(event, 'PILOT_DEFAULT_CHANNEL_ID') || DEFAULT_CHANNEL_ID
  const matchedDefault = availableChannels.find(item => item.id === configuredDefaultId)

  return {
    channels: availableChannels,
    defaultChannelId: matchedDefault?.id || availableChannels[0]!.id,
  }
}

export function resolvePilotChannelSelection(
  event: H3Event,
  options: ResolvePilotChannelSelectionOptions = {},
): ResolvedPilotChannelSelection {
  const catalog = getPilotChannelCatalog(event)
  const requestChannelId = String(options.requestChannelId || '').trim()
  const sessionChannelId = String(options.sessionChannelId || '').trim()

  const sourceCandidates: Array<{ value: string, source: ResolvedPilotChannelSelection['selectionSource'] }> = [
    { value: requestChannelId, source: 'request' },
    { value: sessionChannelId, source: 'session' },
    { value: catalog.defaultChannelId, source: 'default' },
  ]

  let selected = catalog.channels.find(item => item.id === catalog.defaultChannelId) || catalog.channels[0]!
  let selectionSource: ResolvedPilotChannelSelection['selectionSource'] = 'fallback'

  for (const candidate of sourceCandidates) {
    if (!candidate.value) {
      continue
    }
    const matched = catalog.channels.find(item => item.id === candidate.value)
    if (matched) {
      selected = matched
      selectionSource = candidate.source
      break
    }
  }

  let usedCachedTransport = false
  let transport: Exclude<PilotChannelTransport, 'auto'>
  if (selected.transport === 'auto') {
    const cached = getCachedAutoTransport(selected.id)
    if (cached) {
      transport = cached
      usedCachedTransport = true
    }
    else {
      transport = DEFAULT_AUTO_TRANSPORT
    }
  }
  else {
    transport = selected.transport
  }

  return {
    channel: selected,
    channelId: selected.id,
    transport,
    selectionSource,
    usedCachedTransport,
    defaultChannelId: catalog.defaultChannelId,
  }
}

function extractStatusCode(error: unknown): number | null {
  if (!error || typeof error !== 'object') {
    const message = String(error || '')
    const matched = message.match(/\b(4\d\d|5\d\d)\b/)
    return matched ? Number(matched[1]) : null
  }

  const row = error as Record<string, unknown>
  const direct = Number(row.statusCode || row.status)
  if (Number.isFinite(direct)) {
    return direct
  }

  const response = row.response && typeof row.response === 'object'
    ? (row.response as Record<string, unknown>)
    : null
  const nested = Number(response?.status || response?.statusCode)
  if (Number.isFinite(nested)) {
    return nested
  }

  const message = String((row.message as string) || '')
  const matched = message.match(/\b(4\d\d|5\d\d)\b/)
  return matched ? Number(matched[1]) : null
}

export function shouldFallbackToChatCompletions(error: unknown): boolean {
  const statusCode = extractStatusCode(error)
  if (statusCode === 404 || statusCode === 405 || statusCode === 501) {
    return true
  }

  const message = String(error instanceof Error ? error.message : error || '').toLowerCase()
  if (!message) {
    return false
  }

  return (
    message.includes('/responses')
    && (
      message.includes('not found')
      || message.includes('unsupported')
      || message.includes('status code: 404')
      || message.includes('status code: 405')
      || message.includes('status code: 501')
      || message.includes('legacy protocol')
    )
  )
}
