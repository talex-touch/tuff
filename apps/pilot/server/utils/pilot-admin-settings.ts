import type { H3Event } from 'h3'
import type { PilotBuiltinTool, PilotChannelAdapter, PilotChannelTransport } from './pilot-channel'
import {
  getPilotAdminChannelCatalog,
  updatePilotAdminChannelCatalog,
} from './pilot-admin-channel-config'
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
      baseUrl: string
      apiKeyMasked: string
      adapter: PilotChannelAdapter
      transport: PilotChannelTransport
      timeoutMs: number
      builtinTools: PilotBuiltinTool[]
      enabled: boolean
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
  const [catalog, storage] = await Promise.all([
    getPilotAdminChannelCatalog(event),
    getPilotAdminStorageSettings(event),
  ])

  return {
    channels: {
      defaultChannelId: catalog.defaultChannelId,
      channels: catalog.channels.map(channel => ({
        id: channel.id,
        name: channel.name,
        model: channel.model,
        baseUrl: channel.baseUrl,
        apiKeyMasked: maskSecret(channel.apiKey),
        adapter: channel.adapter,
        transport: channel.transport,
        timeoutMs: channel.timeoutMs,
        builtinTools: channel.builtinTools,
        enabled: channel.enabled,
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

  return await buildPilotAdminSettingsView(event)
}
