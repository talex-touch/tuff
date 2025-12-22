import type { R2Bucket } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'

const DEFAULT_CONTENT_TYPE = 'application/octet-stream'
const memoryStorage = new Map<string, { data: Buffer, contentType: string }>()

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
): Promise<void> {
  const bucket = getAssetBucket(event)
  const resolvedContentType = contentType || DEFAULT_CONTENT_TYPE

  if (bucket) {
    const uint8Array = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    await bucket.put(key, uint8Array, {
      httpMetadata: {
        contentType: resolvedContentType,
      },
    })
    return
  }

  memoryStorage.set(key, {
    data,
    contentType: resolvedContentType,
  })
}

export async function getReleaseAsset(
  event: H3Event,
  key: string,
): Promise<{ data: Buffer, contentType: string } | null> {
  const bucket = getAssetBucket(event)

  if (bucket) {
    const object = await bucket.get(key)
    if (!object)
      return null

    const arrayBuffer = await object.arrayBuffer()
    return {
      data: Buffer.from(arrayBuffer),
      contentType: object.httpMetadata?.contentType || DEFAULT_CONTENT_TYPE,
    }
  }

  return memoryStorage.get(key) ?? null
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
