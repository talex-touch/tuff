import type { R2Bucket } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import type { Buffer } from 'node:buffer'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import {
  getStorageObject,
  putStorageObject,
  type StorageObjectResult,
  type StorageObjectMemory,
} from './storageObjectStore'

const DEFAULT_CONTENT_TYPE = 'application/octet-stream'
const memoryStorage: StorageObjectMemory = new Map()

interface ReleaseAssetStorageOptions {
  actorId?: unknown
  governanceResourceId?: string | null
  resourceType?: string
}

type ReleaseAssetUploadResult = Omit<StorageObjectResult, 'data'>

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
): Promise<ReleaseAssetUploadResult> {
  const bucket = getAssetBucket(event)
  return await putStorageObject({
    event,
    bucket,
    memoryStorage,
    key,
    data,
    contentType,
    actorId: options.actorId,
    governanceResourceId: options.governanceResourceId,
    resourceType: options.resourceType ?? 'release-asset',
    defaultContentType: DEFAULT_CONTENT_TYPE,
  })
}

export async function getReleaseAsset(
  event: H3Event,
  key: string,
  options: Pick<ReleaseAssetStorageOptions, 'governanceResourceId' | 'resourceType'> = {},
): Promise<{ data: Buffer, contentType: string } | null> {
  const bucket = getAssetBucket(event)
  const object = await getStorageObject({
    event,
    bucket,
    memoryStorage,
    key,
    governanceResourceId: options.governanceResourceId,
    resourceType: options.resourceType ?? 'release-asset',
    defaultContentType: DEFAULT_CONTENT_TYPE,
  })
  return object
    ? { data: object.data, contentType: object.contentType }
    : null
}

export async function requireReleaseAsset(
  event: H3Event,
  key: string,
  options: Pick<ReleaseAssetStorageOptions, 'governanceResourceId' | 'resourceType'> = {},
): Promise<{ data: Buffer, contentType: string }> {
  const result = await getReleaseAsset(event, key, options)
  if (!result) {
    throw createError({ statusCode: 404, statusMessage: 'Asset not found.' })
  }
  return result
}
