import type { H3Event } from 'h3'
import process from 'node:process'
import { createError } from 'h3'
import { getPilotAdminChannelCatalog } from './pilot-admin-channel-config'

export type PilotChannelAdapter = 'openai' | 'coze'
export type PilotChannelTransport = 'responses' | 'chat.completions' | 'coze.openapi'
export type PilotBuiltinTool = 'write_todos' | 'read_file' | 'write_file' | 'edit_file' | 'ls' | 'websearch'
export type PilotProviderTargetType = 'model' | 'coze_bot' | 'coze_workflow'
export type PilotChannelRegion = 'cn'
export type PilotCozeAuthMode = 'oauth_client' | 'jwt_service'

export const PILOT_COZE_CN_BASE_URL = 'https://api.coze.cn'
export const PILOT_COZE_CN_TOKEN_URL = `${PILOT_COZE_CN_BASE_URL}/api/permission/oauth2/token`

export interface PilotChannelModelConfig {
  id: string
  label?: string
  format?: string
  targetType?: PilotProviderTargetType
  priority?: number
  enabled?: boolean
  thinkingSupported?: boolean
  thinkingDefaultEnabled?: boolean
  metadata?: Record<string, unknown>
}

export interface PilotChannelConfig {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  priority?: number
  model: string
  defaultModelId?: string
  models?: PilotChannelModelConfig[]
  adapter: PilotChannelAdapter
  transport: PilotChannelTransport
  region?: PilotChannelRegion
  cozeAuthMode?: PilotCozeAuthMode
  oauthClientId?: string
  oauthClientSecret?: string
  oauthTokenUrl?: string
  jwtAppId?: string
  jwtKeyId?: string
  jwtPrivateKey?: string
  jwtAudience?: string
  timeoutMs: number
  builtinTools: PilotBuiltinTool[]
  enabled: boolean
  modelsLastSyncedAt?: string
  modelsSyncError?: string
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

type PilotChannelUnavailableReason = 'no_channels_configured' | 'all_channels_disabled'

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

export function normalizePilotProviderTargetType(
  value: unknown,
  fallback: PilotProviderTargetType = 'model',
): PilotProviderTargetType {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'coze_bot' || normalized === 'coze-bot' || normalized === 'bot') {
    return 'coze_bot'
  }
  if (normalized === 'coze_workflow' || normalized === 'coze-workflow' || normalized === 'workflow') {
    return 'coze_workflow'
  }
  return fallback
}

export function normalizePilotChannelRegion(value: unknown): PilotChannelRegion {
  const normalized = normalizeText(value).toLowerCase()
  return normalized === 'cn' ? 'cn' : 'cn'
}

export function normalizePilotCozeAuthMode(
  value: unknown,
  fallback: PilotCozeAuthMode = 'oauth_client',
): PilotCozeAuthMode {
  const normalized = normalizeText(value).toLowerCase()
  if (
    normalized === 'jwt_service'
    || normalized === 'jwt-service'
    || normalized === 'service_jwt'
    || normalized === 'service-jwt'
    || normalized === 'service_identity'
    || normalized === 'service-identity'
    || normalized === 'jwt'
  ) {
    return 'jwt_service'
  }
  if (
    normalized === 'oauth_client'
    || normalized === 'oauth-client'
    || normalized === 'oauth'
    || normalized === 'client_credentials'
  ) {
    return 'oauth_client'
  }
  return fallback
}

export function isPilotCozeTargetType(value: unknown): value is Extract<PilotProviderTargetType, 'coze_bot' | 'coze_workflow'> {
  const normalized = normalizePilotProviderTargetType(value)
  return normalized === 'coze_bot' || normalized === 'coze_workflow'
}

export function getPilotChannelDefaultBaseUrl(
  adapter: PilotChannelAdapter,
  region: PilotChannelRegion = 'cn',
): string {
  if (adapter === 'coze' && region === 'cn') {
    return PILOT_COZE_CN_BASE_URL
  }
  return ''
}

export function getPilotChannelDefaultOauthTokenUrl(
  adapter: PilotChannelAdapter,
  region: PilotChannelRegion = 'cn',
): string {
  if (adapter === 'coze' && region === 'cn') {
    return PILOT_COZE_CN_TOKEN_URL
  }
  return ''
}

function normalizePriority(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return 100
  }
  return Math.min(Math.max(Math.floor(parsed), 1), 9999)
}

function sortChannelsByPriority<T extends { id: string, priority?: number }>(channels: T[]): T[] {
  return [...channels].sort((a, b) => {
    const priorityDiff = normalizePriority(a.priority) - normalizePriority(b.priority)
    if (priorityDiff !== 0) {
      return priorityDiff
    }
    return normalizeText(a.id).localeCompare(normalizeText(b.id))
  })
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
  const allChannels = sortChannelsByPriority(catalog.channels)
  const channels = sortChannelsByPriority(allChannels.filter(item => item.enabled))
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
