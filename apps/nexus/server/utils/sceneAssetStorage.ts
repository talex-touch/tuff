import type { R2Bucket } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import type { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import {
  getStorageObject,
  putStorageObject,
  type StorageObjectMemory,
  type StorageObjectResult,
} from './storageObjectStore'

const DEFAULT_CONTENT_TYPE = 'application/octet-stream'
const memoryStorage: StorageObjectMemory = new Map()

interface SceneAssetStorageOptions {
  actorId?: unknown
  governanceResourceId?: string | null
  resourceType?: string
}

type SceneAssetUploadResult = Omit<StorageObjectResult, 'data'>

export function buildSceneAssetGovernanceResourceId(key: string): string {
  return `scene-asset:${createHash('sha256').update(key).digest('hex').slice(0, 32)}`
}

function getSceneAssetBucket(event?: H3Event | null): R2Bucket | null {
  if (!event)
    return null

  const bindings = readCloudflareBindings(event)
  return bindings?.ASSETS ?? bindings?.R2 ?? null
}

export async function uploadSceneAsset(
  event: H3Event,
  key: string,
  data: Buffer,
  contentType?: string | null,
  options: SceneAssetStorageOptions = {},
): Promise<SceneAssetUploadResult> {
  const bucket = getSceneAssetBucket(event)
  const governanceResourceId = options.governanceResourceId ?? buildSceneAssetGovernanceResourceId(key)
  return await putStorageObject({
    event,
    bucket,
    memoryStorage,
    key,
    data,
    contentType,
    actorId: options.actorId,
    governanceResourceId,
    resourceType: options.resourceType ?? 'scene-asset',
    defaultContentType: DEFAULT_CONTENT_TYPE,
  })
}

export async function getSceneAsset(
  event: H3Event,
  key: string,
  options: Pick<SceneAssetStorageOptions, 'governanceResourceId' | 'resourceType'> = {},
): Promise<{ data: Buffer, contentType: string, sha256: string } | null> {
  const bucket = getSceneAssetBucket(event)
  const governanceResourceId = options.governanceResourceId ?? buildSceneAssetGovernanceResourceId(key)
  const object = await getStorageObject({
    event,
    bucket,
    memoryStorage,
    key,
    governanceResourceId,
    resourceType: options.resourceType ?? 'scene-asset',
    defaultContentType: DEFAULT_CONTENT_TYPE,
  })
  return object
    ? { data: object.data, contentType: object.contentType, sha256: object.sha256 }
    : null
}

export async function requireSceneAsset(
  event: H3Event,
  key: string,
  options: Pick<SceneAssetStorageOptions, 'governanceResourceId' | 'resourceType'> = {},
): Promise<{ data: Buffer, contentType: string, sha256: string }> {
  const result = await getSceneAsset(event, key, options)
  if (!result)
    throw createError({ statusCode: 404, statusMessage: 'Scene asset not found.' })
  return result
}
