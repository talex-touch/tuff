import type { R2Bucket } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import { recordStorageChannelUsage } from './platformGovernanceStore'

const DEFAULT_CONTENT_TYPE = 'application/octet-stream'
const memoryStorage = new Map<string, { data: Buffer, contentType: string }>()

interface ReleaseAssetStorageOptions {
  actorId?: unknown
  resourceType?: string
}

function resolveAssetStorageChannel(bucket: R2Bucket | null) {
  return {
    channel: bucket ? 'r2' : 'memory',
    provider: bucket ? 'cloudflare-r2' : 'memory',
  }
}

function getAssetBucket(event?: H3Event | null): R2Bucket | null {
  if (!event)
    return null

  const bindings = readCloudflareBindings(event)
  return bindings?.ASSETS ?? bindings?.R2 ?? null
}

export async function uploadReleaseAsset(
  event: H3Event,
  key: string,
  data: Buffer,
  contentType?: string | null,
  options: ReleaseAssetStorageOptions = {},
): Promise<void> {
  const bucket = getAssetBucket(event)
  const resolvedContentType = contentType || DEFAULT_CONTENT_TYPE
  const storage = resolveAssetStorageChannel(bucket)

  if (bucket) {
    const uint8Array = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    await bucket.put(key, uint8Array, {
      httpMetadata: {
        contentType: resolvedContentType,
      },
    })
    await recordStorageChannelUsage(event, {
      action: 'storage.write',
      actorId: options.actorId,
      channel: storage.channel,
      provider: storage.provider,
      resourceType: options.resourceType ?? 'release-asset',
      resourceId: key,
      unit: 'byte',
      quantity: data.byteLength,
      metadata: {
        contentType: resolvedContentType,
      },
    }).catch(() => {})
    return
  }

  memoryStorage.set(key, {
    data,
    contentType: resolvedContentType,
  })
  await recordStorageChannelUsage(event, {
    action: 'storage.write',
    actorId: options.actorId,
    channel: storage.channel,
    provider: storage.provider,
    resourceType: options.resourceType ?? 'release-asset',
    resourceId: key,
    unit: 'byte',
    quantity: data.byteLength,
    metadata: {
      contentType: resolvedContentType,
    },
  }).catch(() => {})
}

export async function getReleaseAsset(
  event: H3Event,
  key: string,
): Promise<{ data: Buffer, contentType: string } | null> {
  const bucket = getAssetBucket(event)
  const storage = resolveAssetStorageChannel(bucket)

  if (bucket) {
    const object = await bucket.get(key)
    if (!object)
      return null

    const arrayBuffer = await object.arrayBuffer()
    await recordStorageChannelUsage(event, {
      action: 'storage.read',
      channel: storage.channel,
      provider: storage.provider,
      resourceType: 'release-asset',
      resourceId: key,
      unit: 'byte',
      quantity: arrayBuffer.byteLength,
      metadata: {
        contentType: object.httpMetadata?.contentType || DEFAULT_CONTENT_TYPE,
      },
    }).catch(() => {})
    return {
      data: Buffer.from(arrayBuffer),
      contentType: object.httpMetadata?.contentType || DEFAULT_CONTENT_TYPE,
    }
  }

  const asset = memoryStorage.get(key) ?? null
  if (asset) {
    await recordStorageChannelUsage(event, {
      action: 'storage.read',
      channel: storage.channel,
      provider: storage.provider,
      resourceType: 'release-asset',
      resourceId: key,
      unit: 'byte',
      quantity: asset.data.byteLength,
      metadata: {
        contentType: asset.contentType,
      },
    }).catch(() => {})
  }
  return asset
}

export async function requireReleaseAsset(
  event: H3Event,
  key: string,
): Promise<{ data: Buffer, contentType: string }> {
  const result = await getReleaseAsset(event, key)
  if (!result) {
    throw createError({ statusCode: 404, statusMessage: 'Asset not found.' })
  }
  return result
}
