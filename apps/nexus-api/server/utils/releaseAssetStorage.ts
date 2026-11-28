import type { R2Bucket } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import type { Buffer } from 'node:buffer'
import { createError } from 'h3'
import { resolveObjectBucket } from './cloudflare'
import {
  getStorageObject,
  openStorageObject,
  putStorageObject,
  type StorageObjectResult,
  type StorageObjectMemory,
  type StorageObjectStream,
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
  return resolveObjectBucket(event)
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

/**
 * The asset as a stream. Installers run to hundreds of megabytes, past the isolate's 128 MB, which
 * every request it is serving shares; read whole, one download could take the isolate down.
 */
export async function requireReleaseAssetStream(
  event: H3Event,
  key: string,
  options: Pick<ReleaseAssetStorageOptions, 'governanceResourceId' | 'resourceType'> = {},
): Promise<StorageObjectStream> {
  const object = await openStorageObject({
    event,
    bucket: getAssetBucket(event),
    memoryStorage,
    key,
    governanceResourceId: options.governanceResourceId,
    resourceType: options.resourceType ?? 'release-asset',
    defaultContentType: DEFAULT_CONTENT_TYPE,
  })
  if (!object)
    throw createError({ statusCode: 404, statusMessage: 'Asset not found.' })
  return object
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
