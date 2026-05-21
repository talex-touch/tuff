import type { R2Bucket } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import type { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import {
  deleteStorageObject,
  getStorageObject,
  listStorageObjectKeys,
  putStorageObject,
  type StorageObjectMemory,
} from './storageObjectStore'
import {
  completeUploadGovernance,
  failUploadGovernance,
  startUploadGovernance,
  type UploadGovernanceContext,
} from './uploadGovernance'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const DEFAULT_CONTENT_TYPE = 'application/octet-stream'
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
const memoryStorage: StorageObjectMemory = new Map()

interface UploadResult {
  url: string
  key: string
  storageChannel: string
  storageProvider: string
}

interface UploadOptions {
  allowedTypes?: string[]
  allowedExtensions?: string[]
  actorId?: unknown
  resourceType?: string
  uploadLifecycle?: {
    surface: string
    resourceId?: string | null
    metadata?: Record<string, unknown>
  }
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

function getUploadLifecycleMetadata(options: UploadOptions): Record<string, unknown> {
  return {
    ...options.uploadLifecycle?.metadata,
    surface: options.uploadLifecycle?.surface,
  }
}

async function startImageUploadLifecycle(
  event: H3Event,
  file: { name?: string | null, size?: number | null, type?: string | null },
  options: UploadOptions,
): Promise<UploadGovernanceContext | null> {
  if (!options.uploadLifecycle)
    return null

  return startUploadGovernance(event, {
    actorId: options.actorId,
    resourceType: options.resourceType ?? 'image',
    resourceId: options.uploadLifecycle.resourceId ?? null,
    file,
    metadata: getUploadLifecycleMetadata(options),
  })
}

async function failImageUploadLifecycle(
  event: H3Event,
  context: UploadGovernanceContext | null,
  error: unknown,
  options: UploadOptions,
): Promise<void> {
  if (!context)
    return

  await failUploadGovernance(event, context, error, {
    metadata: getUploadLifecycleMetadata(options),
  })
}

async function completeImageUploadLifecycle(
  event: H3Event,
  context: UploadGovernanceContext | null,
  result: Omit<UploadResult, 'url'> & { size: number, contentType: string },
  options: UploadOptions,
): Promise<void> {
  if (!context)
    return

  await completeUploadGovernance(event, context, {
    resourceId: options.uploadLifecycle?.resourceId ?? result.key,
    contentType: result.contentType,
    size: result.size,
    storageChannel: result.storageChannel,
    storageProvider: result.storageProvider,
    metadata: getUploadLifecycleMetadata(options),
  })
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
  const uploadAttempt = await startImageUploadLifecycle(event, file, options)

  try {
    validateFile(file, allowedTypes, allowedExtensions)

    const ext = getFileExtension(file)
    const key = `${randomUUID()}.${ext}`
    const bucket = getR2Bucket(event)
    const result = await putStorageObject({
      event,
      bucket,
      memoryStorage,
      key,
      data: await file.arrayBuffer(),
      contentType: file.type,
      actorId: options.actorId,
      resourceType: options.resourceType ?? 'image',
      defaultContentType: DEFAULT_CONTENT_TYPE,
    })

    await completeImageUploadLifecycle(event, uploadAttempt, result, options)

    return {
      url: `/api/images/${key}`,
      key,
      storageChannel: result.storageChannel,
      storageProvider: result.storageProvider,
    }
  }
  catch (error) {
    await failImageUploadLifecycle(event, uploadAttempt, error, options)
    throw error
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
  const object = await getStorageObject({
    event,
    bucket,
    memoryStorage,
    key,
    resourceType: 'image',
    defaultContentType: 'image/jpeg',
  })
  return object
    ? { data: object.data, contentType: object.contentType }
    : null
}

/**
 * 删除图片
 */
export async function deleteImage(event: H3Event, key: string): Promise<void> {
  const bucket = getR2Bucket(event)
  await deleteStorageObject({
    event,
    bucket,
    memoryStorage,
    key,
    resourceType: 'image',
    defaultContentType: DEFAULT_CONTENT_TYPE,
  })
}

/**
 * 列出所有图片（仅用于管理）
 */
export async function listImages(event: H3Event): Promise<string[]> {
  const bucket = getR2Bucket(event)
  return listStorageObjectKeys(bucket, memoryStorage)
}

/**
 * 从 Buffer 上传图片（用于从 tpex 包中提取的 icon）
 */
export async function uploadImageFromBuffer(
  event: H3Event,
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  options: Pick<UploadOptions, 'actorId' | 'resourceType' | 'uploadLifecycle'> = {},
): Promise<UploadResult> {
  const uploadAttempt = await startImageUploadLifecycle(event, {
    name: fileName,
    size: buffer.length,
    type: mimeType,
  }, options)

  try {
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
    const result = await putStorageObject({
      event,
      bucket,
      memoryStorage,
      key,
      data: buffer,
      contentType: mimeType,
      actorId: options.actorId,
      resourceType: options.resourceType ?? 'image',
      defaultContentType: DEFAULT_CONTENT_TYPE,
    })

    await completeImageUploadLifecycle(event, uploadAttempt, result, options)

    return {
      url: `/api/images/${key}`,
      key,
      storageChannel: result.storageChannel,
      storageProvider: result.storageProvider,
    }
  }
  catch (error) {
    await failImageUploadLifecycle(event, uploadAttempt, error, options)
    throw error
  }
}
