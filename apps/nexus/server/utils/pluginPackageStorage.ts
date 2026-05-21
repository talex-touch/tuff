import type { R2Bucket } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import type { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import {
  deleteStorageObject,
  getStorageObject,
  putStorageObject,
  type StorageObjectMemory,
} from './storageObjectStore'

const MAX_PACKAGE_SIZE = 30 * 1024 * 1024 // 30MB
const DEFAULT_CONTENT_TYPE = 'application/octet-stream'

const memoryStorage: StorageObjectMemory = new Map()

interface UploadResult {
  key: string
  url: string
  size: number
  contentType: string
  storageChannel: string
  storageProvider: string
}

interface PluginPackageStorageOptions {
  actorId?: unknown
  governanceResourceId?: string | null
}

function getPackageBucket(event?: H3Event | null): R2Bucket | null {
  if (!event)
    return null

  const bindings = readCloudflareBindings(event)
  return (
    bindings?.PLUGIN_PACKAGES
    ?? bindings?.PACKAGES
    ?? bindings?.R2
    ?? bindings?.ASSETS
    ?? null
  )
}

function ensureTpexFile(file: File) {
  const name = (file.name ?? '').toLowerCase()

  if (!name.endsWith('.tpex')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid package type. Only .tpex files are supported.',
    })
  }

  if (file.size > MAX_PACKAGE_SIZE) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Package size exceeds 30MB limit.',
    })
  }
}

export async function uploadPluginPackage(
  event: H3Event,
  file: File,
  arrayBuffer?: ArrayBuffer,
  options: PluginPackageStorageOptions = {},
): Promise<UploadResult> {
  ensureTpexFile(file)

  const resolvedArrayBuffer = arrayBuffer ?? await file.arrayBuffer()
  const pkgBytes = new Uint8Array(resolvedArrayBuffer)
  const contentType = file.type || DEFAULT_CONTENT_TYPE
  const key = `${randomUUID()}.tpex`
  const bucket = getPackageBucket(event)
  const result = await putStorageObject({
    event,
    bucket,
    memoryStorage,
    key,
    data: pkgBytes,
    contentType,
    actorId: options.actorId,
    governanceResourceId: options.governanceResourceId,
    resourceType: 'plugin-package',
    defaultContentType: DEFAULT_CONTENT_TYPE,
  })

  return {
    key,
    url: `/api/plugins/assets/${key}`,
    size: result.size,
    contentType: result.contentType,
    storageChannel: result.storageChannel,
    storageProvider: result.storageProvider,
  }
}

export async function getPluginPackage(
  event: H3Event,
  key: string,
  options: Pick<PluginPackageStorageOptions, 'governanceResourceId'> = {},
): Promise<{ data: Buffer | ArrayBuffer, contentType: string } | null> {
  const bucket = getPackageBucket(event)
  const object = await getStorageObject({
    event,
    bucket,
    memoryStorage,
    key,
    governanceResourceId: options.governanceResourceId,
    resourceType: 'plugin-package',
    defaultContentType: DEFAULT_CONTENT_TYPE,
  })
  return object
    ? { data: object.data, contentType: object.contentType }
    : null
}

export async function deletePluginPackage(
  event: H3Event,
  key: string,
  options: Pick<PluginPackageStorageOptions, 'governanceResourceId'> = {},
): Promise<void> {
  const bucket = getPackageBucket(event)
  await deleteStorageObject({
    event,
    bucket,
    memoryStorage,
    key,
    governanceResourceId: options.governanceResourceId,
    resourceType: 'plugin-package',
    defaultContentType: DEFAULT_CONTENT_TYPE,
  })
}
