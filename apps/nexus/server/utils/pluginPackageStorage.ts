import type { R2Bucket } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'

const MAX_PACKAGE_SIZE = 30 * 1024 * 1024 // 30MB
const DEFAULT_CONTENT_TYPE = 'application/octet-stream'

const memoryStorage = new Map<string, { data: Buffer, contentType: string }>()

interface UploadResult {
  key: string
  url: string
  size: number
  contentType: string
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
): Promise<UploadResult> {
  ensureTpexFile(file)

  const resolvedArrayBuffer = arrayBuffer ?? await file.arrayBuffer()
  const pkgBytes = new Uint8Array(resolvedArrayBuffer)
  const contentType = file.type || DEFAULT_CONTENT_TYPE
  const key = `${randomUUID()}.tpex`
  const bucket = getPackageBucket(event)

  if (bucket) {
    await bucket.put(key, pkgBytes, {
      httpMetadata: {
        contentType,
      },
    })
  }
  else {
    memoryStorage.set(key, {
      data: Buffer.from(pkgBytes),
      contentType,
    })
  }

  return {
    key,
    url: `/api/plugins/assets/${key}`,
    size: pkgBytes.byteLength,
    contentType,
  }
}

export async function getPluginPackage(
  event: H3Event,
  key: string,
): Promise<{ data: Buffer | ArrayBuffer, contentType: string } | null> {
  const bucket = getPackageBucket(event)

  if (bucket) {
    const object = await bucket.get(key)
    if (!object)
      return null

    return {
      data: await object.arrayBuffer(),
      contentType: object.httpMetadata?.contentType || DEFAULT_CONTENT_TYPE,
    }
  }

  const stored = memoryStorage.get(key)
  if (!stored)
    return null

  return {
    data: stored.data,
    contentType: stored.contentType || DEFAULT_CONTENT_TYPE,
  }
}

export async function deletePluginPackage(event: H3Event, key: string): Promise<void> {
  const bucket = getPackageBucket(event)

  if (bucket)
    await bucket.delete(key)
  else
    memoryStorage.delete(key)
}
