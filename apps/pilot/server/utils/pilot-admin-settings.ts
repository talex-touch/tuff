import type { H3Event } from 'h3'
import type {
  PilotBuiltinSourceRule,
  PilotWebsearchDatasourceViewConfig,
  UpdatePilotWebsearchDatasourceInput,
} from './pilot-admin-datasource-config'
import type {
  PilotLoadBalancePolicy,
  PilotMemoryPolicy,
  PilotModelCatalogItem,
  PilotRouteComboItem,
  PilotRoutingPolicy,
} from './pilot-admin-routing-config'
import type {
  PilotBuiltinTool,
  PilotChannelAdapter,
  PilotChannelRegion,
  PilotChannelTransport,
  PilotCozeAuthMode,
  PilotProviderTargetType,
} from './pilot-channel'
import {
  getPilotAdminChannelCatalog,
  updatePilotAdminChannelCatalog,
} from './pilot-admin-channel-config'
import {
  getPilotWebsearchDatasourceConfig,
  toPilotWebsearchDatasourceView,
  updatePilotWebsearchDatasourceConfig,
} from './pilot-admin-datasource-config'
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
      priority: number
      model: string
      defaultModelId?: string
      models?: Array<{
        id: string
        label?: string
        format?: string
        targetType?: PilotProviderTargetType
        priority?: number
        enabled?: boolean
        thinkingSupported?: boolean
        thinkingDefaultEnabled?: boolean
        metadata?: Record<string, unknown>
      }>
      baseUrl: string
      apiKeyMasked: string
      adapter: PilotChannelAdapter
      transport: PilotChannelTransport
      region?: PilotChannelRegion
      cozeAuthMode?: PilotCozeAuthMode
      oauthClientId?: string
      oauthTokenUrl?: string
      oauthClientSecretMasked: string
      hasOauthClientSecret: boolean
      jwtAppId?: string
      jwtKeyId?: string
      jwtAudience?: string
      jwtPrivateKeyMasked: string
      hasJwtPrivateKey: boolean
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
  datasource: {
    websearch: PilotWebsearchDatasourceViewConfig
  }
}

export interface PilotAdminSettingsPatch {
  channels?: {
    defaultChannelId?: string
    channels?: Array<{
      id: string
      name?: string
      priority?: number
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
        targetType?: PilotProviderTargetType
        priority?: number
        enabled?: boolean
        thinkingSupported?: boolean
        thinkingDefaultEnabled?: boolean
        metadata?: Record<string, unknown>
      }>
      region?: PilotChannelRegion
      cozeAuthMode?: PilotCozeAuthMode
      oauthClientId?: string
      oauthClientSecret?: string
      oauthTokenUrl?: string
      jwtAppId?: string
      jwtKeyId?: string
      jwtPrivateKey?: string
      jwtAudience?: string
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
  datasource?: {
    websearch?: Partial<UpdatePilotWebsearchDatasourceInput> & {
      builtinSources?: PilotBuiltinSourceRule[]
    }
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
  const [catalog, storage, routing, websearchDatasource] = await Promise.all([
    getPilotAdminChannelCatalog(event),
    getPilotAdminStorageSettings(event),
    getPilotAdminRoutingConfig(event),
    getPilotWebsearchDatasourceConfig(event),
  ])

  return {
    channels: {
      defaultChannelId: catalog.defaultChannelId,
      channels: catalog.channels.map(channel => ({
        id: channel.id,
        name: channel.name,
        priority: channel.priority,
        model: channel.model,
        defaultModelId: channel.defaultModelId,
        models: channel.models,
        baseUrl: channel.baseUrl,
        apiKeyMasked: maskSecret(channel.apiKey),
        adapter: channel.adapter,
        transport: channel.transport,
        region: channel.region,
        cozeAuthMode: channel.cozeAuthMode,
        oauthClientId: channel.oauthClientId,
        oauthTokenUrl: channel.oauthTokenUrl,
        oauthClientSecretMasked: maskSecret(channel.oauthClientSecret || ''),
        hasOauthClientSecret: Boolean(channel.oauthClientSecret),
        jwtAppId: channel.jwtAppId,
        jwtKeyId: channel.jwtKeyId,
        jwtAudience: channel.jwtAudience,
        jwtPrivateKeyMasked: maskSecret(channel.jwtPrivateKey || ''),
        hasJwtPrivateKey: Boolean(channel.jwtPrivateKey),
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
    datasource: {
      websearch: toPilotWebsearchDatasourceView(websearchDatasource),
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
        : undefined,
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

  const datasourcePatch = patch.datasource
  if (datasourcePatch?.websearch) {
    const websearchPatch = datasourcePatch.websearch
    await updatePilotWebsearchDatasourceConfig(event, {
      ...websearchPatch,
      providers: Array.isArray(websearchPatch.providers)
        ? websearchPatch.providers
        : undefined,
      aggregation: websearchPatch.aggregation,
      crawl: websearchPatch.crawl,
      allowlistDomains: Array.isArray(websearchPatch.allowlistDomains)
        ? websearchPatch.allowlistDomains
        : undefined,
      ttlMinutes: websearchPatch.ttlMinutes,
      builtinSources: Array.isArray(websearchPatch.builtinSources)
        ? websearchPatch.builtinSources
        : undefined,
      gatewayBaseUrl: websearchPatch.gatewayBaseUrl,
      apiKeyRef: websearchPatch.apiKeyRef,
      timeoutMs: websearchPatch.timeoutMs,
      maxResults: websearchPatch.maxResults,
      crawlEnabled: typeof websearchPatch.crawlEnabled === 'boolean'
        ? websearchPatch.crawlEnabled
        : undefined,
    })
  }

  return await buildPilotAdminSettingsView(event)
}
