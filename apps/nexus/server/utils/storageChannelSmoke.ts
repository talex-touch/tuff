import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import { listPlatformGovernanceConfigs, recordPlatformGovernanceEvent } from './platformGovernanceStore'
import {
  deleteStorageObject,
  getStorageObject,
  putStorageObject,
  resolveStorageObjectExternalConfigForPolicy,
  type StorageObjectMemory,
} from './storageObjectStore'
import { normalizeString } from './telemetrySanitizer'

type StorageChannelSmokeMode = 'dry-run' | 'write'
type StorageChannelSmokeStatus = 'ready' | 'sent' | 'failed'

export interface RunStorageChannelSmokeInput {
  policyId: unknown
  mode?: unknown
  actorId?: unknown
}

export interface StorageChannelSmokeResult {
  policyId: string
  policyName: string
  mode: StorageChannelSmokeMode
  status: StorageChannelSmokeStatus
  reason: string
  channel: string
  provider: string | null
  resourceType: string
  operations: Array<'resolve' | 'write' | 'read' | 'delete'>
  bytesWritten: number
  bytesRead: number
  storageChannel: string | null
  storageProvider: string | null
  credentialRequired: boolean
  hasCredentialRef: boolean
  hasCredential: boolean | null
  generatedAt: string
}

const SMOKE_MEMORY: StorageObjectMemory = new Map()
const SMOKE_RESOURCE_TYPE = 'storage-channel-smoke'
const SMOKE_CONTENT_TYPE = 'application/octet-stream'
const SMOKE_BYTES = Buffer.from('tuff-storage-smoke-v1')

function normalizeMode(value: unknown): StorageChannelSmokeMode {
  if (value == null || value === '')
    return 'dry-run'
  if (value === 'dry-run' || value === 'write')
    return value
  throw createError({ statusCode: 400, statusMessage: 'mode must be dry-run or write.' })
}

function normalizePolicyId(value: unknown): string {
  const policyId = normalizeString(value, 180)
  if (!policyId)
    throw createError({ statusCode: 400, statusMessage: 'policyId is invalid.' })
  return policyId
}

function readCredentialRef(config: Record<string, unknown> | null): string | null {
  return normalizeString(config?.credentialRef, 255)
    ?? normalizeString(config?.authRef, 255)
    ?? null
}

function safeFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  const statusMessage = error && typeof error === 'object'
    ? (error as { statusMessage?: unknown }).statusMessage
    : null
  const reason = typeof statusMessage === 'string' ? statusMessage : message

  if (reason.includes('Storage credential is missing'))
    return 'storage-credential-missing'
  if (reason.includes('External storage PUT failed'))
    return 'storage-write-failed'
  if (reason.includes('External storage GET failed'))
    return 'storage-read-failed'
  if (reason.includes('External storage DELETE failed'))
    return 'storage-delete-failed'
  if (reason.includes('Storage policy limit exceeded'))
    return 'storage-policy-limit-exceeded'
  return 'storage-channel-smoke-failed'
}

function getBucket(event: H3Event, channel: string) {
  if (channel !== 'r2')
    return null
  const bindings = readCloudflareBindings(event)
  return bindings?.R2 ?? bindings?.ASSETS ?? bindings?.PACKAGES ?? bindings?.PLUGIN_PACKAGES ?? null
}

async function recordSmokeAudit(
  event: H3Event,
  actorId: unknown,
  result: StorageChannelSmokeResult,
): Promise<void> {
  const evidenceSource = result.mode === 'write' && result.status === 'sent' && result.storageChannel === 'r2'
    ? 'r2'
    : 'local-only'
  await recordPlatformGovernanceEvent(event, {
    scope: 'storage',
    action: `storage.channel_smoke.${result.status}`,
    actorId,
    resourceType: 'storage_channel',
    resourceId: result.policyId,
    channel: result.channel,
    unit: 'smoke',
    quantity: result.status === 'ready' || result.status === 'sent' ? 1 : 0,
    metadata: {
      policyName: result.policyName,
      provider: result.provider,
      storageChannel: result.storageChannel,
      storageProvider: result.storageProvider,
      evidenceSource,
      mode: result.mode,
      reason: result.reason,
      operations: result.operations,
      credentialRequired: result.credentialRequired,
      hasCredentialRef: result.hasCredentialRef,
      hasCredential: result.hasCredential,
      bytesWritten: result.bytesWritten,
      bytesRead: result.bytesRead,
    },
  })
}

export async function runStorageChannelSmoke(
  event: H3Event,
  input: RunStorageChannelSmokeInput,
): Promise<StorageChannelSmokeResult> {
  const policyId = normalizePolicyId(input.policyId)
  const mode = normalizeMode(input.mode)
  const [policy] = (await listPlatformGovernanceConfigs(event, {
    configType: 'storage_channel',
  })).filter(item => item.id === policyId)

  if (!policy)
    throw createError({ statusCode: 404, statusMessage: 'Storage channel policy not found.' })

  const channel = policy.channel ?? 'memory'
  const credentialRef = readCredentialRef(policy.config)
  const credentialRequired = channel === 's3' || channel === 'oss'
  const base = {
    policyId: policy.id,
    policyName: policy.name,
    mode,
    channel,
    provider: policy.provider ?? null,
    resourceType: policy.targetId ?? SMOKE_RESOURCE_TYPE,
    credentialRequired,
    hasCredentialRef: Boolean(credentialRef),
    generatedAt: new Date().toISOString(),
  }

  try {
    const bucket = getBucket(event, channel)
    const externalStorage = await resolveStorageObjectExternalConfigForPolicy(event, policy)
    const hasCredential = credentialRequired ? Boolean(externalStorage) : null

    if (credentialRequired && !credentialRef) {
      const failed: StorageChannelSmokeResult = {
        ...base,
        status: 'failed',
        reason: 'credential-ref-required',
        operations: ['resolve'],
        bytesWritten: 0,
        bytesRead: 0,
        storageChannel: null,
        storageProvider: null,
        hasCredential,
      }
      await recordSmokeAudit(event, input.actorId, failed)
      return failed
    }

    if (mode === 'dry-run') {
      const ready: StorageChannelSmokeResult = {
        ...base,
        status: 'ready',
        reason: 'storage-channel-resolved',
        operations: ['resolve'],
        bytesWritten: 0,
        bytesRead: 0,
        storageChannel: channel === 'r2' && bucket ? 'r2' : externalStorage?.channel ?? null,
        storageProvider: channel === 'r2' && bucket ? 'cloudflare-r2' : externalStorage?.provider ?? null,
        hasCredential,
      }
      await recordSmokeAudit(event, input.actorId, ready)
      return ready
    }

    const key = `diagnostics/storage-smoke/${randomUUID()}.bin`
    const governanceResourceId = `storage-smoke:${policy.id}`
    const stored = await putStorageObject({
      event,
      bucket,
      memoryStorage: SMOKE_MEMORY,
      externalStorage,
      key,
      governanceResourceId,
      data: SMOKE_BYTES,
      contentType: SMOKE_CONTENT_TYPE,
      actorId: input.actorId,
      resourceType: base.resourceType,
      retryPolicy: {
        maxRetries: 1,
        delaysMs: [0],
      },
    })
    const loaded = await getStorageObject({
      event,
      bucket,
      memoryStorage: SMOKE_MEMORY,
      externalStorage,
      key,
      governanceResourceId,
      resourceType: base.resourceType,
      defaultContentType: SMOKE_CONTENT_TYPE,
    })
    await deleteStorageObject({
      event,
      bucket,
      memoryStorage: SMOKE_MEMORY,
      externalStorage,
      key,
      governanceResourceId,
      actorId: input.actorId,
      resourceType: base.resourceType,
      defaultContentType: SMOKE_CONTENT_TYPE,
    })

    const sent: StorageChannelSmokeResult = {
      ...base,
      status: loaded?.data.equals(SMOKE_BYTES) ? 'sent' : 'failed',
      reason: loaded?.data.equals(SMOKE_BYTES) ? 'storage-channel-write-read-delete-ok' : 'storage-channel-read-mismatch',
      operations: ['resolve', 'write', 'read', 'delete'],
      bytesWritten: stored.size,
      bytesRead: loaded?.size ?? 0,
      storageChannel: stored.storageChannel,
      storageProvider: stored.storageProvider,
      hasCredential,
    }
    await recordSmokeAudit(event, input.actorId, sent)
    return sent
  }
  catch (error) {
    const failed: StorageChannelSmokeResult = {
      ...base,
      status: 'failed',
      reason: safeFailureReason(error),
      operations: ['resolve'],
      bytesWritten: 0,
      bytesRead: 0,
      storageChannel: null,
      storageProvider: null,
      hasCredential: null,
    }
    await recordSmokeAudit(event, input.actorId, failed)
    return failed
  }
}
