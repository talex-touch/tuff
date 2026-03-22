import type { H3Event } from 'h3'
import type { PilotChannelModelConfig } from './pilot-channel'
import { networkClient } from '@talex-touch/utils/network'
import { getPilotAdminChannelCatalog, updatePilotAdminChannelCatalog } from './pilot-admin-channel-config'

export interface PilotChannelModelSyncResult {
  syncedAt: string
  totalChannels: number
  successChannels: number
  failedChannels: number
  discoveredModelCount: number
  channels: Array<{
    channelId: string
    status: 'ok' | 'failed' | 'skipped'
    discoveredModels: string[]
    error?: string
  }>
}

export interface DiscoverPilotChannelModelsInput {
  channelId?: string
  baseUrl?: string
  apiKey?: string
  timeoutMs?: number
}

export interface DiscoverPilotChannelModelsResult {
  channelId: string
  models: string[]
}

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeBaseUrl(baseUrl: string): string {
  const raw = normalizeText(baseUrl).replace(/\/+$/, '')
  if (!raw) {
    return ''
  }
  if (raw.endsWith('/v1')) {
    return raw
  }
  return `${raw}/v1`
}

function normalizeTimeoutMs(value: unknown, fallback = 90_000): number {
  return Math.min(Math.max(Math.floor(Number(value || fallback)), 3_000), 120_000)
}

async function fetchChannelModels(input: {
  baseUrl: string
  apiKey: string
  timeoutMs: number
}): Promise<string[]> {
  const endpoint = `${normalizeBaseUrl(input.baseUrl)}/models`
  const response = await networkClient.request<{
    data?: Array<{ id?: string }>
    models?: Array<{ id?: string }>
  } | string>({
    method: 'GET',
    url: endpoint,
    timeoutMs: normalizeTimeoutMs(input.timeoutMs, 90_000),
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${input.apiKey}`,
    },
    validateStatus: Array.from({ length: 500 }, (_, index) => index + 100),
  })

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status}`)
  }

  const payloadData = response.data
  const payload = payloadData && typeof payloadData === 'object' && !Array.isArray(payloadData)
    ? payloadData as {
      data?: Array<{ id?: string }>
      models?: Array<{ id?: string }>
    }
    : {}

  const source = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.models)
      ? payload.models
      : []

  const modelIds = source
    .map(item => normalizeText(item?.id))
    .filter(Boolean)

  return Array.from(new Set(modelIds))
}

export async function discoverPilotChannelModels(
  event: H3Event,
  input: DiscoverPilotChannelModelsInput = {},
): Promise<DiscoverPilotChannelModelsResult> {
  const catalog = await getPilotAdminChannelCatalog(event)
  const channelId = normalizeText(input.channelId)
  const channel = channelId
    ? catalog.channels.find(item => item.id === channelId)
    : undefined

  const baseUrl = normalizeText(input.baseUrl) || normalizeText(channel?.baseUrl)
  const apiKey = normalizeText(input.apiKey) || normalizeText(channel?.apiKey)
  const timeoutMs = normalizeTimeoutMs(input.timeoutMs, channel?.timeoutMs || 90_000)

  if (!baseUrl) {
    throw new Error('Base URL 不能为空')
  }
  if (!apiKey) {
    throw new Error('API Key 不能为空')
  }

  const models = await fetchChannelModels({
    baseUrl,
    apiKey,
    timeoutMs,
  })

  return {
    channelId: channel?.id || channelId || '',
    models,
  }
}

function mergeModelsWithExisting(
  existing: PilotChannelModelConfig[] | undefined,
  discovered: string[],
  defaultFormat: string,
): PilotChannelModelConfig[] {
  const existingMap = new Map((existing || []).map(item => [item.id, item]))

  for (const modelId of discovered) {
    if (existingMap.has(modelId)) {
      continue
    }
    existingMap.set(modelId, {
      id: modelId,
      label: modelId,
      format: normalizeText(defaultFormat) || undefined,
      priority: 100,
      enabled: true,
      thinkingSupported: true,
      thinkingDefaultEnabled: false,
    })
  }

  const list = Array.from(existingMap.values())
  if (list.length <= 0 && discovered.length > 0) {
    return discovered.map(modelId => ({
      id: modelId,
      label: modelId,
      format: normalizeText(defaultFormat) || undefined,
      priority: 100,
      enabled: true,
      thinkingSupported: true,
      thinkingDefaultEnabled: false,
    }))
  }

  return list
}

export async function syncPilotChannelModels(event: H3Event): Promise<PilotChannelModelSyncResult> {
  const syncedAt = nowIso()
  const catalog = await getPilotAdminChannelCatalog(event)
  const channelUpdates: Array<any> = []
  const channels: PilotChannelModelSyncResult['channels'] = []
  const discoveredForCatalog: Array<{
    channelId: string
    providerModel: string
  }> = []

  for (const channel of catalog.channels) {
    if (!channel.enabled) {
      channels.push({
        channelId: channel.id,
        status: 'skipped',
        discoveredModels: [],
      })
      channelUpdates.push({
        id: channel.id,
        modelsSyncError: '',
      })
      continue
    }

    try {
      const discoveredModels = await fetchChannelModels({
        baseUrl: channel.baseUrl,
        apiKey: channel.apiKey,
        timeoutMs: channel.timeoutMs,
      })

      const mergedModels = mergeModelsWithExisting(channel.models, discoveredModels, channel.transport)
      const defaultModelId = normalizeText(channel.defaultModelId)
      const nextDefault = mergedModels.some(item => item.id === defaultModelId)
        ? defaultModelId
        : normalizeText(channel.model) && mergedModels.some(item => item.id === normalizeText(channel.model))
          ? normalizeText(channel.model)
          : mergedModels[0]?.id || channel.model

      channelUpdates.push({
        id: channel.id,
        models: mergedModels,
        defaultModelId: nextDefault,
        model: nextDefault,
        modelsLastSyncedAt: syncedAt,
        modelsSyncError: '',
      })

      for (const providerModel of discoveredModels) {
        discoveredForCatalog.push({
          channelId: channel.id,
          providerModel,
        })
      }

      channels.push({
        channelId: channel.id,
        status: 'ok',
        discoveredModels,
      })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'unknown error')
      channelUpdates.push({
        id: channel.id,
        modelsSyncError: message,
        modelsLastSyncedAt: syncedAt,
      })
      channels.push({
        channelId: channel.id,
        status: 'failed',
        discoveredModels: [],
        error: message,
      })
    }
  }

  await updatePilotAdminChannelCatalog(event, {
    defaultChannelId: catalog.defaultChannelId,
    channels: channelUpdates,
  })

  const successChannels = channels.filter(item => item.status === 'ok').length
  const failedChannels = channels.filter(item => item.status === 'failed').length
  const discoveredModelCount = discoveredForCatalog.length

  return {
    syncedAt,
    totalChannels: catalog.channels.length,
    successChannels,
    failedChannels,
    discoveredModelCount,
    channels,
  }
}
