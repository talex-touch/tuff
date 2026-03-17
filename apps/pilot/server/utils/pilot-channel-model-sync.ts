import type { H3Event } from 'h3'
import type { PilotChannelModelConfig } from './pilot-channel'
import { mergeDiscoveredModelsIntoCatalog } from './pilot-admin-routing-config'
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

async function fetchChannelModels(input: {
  baseUrl: string
  apiKey: string
  timeoutMs: number
}): Promise<string[]> {
  const endpoint = `${normalizeBaseUrl(input.baseUrl)}/models`
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort('channel_model_sync_timeout')
  }, Math.min(Math.max(Math.floor(Number(input.timeoutMs || 90_000)), 3_000), 120_000))

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${input.apiKey}`,
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const payload = await response.json() as {
      data?: Array<{ id?: string }>
      models?: Array<{ id?: string }>
    }

    const source = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : []

    const modelIds = source
      .map(item => normalizeText(item?.id))
      .filter(Boolean)

    return Array.from(new Set(modelIds))
  }
  finally {
    clearTimeout(timeout)
  }
}

function mergeModelsWithExisting(
  existing: PilotChannelModelConfig[] | undefined,
  discovered: string[],
): PilotChannelModelConfig[] {
  const existingMap = new Map((existing || []).map(item => [item.id, item]))

  for (const modelId of discovered) {
    if (existingMap.has(modelId)) {
      continue
    }
    existingMap.set(modelId, {
      id: modelId,
      label: modelId,
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

      const mergedModels = mergeModelsWithExisting(channel.models, discoveredModels)
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

  await mergeDiscoveredModelsIntoCatalog(event, discoveredForCatalog)

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
