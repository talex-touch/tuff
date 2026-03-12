import type { H3Event } from 'h3'
import process from 'node:process'
import { resolvePilotConfigString } from './pilot-config'

export type PilotChannelAdapter = 'legacy' | 'openai'
export type PilotChannelTransport = 'responses' | 'chat.completions'
export type PilotBuiltinTool = 'write_todos' | 'read_file' | 'write_file' | 'edit_file' | 'ls'

const DEFAULT_CHANNEL_ID = 'default'
const DEFAULT_MODEL = 'gpt-5.2'
const DEFAULT_CHANNEL_ADAPTER: PilotChannelAdapter = 'legacy'
const DEFAULT_CHANNEL_TRANSPORT: PilotChannelTransport = 'responses'
const DEFAULT_CHANNEL_TIMEOUT_MS = 90_000
const MIN_CHANNEL_TIMEOUT_MS = 3_000
const MAX_CHANNEL_TIMEOUT_MS = 10 * 60 * 1000

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
  adapter: PilotChannelAdapter
  transport: PilotChannelTransport
  timeoutMs: number
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
  adapter: PilotChannelAdapter
  transport: PilotChannelTransport
  selectionSource: 'request' | 'session' | 'default' | 'fallback'
  defaultChannelId: string
}

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

function normalizeAdapter(value: unknown, fallback: PilotChannelAdapter): PilotChannelAdapter {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'openai') {
    return 'openai'
  }
  if (normalized === 'legacy') {
    return 'legacy'
  }
  return fallback
}

function normalizeTransport(value: unknown, fallback: PilotChannelTransport): PilotChannelTransport {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'chat.completions' || normalized === 'chat_completions' || normalized === 'completions') {
    return 'chat.completions'
  }
  if (normalized === 'responses' || normalized === 'response') {
    return 'responses'
  }
  return fallback
}

function resolveChannelTransport(
  adapter: PilotChannelAdapter,
  value: unknown,
  fallback: PilotChannelTransport,
): PilotChannelTransport {
  if (adapter === 'legacy') {
    return 'responses'
  }
  return normalizeTransport(value, fallback)
}

function normalizeTimeoutMs(value: unknown, fallback: number): number {
  if (value === null || value === undefined) {
    return fallback
  }
  if (typeof value === 'string' && !value.trim()) {
    return fallback
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(Math.max(Math.floor(parsed), MIN_CHANNEL_TIMEOUT_MS), MAX_CHANNEL_TIMEOUT_MS)
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

interface NormalizeChannelItemOptions {
  fallbackAdapter: PilotChannelAdapter
  fallbackTransport: PilotChannelTransport
  fallbackTimeoutMs: number
}

function normalizeChannelItem(raw: unknown, options: NormalizeChannelItemOptions): PilotChannelConfig | null {
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

  const adapter = normalizeAdapter(row.adapter, options.fallbackAdapter)
  const transport = resolveChannelTransport(adapter, row.transport, options.fallbackTransport)

  return {
    id,
    name: toStringValue(row.name) || id,
    baseUrl,
    apiKey,
    model: toStringValue(row.model) || DEFAULT_MODEL,
    adapter,
    transport,
    timeoutMs: normalizeTimeoutMs(row.timeoutMs ?? row.timeout, options.fallbackTimeoutMs),
    builtinTools: normalizeBuiltinTools(row.builtinTools),
    enabled: toBoolean(row.enabled, true),
  }
}

interface ParseChannelsJsonOptions extends NormalizeChannelItemOptions {}

function parseChannelsJson(raw: string, options: ParseChannelsJsonOptions): PilotChannelConfig[] {
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map(item => normalizeChannelItem(item, options))
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
  const adapter = normalizeAdapter(
    resolveRaw(event, 'PILOT_CHANNEL_DEFAULT_ADAPTER'),
    DEFAULT_CHANNEL_ADAPTER,
  )
  const transport = resolveChannelTransport(
    adapter,
    resolveRaw(event, 'PILOT_CHANNEL_DEFAULT_TRANSPORT'),
    DEFAULT_CHANNEL_TRANSPORT,
  )
  const timeoutMs = getDefaultChannelTimeoutMs(event)
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
    adapter,
    transport,
    timeoutMs,
    builtinTools,
    enabled: true,
  }
}

function getDefaultChannelTimeoutMs(event: H3Event): number {
  return normalizeTimeoutMs(resolveRaw(event, 'PILOT_CHANNEL_TIMEOUT_MS'), DEFAULT_CHANNEL_TIMEOUT_MS)
}

export function getPilotChannelCatalog(event: H3Event): PilotChannelCatalog {
  const channelsJson = resolveRaw(event, 'PILOT_CHANNELS_JSON')
  const defaultChannel = buildDefaultChannel(event)
  const parsedChannels = parseChannelsJson(channelsJson, {
    fallbackAdapter: defaultChannel.adapter,
    fallbackTransport: defaultChannel.transport,
    fallbackTimeoutMs: defaultChannel.timeoutMs,
  })

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

  return {
    channel: selected,
    channelId: selected.id,
    adapter: selected.adapter,
    transport: selected.transport,
    selectionSource,
    defaultChannelId: catalog.defaultChannelId,
  }
}
