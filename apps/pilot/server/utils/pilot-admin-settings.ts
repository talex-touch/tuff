import type { H3Event } from 'h3'
import type {
  PilotLoadBalancePolicy,
  PilotMemoryPolicy,
  PilotModelCatalogItem,
  PilotRouteComboItem,
  PilotRoutingPolicy,
} from './pilot-admin-routing-config'
import type { PilotBuiltinTool, PilotChannelAdapter, PilotChannelTransport } from './pilot-channel'
import {
  getPilotAdminChannelCatalog,
  updatePilotAdminChannelCatalog,
} from './pilot-admin-channel-config'
import {
  getPilotAdminRoutingConfig,
  updatePilotAdminRoutingConfig,
} from './pilot-admin-routing-config'
import {
  getPilotAdminStorageSettings,
  updatePilotAdminStorageSettings,
} from './pilot-admin-storage-config'

export interface PilotAdminSettingsView {
  channels: {
    defaultChannelId: string
    channels: Array<{
      id: string
      name: string
      model: string
      defaultModelId?: string
      models?: Array<{
        id: string
        label?: string
        format?: string
        enabled?: boolean
        thinkingSupported?: boolean
        thinkingDefaultEnabled?: boolean
        metadata?: Record<string, unknown>
      }>
      baseUrl: string
      apiKeyMasked: string
      adapter: PilotChannelAdapter
      transport: PilotChannelTransport
      timeoutMs: number
      builtinTools: PilotBuiltinTool[]
      enabled: boolean
      modelsLastSyncedAt?: string
      modelsSyncError?: string
    }>
    writable: boolean
    source: 'database'
  }
  storage: {
    attachmentProvider: 'auto' | 'memory' | 's3'
    attachmentPublicBaseUrl: string
    minioEndpoint: string
    minioBucket: string
    minioRegion: string
    minioForcePathStyle: boolean
    minioPublicBaseUrl: string
    minioAccessKey: string
    minioAccessKeyMasked: string
    minioSecretKeyMasked: string
    hasMinioAccessKey: boolean
    hasMinioSecretKey: boolean
  }
  routing: {
    modelCatalog: PilotModelCatalogItem[]
    routeCombos: PilotRouteComboItem[]
    routingPolicy: PilotRoutingPolicy
    lbPolicy: PilotLoadBalancePolicy
    memoryPolicy: PilotMemoryPolicy
  }
}

export interface PilotAdminSettingsPatch {
  channels?: {
    defaultChannelId?: string
    channels?: Array<{
      id: string
      name?: string
      baseUrl?: string
      apiKey?: string
      model?: string
      adapter?: PilotChannelAdapter
      transport?: PilotChannelTransport
      timeoutMs?: number
      builtinTools?: PilotBuiltinTool[]
      enabled?: boolean
      defaultModelId?: string
      models?: Array<{
        id: string
        label?: string
        format?: string
        enabled?: boolean
        thinkingSupported?: boolean
        thinkingDefaultEnabled?: boolean
        metadata?: Record<string, unknown>
      }>
      modelsLastSyncedAt?: string
      modelsSyncError?: string
    }>
  }
  storage?: {
    attachmentProvider?: string
    attachmentPublicBaseUrl?: string
    minioEndpoint?: string
    minioBucket?: string
    minioAccessKey?: string
    clearMinioAccessKey?: boolean
    minioSecretKey?: string
    clearMinioSecretKey?: boolean
    minioRegion?: string
    minioForcePathStyle?: boolean
    minioPublicBaseUrl?: string
  }
  routing?: {
    modelCatalog?: PilotModelCatalogItem[]
    routeCombos?: PilotRouteComboItem[]
    routingPolicy?: Partial<PilotRoutingPolicy>
    lbPolicy?: Partial<PilotLoadBalancePolicy>
    memoryPolicy?: Partial<PilotMemoryPolicy>
  }
}

function maskSecret(value: string): string {
  const text = String(value || '').trim()
  if (text.length <= 8) {
    return text ? '********' : ''
  }
  return `${text.slice(0, 4)}...${text.slice(-4)}`
}

function normalizeProvider(value: string): 'auto' | 'memory' | 's3' {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'memory' || normalized === 's3') {
    return normalized
  }
  if (normalized === 'minio') {
    return 's3'
  }
  return 'auto'
}

async function buildPilotAdminSettingsView(event: H3Event): Promise<PilotAdminSettingsView> {
  const [catalog, storage, routing] = await Promise.all([
    getPilotAdminChannelCatalog(event),
    getPilotAdminStorageSettings(event),
    getPilotAdminRoutingConfig(event),
  ])

  return {
    channels: {
      defaultChannelId: catalog.defaultChannelId,
      channels: catalog.channels.map(channel => ({
        id: channel.id,
        name: channel.name,
        model: channel.model,
        defaultModelId: channel.defaultModelId,
        models: channel.models,
        baseUrl: channel.baseUrl,
        apiKeyMasked: maskSecret(channel.apiKey),
        adapter: channel.adapter,
        transport: channel.transport,
        timeoutMs: channel.timeoutMs,
        builtinTools: channel.builtinTools,
        enabled: channel.enabled,
        modelsLastSyncedAt: channel.modelsLastSyncedAt,
        modelsSyncError: channel.modelsSyncError,
      })),
      writable: true,
      source: 'database',
    },
    storage: {
      attachmentProvider: storage.attachmentProvider || 'auto',
      attachmentPublicBaseUrl: storage.attachmentPublicBaseUrl || '',
      minioEndpoint: storage.minioEndpoint || '',
      minioBucket: storage.minioBucket || '',
      minioRegion: storage.minioRegion || 'us-east-1',
      minioForcePathStyle: storage.minioForcePathStyle !== false,
      minioPublicBaseUrl: storage.minioPublicBaseUrl || '',
      minioAccessKey: '',
      minioAccessKeyMasked: maskSecret(storage.minioAccessKey || ''),
      minioSecretKeyMasked: maskSecret(storage.minioSecretKey || ''),
      hasMinioAccessKey: Boolean(storage.minioAccessKey),
      hasMinioSecretKey: Boolean(storage.minioSecretKey),
    },
    routing: {
      modelCatalog: routing.modelCatalog,
      routeCombos: routing.routeCombos,
      routingPolicy: routing.routingPolicy,
      lbPolicy: routing.lbPolicy,
      memoryPolicy: routing.memoryPolicy,
    },
  }
}

export async function getPilotAdminSettings(event: H3Event): Promise<PilotAdminSettingsView> {
  return await buildPilotAdminSettingsView(event)
}

export async function updatePilotAdminSettings(
  event: H3Event,
  patch: PilotAdminSettingsPatch,
): Promise<PilotAdminSettingsView> {
  const channelPatch = patch.channels
  if (channelPatch) {
    const current = await getPilotAdminChannelCatalog(event)
    await updatePilotAdminChannelCatalog(event, {
      defaultChannelId: typeof channelPatch.defaultChannelId === 'string'
        ? channelPatch.defaultChannelId
        : current.defaultChannelId,
      channels: Array.isArray(channelPatch.channels)
        ? channelPatch.channels
        : current.channels,
    })
  }

  const storagePatch = patch.storage
  if (storagePatch) {
    const minioAccessKey = storagePatch.clearMinioAccessKey
      ? ''
      : (typeof storagePatch.minioAccessKey === 'string' && storagePatch.minioAccessKey.trim()
          ? storagePatch.minioAccessKey
          : undefined)

    const minioSecretKey = storagePatch.clearMinioSecretKey
      ? ''
      : (typeof storagePatch.minioSecretKey === 'string' && storagePatch.minioSecretKey.trim()
          ? storagePatch.minioSecretKey
          : undefined)

    await updatePilotAdminStorageSettings(event, {
      attachmentProvider: typeof storagePatch.attachmentProvider === 'string'
        ? normalizeProvider(storagePatch.attachmentProvider)
        : undefined,
      attachmentPublicBaseUrl: storagePatch.attachmentPublicBaseUrl,
      minioEndpoint: storagePatch.minioEndpoint,
      minioBucket: storagePatch.minioBucket,
      minioAccessKey,
      minioSecretKey,
      minioRegion: storagePatch.minioRegion,
      minioForcePathStyle: typeof storagePatch.minioForcePathStyle === 'boolean'
        ? storagePatch.minioForcePathStyle
        : undefined,
      minioPublicBaseUrl: storagePatch.minioPublicBaseUrl,
    })
  }

  const routingPatch = patch.routing
  if (routingPatch) {
    await updatePilotAdminRoutingConfig(event, {
      modelCatalog: Array.isArray(routingPatch.modelCatalog) ? routingPatch.modelCatalog : undefined,
      routeCombos: Array.isArray(routingPatch.routeCombos) ? routingPatch.routeCombos : undefined,
      routingPolicy: routingPatch.routingPolicy,
      lbPolicy: routingPatch.lbPolicy,
      memoryPolicy: routingPatch.memoryPolicy,
    })
  }

  return await buildPilotAdminSettingsView(event)
}
