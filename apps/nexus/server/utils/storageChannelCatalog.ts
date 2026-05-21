import { createError } from 'h3'

export interface StorageChannelProfile {
  id: string
  channel: string
  provider: string
  label: string
  description: string
  status: 'active' | 'policy-ready'
  credentialRefPrefix: string | null
  requiredConfigKeys: string[]
  optionalConfigKeys: string[]
  limitKeys: string[]
  defaultLimits: Record<string, unknown>
  defaultConfig: Record<string, unknown>
}

export interface StorageChannelPolicyConfigInput {
  channel: string
  provider: string
  limits: Record<string, unknown> | null
  config: Record<string, unknown> | null
}

const STORAGE_LIMIT_KEYS = [
  'maxBytes',
  'maxStorageBytes',
  'storageBytes',
  'trafficBytes',
  'maxTrafficBytes',
  'bandwidthBytes',
  'maxOperations',
  'operationLimit',
  'maxOperationsPerWindow',
  'maxOperationsPerDay',
  'dailyOperations',
  'windowDays',
  'periodDays',
  'alertBytes',
  'warningBytes',
  'warningThreshold',
  'warningPercent',
] as const

const STORAGE_LIMIT_KEY_SET = new Set<string>(STORAGE_LIMIT_KEYS)
const STORAGE_ENFORCEMENT_KEYS = new Set<string>([
  'maxBytes',
  'maxStorageBytes',
  'storageBytes',
  'trafficBytes',
  'maxTrafficBytes',
  'bandwidthBytes',
  'maxOperations',
  'operationLimit',
  'maxOperationsPerWindow',
  'maxOperationsPerDay',
  'dailyOperations',
  'alertBytes',
  'warningBytes',
])
const DEFAULT_OBJECT_STORAGE_TRAFFIC_BYTES = 900_000_000_000

const STORAGE_CHANNEL_PROFILES: StorageChannelProfile[] = [
  {
    id: 'local-memory',
    channel: 'memory',
    provider: 'memory',
    label: 'Local storage',
    description: 'Development/local fallback channel used by Nexus when object storage bindings are unavailable.',
    status: 'active',
    credentialRefPrefix: null,
    requiredConfigKeys: [],
    optionalConfigKeys: ['basePath', 'retentionDays'],
    limitKeys: [...STORAGE_LIMIT_KEYS],
    defaultLimits: {
      maxBytes: 10 * 1024 * 1024 * 1024,
      trafficBytes: 50 * 1024 * 1024 * 1024,
      maxOperationsPerDay: 100000,
      alertBytes: 8 * 1024 * 1024 * 1024,
      windowDays: 30,
    },
    defaultConfig: {
      basePath: 'local://nexus-storage',
    },
  },
  {
    id: 'cloudflare-r2',
    channel: 'r2',
    provider: 'cloudflare-r2',
    label: 'Cloudflare R2',
    description: 'Cloudflare R2 object storage for images, release assets, plugin packages, and resource uploads.',
    status: 'active',
    credentialRefPrefix: 'secure://storage/',
    requiredConfigKeys: [],
    optionalConfigKeys: ['credentialRef', 'binding', 'bucket', 'region', 'endpoint', 'accountId'],
    limitKeys: [...STORAGE_LIMIT_KEYS],
    defaultLimits: {
      maxBytes: 100 * 1024 * 1024 * 1024,
      trafficBytes: DEFAULT_OBJECT_STORAGE_TRAFFIC_BYTES,
      maxOperationsPerDay: 100000,
      alertBytes: 80 * 1024 * 1024 * 1024,
      windowDays: 30,
    },
    defaultConfig: {
      credentialRef: 'secure://storage/r2-default',
      binding: 'R2',
      region: 'auto',
    },
  },
  {
    id: 'aws-s3',
    channel: 's3',
    provider: 'aws-s3',
    label: 'AWS S3',
    description: 'S3-compatible object storage executor with encrypted secure://storage/* access key binding and governance quotas.',
    status: 'active',
    credentialRefPrefix: 'secure://storage/',
    requiredConfigKeys: ['credentialRef', 'bucket', 'region'],
    optionalConfigKeys: ['endpoint', 'forcePathStyle', 'prefix'],
    limitKeys: [...STORAGE_LIMIT_KEYS],
    defaultLimits: {
      maxBytes: 100 * 1024 * 1024 * 1024,
      trafficBytes: DEFAULT_OBJECT_STORAGE_TRAFFIC_BYTES,
      maxOperationsPerDay: 100000,
      alertBytes: 80 * 1024 * 1024 * 1024,
      windowDays: 30,
    },
    defaultConfig: {
      credentialRef: 'secure://storage/s3-default',
      bucket: 'tuff-nexus',
      region: 'us-east-1',
    },
  },
  {
    id: 'aliyun-oss',
    channel: 'oss',
    provider: 'aliyun-oss',
    label: 'Aliyun OSS',
    description: 'Aliyun OSS object storage executor with encrypted secure://storage/* access key binding and governance quotas.',
    status: 'active',
    credentialRefPrefix: 'secure://storage/',
    requiredConfigKeys: ['credentialRef', 'bucket', 'endpoint'],
    optionalConfigKeys: ['region', 'prefix'],
    limitKeys: [...STORAGE_LIMIT_KEYS],
    defaultLimits: {
      maxBytes: 100 * 1024 * 1024 * 1024,
      trafficBytes: DEFAULT_OBJECT_STORAGE_TRAFFIC_BYTES,
      maxOperationsPerDay: 100000,
      alertBytes: 80 * 1024 * 1024 * 1024,
      windowDays: 30,
    },
    defaultConfig: {
      credentialRef: 'secure://storage/oss-default',
      bucket: 'tuff-nexus',
      endpoint: 'oss-cn-hangzhou.aliyuncs.com',
      region: 'cn-hangzhou',
    },
  },
]

function cloneProfile(profile: StorageChannelProfile): StorageChannelProfile {
  return {
    ...profile,
    requiredConfigKeys: [...profile.requiredConfigKeys],
    optionalConfigKeys: [...profile.optionalConfigKeys],
    limitKeys: [...profile.limitKeys],
    defaultLimits: { ...profile.defaultLimits },
    defaultConfig: { ...profile.defaultConfig },
  }
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readConfigRef(config: Record<string, unknown> | null): string | null {
  return readString(config?.credentialRef) ?? readString(config?.authRef)
}

function assertLimitNumber(key: string, value: unknown): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw createError({ statusCode: 400, statusMessage: `limits.${key} must be a non-negative number.` })
  }
  if ((key === 'windowDays' || key === 'periodDays') && (value < 1 || value > 366)) {
    throw createError({ statusCode: 400, statusMessage: `limits.${key} must be between 1 and 366.` })
  }
  if ((key === 'warningThreshold' || key === 'warningPercent') && value > 100) {
    throw createError({ statusCode: 400, statusMessage: `limits.${key} must be between 0 and 100.` })
  }
}

export function listStorageChannelProfiles(): StorageChannelProfile[] {
  return STORAGE_CHANNEL_PROFILES.map(cloneProfile)
}

export function resolveStorageChannelProfile(channel: string, provider: string): StorageChannelProfile | null {
  const normalizedChannel = channel.trim()
  const normalizedProvider = provider.trim()
  return STORAGE_CHANNEL_PROFILES.find(profile =>
    profile.channel === normalizedChannel && profile.provider === normalizedProvider,
  ) ?? null
}

export function assertStorageChannelPolicyConfig(input: StorageChannelPolicyConfigInput): void {
  const channel = readString(input.channel)
  const provider = readString(input.provider)
  if (!channel)
    throw createError({ statusCode: 400, statusMessage: 'storage channel is required.' })
  if (!provider)
    throw createError({ statusCode: 400, statusMessage: 'storage provider is required.' })

  const profile = resolveStorageChannelProfile(channel, provider)
  if (!profile) {
    throw createError({
      statusCode: 400,
      statusMessage: `Unsupported storage channel/provider: ${channel}/${provider}.`,
    })
  }

  const limits = input.limits ?? {}
  const limitKeys = Object.keys(limits)
  if (!limitKeys.some(key => STORAGE_ENFORCEMENT_KEYS.has(key))) {
    throw createError({
      statusCode: 400,
      statusMessage: 'storage limits must include maxBytes, trafficBytes, maxOperations, or alertBytes.',
    })
  }
  for (const [key, value] of Object.entries(limits)) {
    if (!STORAGE_LIMIT_KEY_SET.has(key)) {
      throw createError({ statusCode: 400, statusMessage: `limits.${key} is not supported for storage policies.` })
    }
    assertLimitNumber(key, value)
  }

  const config = input.config ?? {}
  const credentialRef = readConfigRef(config)
  if (profile.credentialRefPrefix && credentialRef && !credentialRef.startsWith(profile.credentialRefPrefix)) {
    throw createError({
      statusCode: 400,
      statusMessage: `config.credentialRef must use ${profile.credentialRefPrefix} for storage channels.`,
    })
  }
  for (const key of profile.requiredConfigKeys) {
    if (!readString(config[key])) {
      throw createError({ statusCode: 400, statusMessage: `config.${key} is required for ${profile.label}.` })
    }
  }
}
