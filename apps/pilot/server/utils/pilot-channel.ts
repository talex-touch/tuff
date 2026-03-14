import type { H3Event } from 'h3'
import process from 'node:process'
import { createError } from 'h3'
import { getPilotAdminChannelCatalog } from './pilot-admin-channel-config'

export type PilotChannelAdapter = 'legacy' | 'openai'
export type PilotChannelTransport = 'responses' | 'chat.completions'
export type PilotBuiltinTool = 'write_todos' | 'read_file' | 'write_file' | 'edit_file' | 'ls'

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

type PilotChannelUnavailableReason = 'no_channels_configured' | 'all_channels_disabled' | 'missing_default_channel'

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function resolvePostgresTarget(): string {
  const dsn = String(process.env.PILOT_POSTGRES_URL || '').trim()
  if (!dsn) {
    return 'unknown'
  }
  try {
    const parsed = new URL(dsn)
    const name = parsed.pathname.replace(/^\/+/, '') || '(default)'
    const port = parsed.port || '5432'
    return `${parsed.hostname}:${port}/${name}`
  }
  catch {
    return 'invalid-dsn'
  }
}

function resolveChannelUnavailableMessage(reason: PilotChannelUnavailableReason): string {
  switch (reason) {
    case 'no_channels_configured':
      return '当前数据库未配置任何渠道，请在管理后台先添加并启用至少一个渠道。'
    case 'all_channels_disabled':
      return '渠道已配置但全部被禁用，请在管理后台启用至少一个渠道后重试。'
    case 'missing_default_channel':
      return '默认渠道缺失，请在管理后台设置默认渠道后重试。'
    default:
      return '当前无可用渠道，请检查渠道配置。'
  }
}

function createChannelUnavailableError(
  reason: PilotChannelUnavailableReason,
  details: Record<string, unknown>,
): Error {
  const message = resolveChannelUnavailableMessage(reason)
  console.warn('[pilot][channel] unavailable', {
    reason,
    message,
    db: resolvePostgresTarget(),
    ...details,
  })

  return createError({
    statusCode: 503,
    statusMessage: 'Service Unavailable',
    message,
    data: {
      code: 'PILOT_CHANNEL_UNAVAILABLE',
      reason,
      ...details,
    },
  })
}

export async function getPilotChannelCatalog(event: H3Event): Promise<PilotChannelCatalog> {
  const catalog = await getPilotAdminChannelCatalog(event)
  return {
    channels: catalog.channels,
    defaultChannelId: catalog.defaultChannelId,
  }
}

export async function resolvePilotChannelSelection(
  event: H3Event,
  options: ResolvePilotChannelSelectionOptions = {},
): Promise<ResolvedPilotChannelSelection> {
  const catalog = await getPilotChannelCatalog(event)
  const requestChannelId = normalizeText(options.requestChannelId)
  const sessionChannelId = normalizeText(options.sessionChannelId)
  const allChannels = catalog.channels
  const channels = allChannels.filter(item => item.enabled)
  const details = {
    requestChannelId: requestChannelId || null,
    sessionChannelId: sessionChannelId || null,
    configuredChannelIds: allChannels.map(item => item.id),
    enabledChannelIds: channels.map(item => item.id),
    defaultChannelId: catalog.defaultChannelId || null,
  }

  if (allChannels.length <= 0) {
    throw createChannelUnavailableError('no_channels_configured', details)
  }
  if (channels.length <= 0) {
    throw createChannelUnavailableError('all_channels_disabled', details)
  }
  if (!catalog.defaultChannelId) {
    throw createChannelUnavailableError('missing_default_channel', details)
  }

  const sourceCandidates: Array<{ value: string, source: ResolvedPilotChannelSelection['selectionSource'] }> = [
    { value: requestChannelId, source: 'request' },
    { value: sessionChannelId, source: 'session' },
    { value: catalog.defaultChannelId, source: 'default' },
  ]

  let selected = channels.find(item => item.id === catalog.defaultChannelId) || channels[0]
  let selectionSource: ResolvedPilotChannelSelection['selectionSource'] = 'fallback'

  if (!selected) {
    throw createChannelUnavailableError('all_channels_disabled', details)
  }

  for (const candidate of sourceCandidates) {
    if (!candidate.value) {
      continue
    }
    const matched = channels.find(item => item.id === candidate.value)
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
