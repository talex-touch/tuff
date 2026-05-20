import type { R2Bucket } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import { recordStorageChannelUsage } from './platformGovernanceStore'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = [
  'image/*',
]
const ATTACHMENT_TYPES = [
  ...ALLOWED_TYPES,
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-7z-compressed',
  'application/x-rar-compressed',
  'application/x-tar',
  'application/gzip',
  'application/x-gzip',
  'application/x-bzip2',
  'application/x-bzip',
  'application/x-xz',
  'application/x-lzip',
  'application/octet-stream',
  'application/json',
  'text/plain',
  'text/markdown',
]

const IMAGE_ALLOWED_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'svg',
  'ico',
  'bmp',
  'avif',
  'heic',
  'heif',
  'tif',
  'tiff',
]

export const RESOURCE_ALLOWED_TYPES = ATTACHMENT_TYPES
export const RESOURCE_ALLOWED_EXTENSIONS = [
  ...IMAGE_ALLOWED_EXTENSIONS,
  'tpex',
  'zip',
  'rar',
  '7z',
  'gz',
  'tgz',
  'tar',
  'bz',
  'bz2',
  'xz',
  'lz',
]

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/x-7z-compressed': '7z',
  'application/x-rar-compressed': 'rar',
  'application/x-tar': 'tar',
  'application/gzip': 'gz',
  'application/x-gzip': 'gz',
  'application/x-bzip2': 'bz2',
  'application/x-bzip': 'bz',
  'application/x-xz': 'xz',
  'application/x-lzip': 'lz',
  'application/octet-stream': 'bin',
  'application/json': 'json',
  'text/plain': 'txt',
  'text/markdown': 'md',
}

let hasLoggedImageStorageBinding = false

// 内存存储（用于开发环境）
const memoryStorage = new Map<string, { data: Buffer, contentType: string }>()

interface UploadResult {
  url: string
  key: string
}

interface UploadOptions {
  allowedTypes?: string[]
  allowedExtensions?: string[]
  actorId?: unknown
  resourceType?: string
}

function resolveStorageChannel(bucket: R2Bucket | null) {
  return {
    channel: bucket ? 'r2' : 'memory',
    provider: bucket ? 'cloudflare-r2' : 'memory',
  }
}

async function recordImageStorageWrite(
  event: H3Event,
  bucket: R2Bucket | null,
  key: string,
  size: number,
  contentType: string,
  actorId: unknown,
  resourceType = 'image',
): Promise<void> {
  const storage = resolveStorageChannel(bucket)
  await recordStorageChannelUsage(event, {
    action: 'storage.write',
    actorId,
    channel: storage.channel,
    provider: storage.provider,
    resourceType,
    resourceId: key,
    unit: 'byte',
    quantity: size,
    metadata: {
      contentType: contentType || 'application/octet-stream',
    },
  }).catch(() => {})
}

async function recordImageStorageRead(
  event: H3Event,
  bucket: R2Bucket | null,
  key: string,
  size: number,
  contentType: string,
): Promise<void> {
  const storage = resolveStorageChannel(bucket)
  await recordStorageChannelUsage(event, {
    action: 'storage.read',
    channel: storage.channel,
    provider: storage.provider,
    resourceType: 'image',
    resourceId: key,
    unit: 'byte',
    quantity: size,
    metadata: {
      contentType: contentType || 'application/octet-stream',
    },
  }).catch(() => {})
}

async function recordImageStorageDelete(
  event: H3Event,
  bucket: R2Bucket | null,
  key: string,
): Promise<void> {
  const storage = resolveStorageChannel(bucket)
  await recordStorageChannelUsage(event, {
    action: 'storage.delete',
    channel: storage.channel,
    provider: storage.provider,
    resourceType: 'image',
    resourceId: key,
    unit: 'operation',
    quantity: 1,
  }).catch(() => {})
}

/**
 * 获取 R2 bucket
 */
function getR2Bucket(event?: H3Event | null): R2Bucket | null {
  if (!event)
    return null

  const bindings = readCloudflareBindings(event)
  let bucket: R2Bucket | null = null
  let bindingName: string | null = null

  if (bindings?.IMAGES) {
    bucket = bindings.IMAGES
    bindingName = 'IMAGES'
  }
  else if (bindings?.R2) {
    bucket = bindings.R2
    bindingName = 'R2'
  }
  else if (bindings?.ASSETS) {
    bucket = bindings.ASSETS
    bindingName = 'ASSETS'
  }

  if (!hasLoggedImageStorageBinding) {
    console.warn('[imageStorage] 存储绑定检测', {
      usingR2: Boolean(bucket),
      binding: bindingName,
    })
    hasLoggedImageStorageBinding = true
  }

  return bucket
}

/**
 * 验证文件类型和大小
 */
function matchesAllowedMime(type: string, allowedTypes: string[]): boolean {
  const normalized = (type || '').toLowerCase()

  return allowedTypes.some((allowed) => {
    const value = allowed.toLowerCase()

    if (value.endsWith('/*')) {
      const prefix = value.slice(0, -1)
      return normalized.startsWith(prefix)
    }

    return normalized === value
  })
}

function validateFile(file: File, allowedTypes: string[], allowedExtensions: string[]): void {
  const normalizedExtensions = allowedExtensions.map(ext => ext.toLowerCase())
  const extension = sanitizeExtension(extractExtensionFromName(file.name))

  const isMimeAllowed = matchesAllowedMime(file.type, allowedTypes)
  const isExtensionAllowed = extension ? normalizedExtensions.includes(extension) : false

  if (!(isMimeAllowed || isExtensionAllowed)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid file type.',
    })
  }

  if (file.size > MAX_FILE_SIZE) {
    throw createError({
      statusCode: 400,
      statusMessage: 'File size exceeds 5MB limit.',
    })
  }
}

/**
 * 生成文件扩展名
 */
function sanitizeExtension(extension?: string | null): string | null {
  if (!extension)
    return null

  const normalized = extension.toLowerCase().replace(/[^a-z0-9]/g, '')
  return normalized.length ? normalized : null
}

function extractExtensionFromName(name?: string | null): string | null {
  if (!name)
    return null

  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/)
  return match ? sanitizeExtension(match[1]) : null
}

function getFileExtension(file: File): string {
  const mapped = sanitizeExtension(MIME_EXTENSION_MAP[file.type])
  if (mapped)
    return mapped

  const fromName = extractExtensionFromName(file.name)
  if (fromName)
    return fromName

  return 'bin'
}

/**
 * 上传图片到 R2（生产环境）
 */
async function uploadToR2(
  bucket: R2Bucket,
  file: File,
  key: string,
): Promise<void> {
  const arrayBuffer = await file.arrayBuffer()
  await bucket.put(key, arrayBuffer, {
    httpMetadata: {
      contentType: file.type,
    },
  })
}

/**
 * 从 R2 获取图片
 */
async function getFromR2(
  bucket: R2Bucket,
  key: string,
): Promise<{ data: ArrayBuffer | Buffer, contentType: string } | null> {
  const object = await bucket.get(key)
  if (!object)
    return null

  const arrayBuffer = await object.arrayBuffer()
  const data = typeof Buffer !== 'undefined'
    ? Buffer.from(arrayBuffer)
    : arrayBuffer

  return {
    data,
    contentType: object.httpMetadata?.contentType || 'image/jpeg',
  }
}

/**
 * 从 R2 删除图片
 */
async function deleteFromR2(bucket: R2Bucket, key: string): Promise<void> {
  await bucket.delete(key)
}

/**
 * 上传图片到内存存储（开发环境）
 */
async function uploadToMemory(file: File, key: string): Promise<void> {
  const arrayBuffer = await file.arrayBuffer()
  memoryStorage.set(key, {
    data: Buffer.from(arrayBuffer),
    contentType: file.type,
  })
}

/**
 * 从内存获取图片
 */
function getFromMemory(key: string): { data: Buffer, contentType: string } | null {
  return memoryStorage.get(key) || null
}

/**
 * 从内存删除图片
 */
function deleteFromMemory(key: string): void {
  memoryStorage.delete(key)
}

/**
 * 上传图片
 */
export async function uploadImage(
  event: H3Event,
  file: File,
  options: UploadOptions = {},
): Promise<UploadResult> {
  const allowedTypes = options.allowedTypes ?? ALLOWED_TYPES
  const allowedExtensions = options.allowedExtensions ?? IMAGE_ALLOWED_EXTENSIONS

  validateFile(file, allowedTypes, allowedExtensions)

  const ext = getFileExtension(file)
  const key = `${randomUUID()}.${ext}`

  const bucket = getR2Bucket(event)

  if (bucket) {
    // 生产环境：使用 R2
    await uploadToR2(bucket, file, key)
    await recordImageStorageWrite(event, bucket, key, file.size, file.type, options.actorId, options.resourceType)
    return {
      url: `/api/images/${key}`,
      key,
    }
  }
  else {
    // 开发环境：使用内存存储
    await uploadToMemory(file, key)
    await recordImageStorageWrite(event, bucket, key, file.size, file.type, options.actorId, options.resourceType)
    return {
      url: `/api/images/${key}`,
      key,
    }
  }
}

/**
 * 获取图片
 */
export async function getImage(
  event: H3Event,
  key: string,
): Promise<{ data: Buffer | ArrayBuffer, contentType: string } | null> {
  const bucket = getR2Bucket(event)

  if (bucket) {
    // 生产环境：从 R2 获取
    const result = await getFromR2(bucket, key)
    if (!result)
      return null
    const data = typeof Buffer !== 'undefined' && result.data instanceof ArrayBuffer
      ? Buffer.from(result.data)
      : result.data
    await recordImageStorageRead(event, bucket, key, data.byteLength, result.contentType)
    return {
      data,
      contentType: result.contentType,
    }
  }
  else {
    // 开发环境：从内存获取
    const result = getFromMemory(key)
    if (result)
      await recordImageStorageRead(event, bucket, key, result.data.byteLength, result.contentType)
    return result
  }
}

/**
 * 删除图片
 */
export async function deleteImage(event: H3Event, key: string): Promise<void> {
  const bucket = getR2Bucket(event)

  if (bucket) {
    // 生产环境：从 R2 删除
    await deleteFromR2(bucket, key)
    await recordImageStorageDelete(event, bucket, key)
  }
  else {
    // 开发环境：从内存删除
    deleteFromMemory(key)
    await recordImageStorageDelete(event, bucket, key)
  }
}

/**
 * 列出所有图片（仅用于管理）
 */
export async function listImages(event: H3Event): Promise<string[]> {
  const bucket = getR2Bucket(event)

  if (bucket) {
    // 生产环境：列出 R2 中的所有对象
    const list = await bucket.list()
    return list.objects.map(obj => obj.key)
  }
  else {
    // 开发环境：列出内存中的所有键
    return Array.from(memoryStorage.keys())
  }
}

/**
 * 从 Buffer 上传图片（用于从 tpex 包中提取的 icon）
 */
export async function uploadImageFromBuffer(
  event: H3Event,
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  options: Pick<UploadOptions, 'actorId' | 'resourceType'> = {},
): Promise<UploadResult> {
  // Get extension from filename
  const ext = fileName.split('.').pop()?.toLowerCase() ?? 'svg'

  // Validate extension
  if (!IMAGE_ALLOWED_EXTENSIONS.includes(ext)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid image extension: ${ext}. Allowed: ${IMAGE_ALLOWED_EXTENSIONS.join(', ')}`,
    })
  }

  // Validate size
  if (buffer.length > MAX_FILE_SIZE) {
    throw createError({
      statusCode: 400,
      statusMessage: `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    })
  }

  const key = `${randomUUID()}.${ext}`
  const bucket = getR2Bucket(event)

  if (bucket) {
    // Production: upload to R2
    // Convert Node.js Buffer to Uint8Array for R2 compatibility
    const uint8Array = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    await bucket.put(key, uint8Array, {
      httpMetadata: { contentType: mimeType },
    })
    await recordImageStorageWrite(event, bucket, key, buffer.length, mimeType, options.actorId, options.resourceType)
    return {
      url: `/api/images/${key}`,
      key,
    }
  }
  else {
    // Development: use memory storage
    memoryStorage.set(key, { data: buffer, contentType: mimeType })
    await recordImageStorageWrite(event, bucket, key, buffer.length, mimeType, options.actorId, options.resourceType)
    return {
      url: `/api/images/${key}`,
      key,
    }
  }
}
