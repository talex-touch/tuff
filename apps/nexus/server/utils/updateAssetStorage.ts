import type { H3Event } from 'h3'
import type { R2Bucket } from '@cloudflare/workers-types'
import type { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import { getStorageObject, putStorageObject, type StorageObjectMemory } from './storageObjectStore'

const DEFAULT_CONTENT_TYPE = 'application/octet-stream'
const UPDATE_PAYLOAD_RESOURCE_TYPE = 'update-payload'
const memoryStorage: StorageObjectMemory = new Map()

function getUpdatePayloadGovernanceId(key: string): string {
  return `${UPDATE_PAYLOAD_RESOURCE_TYPE}:${createHash('sha256').update(key).digest('hex').slice(0, 16)}`
}

function getAssetBucket(event?: H3Event | null): R2Bucket | null {
  if (!event)
    return null

  const bindings = readCloudflareBindings(event)
  return bindings?.ASSETS ?? bindings?.R2 ?? null
}

export async function saveUpdateAsset(
  event: H3Event,
  key: string,
  data: Buffer,
  contentType?: string | null,
): Promise<void> {
  const bucket = getAssetBucket(event)
  const resolvedContentType = contentType || DEFAULT_CONTENT_TYPE

  await putStorageObject({
    event,
    bucket,
    memoryStorage,
    externalStorage: null,
    key,
    data,
    contentType: resolvedContentType,
    resourceType: UPDATE_PAYLOAD_RESOURCE_TYPE,
    governanceResourceId: getUpdatePayloadGovernanceId(key),
  })
}

export async function getUpdateAsset(
  event: H3Event,
  key: string,
): Promise<{ data: Buffer, contentType: string } | null> {
  const bucket = getAssetBucket(event)
  return await getStorageObject({
    event,
    bucket,
    memoryStorage,
    externalStorage: null,
    key,
    resourceType: UPDATE_PAYLOAD_RESOURCE_TYPE,
    governanceResourceId: getUpdatePayloadGovernanceId(key),
    defaultContentType: DEFAULT_CONTENT_TYPE,
  })
}

export async function requireUpdateAsset(
  event: H3Event,
  key: string,
): Promise<{ data: Buffer, contentType: string }> {
  const result = await getUpdateAsset(event, key)
  if (!result) {
    throw createError({ statusCode: 404, statusMessage: 'Update payload not found.' })
  }
  return result
}
