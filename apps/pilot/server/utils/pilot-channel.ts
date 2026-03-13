import type { H3Event } from 'h3'
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

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function createChannelUnavailableError(): Error {
  return createError({
    statusCode: 503,
    statusMessage: '所有供应商已熔断，无可用渠道',
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
  const channels = catalog.channels.filter(item => item.enabled)

  if (channels.length <= 0 || !catalog.defaultChannelId) {
    throw createChannelUnavailableError()
  }

  const requestChannelId = normalizeText(options.requestChannelId)
  const sessionChannelId = normalizeText(options.sessionChannelId)

  const sourceCandidates: Array<{ value: string, source: ResolvedPilotChannelSelection['selectionSource'] }> = [
    { value: requestChannelId, source: 'request' },
    { value: sessionChannelId, source: 'session' },
    { value: catalog.defaultChannelId, source: 'default' },
  ]

  let selected = channels.find(item => item.id === catalog.defaultChannelId) || channels[0]
  let selectionSource: ResolvedPilotChannelSelection['selectionSource'] = 'fallback'

  if (!selected) {
    throw createChannelUnavailableError()
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
