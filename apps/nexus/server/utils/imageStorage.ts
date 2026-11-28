import type { R2Bucket } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import type { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { resolveObjectBucketBinding } from './cloudflare'
import {
  deleteStorageObject,
  getStorageObject,
  listStorageObjectKeys,
  putStorageObject,
  type StorageObjectMemory,
  type StorageUploadRetryMetadata,
} from './storageObjectStore'
import {
  completeUploadGovernance,
  failUploadGovernance,
  startUploadGovernance,
  type UploadGovernanceContext,
} from './uploadGovernance'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const DEFAULT_CONTENT_TYPE = 'application/octet-stream'
export const IMAGE_STORAGE_PREFIX = 'images/'

/**
 * Explicit raster image MIME allowlist. Never use `image/*`: it admits `image/svg+xml`
 * and arbitrary vendor subtypes that browsers can execute when served same-origin.
 */
export const SAFE_INLINE_IMAGE_TYPES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/tiff',
  'image/heic',
  'image/heif',
])

const ALLOWED_TYPES = Array.from(SAFE_INLINE_IMAGE_TYPES)
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

// No 'svg'. An SVG is an active document: it can carry <script>, and /api/images/[key]
// echoes the stored content type, so one uploaded through the non-admin plugin:publish scope
// ran same-origin against any visitor who opened it (#896). Raster formats have no such
// execution surface.
const IMAGE_ALLOWED_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
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
  'pdf',
  'json',
  'txt',
  'md',
]

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/tiff': 'tiff',
  'image/heic': 'heic',
  'image/heif': 'heif',
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

const IMAGE_EXTENSION_TO_MIMES: Record<string, ReadonlySet<string>> = {
  jpg: new Set(['image/jpeg']),
  jpeg: new Set(['image/jpeg']),
  png: new Set(['image/png']),
  gif: new Set(['image/gif']),
  webp: new Set(['image/webp']),
  ico: new Set(['image/x-icon', 'image/vnd.microsoft.icon']),
  bmp: new Set(['image/bmp']),
  avif: new Set(['image/avif']),
  heic: new Set(['image/heic', 'image/heif']),
  heif: new Set(['image/heif', 'image/heic']),
  tif: new Set(['image/tiff']),
  tiff: new Set(['image/tiff']),
}

const SAFE_IMAGE_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,254}$/

export function normalizeMimeType(value: string | null | undefined): string {
  if (typeof value !== 'string')
    return ''
  return value.split(';', 1)[0]?.trim().toLowerCase() ?? ''
}

export function isSafeInlineImageMime(contentType: string | null | undefined): boolean {
  const normalized = normalizeMimeType(contentType)
  return SAFE_INLINE_IMAGE_TYPES.has(normalized)
}

export function assertValidImageKey(key: unknown): string {
  if (typeof key !== 'string' || !key) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid image key',
    })
  }
  const trimmed = key.trim()
  if (
    !trimmed
    || trimmed !== key
    || trimmed.includes('/')
    || trimmed.includes('\\')
    || trimmed.includes('..')
    || trimmed.includes('\0')
    || trimmed.includes('%')
    || !SAFE_IMAGE_KEY_PATTERN.test(trimmed)
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid image key',
    })
  }
  return trimmed
}

function toPrefixedImageKey(key: string): string {
  return `${IMAGE_STORAGE_PREFIX}${key}`
}

function stripImagePrefix(storageKey: string): string {
  return storageKey.startsWith(IMAGE_STORAGE_PREFIX)
    ? storageKey.slice(IMAGE_STORAGE_PREFIX.length)
    : storageKey
}

/**
 * Inspects file magic bytes to detect a supported raster image MIME type.
 * Returns `null` for non-raster payloads (including SVG, HTML, XML, JS, or corrupted bytes).
 */
export function detectRasterImageMime(input: Uint8Array): string | null {
  if (input.byteLength < 4)
    return null

  // Reject XML/HTML/SVG text prefixes even if disguised.
  const headSlice = input.subarray(0, Math.min(input.byteLength, 64))
  const headText = new TextDecoder('utf-8', { fatal: false }).decode(headSlice).replace(/^\uFEFF/, '').trimStart().toLowerCase()
  if (
    headText.startsWith('<svg')
    || headText.startsWith('<?xml')
    || headText.startsWith('<!doctype')
    || headText.startsWith('<html')
    || headText.startsWith('<script')
  ) {
    return null
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    input.byteLength >= 8
    && input[0] === 0x89 && input[1] === 0x50 && input[2] === 0x4E && input[3] === 0x47
    && input[4] === 0x0D && input[5] === 0x0A && input[6] === 0x1A && input[7] === 0x0A
  ) {
    return 'image/png'
  }

  // JPEG: FF D8 FF
  if (input[0] === 0xFF && input[1] === 0xD8 && input[2] === 0xFF) {
    return 'image/jpeg'
  }

  // GIF: GIF87a / GIF89a
  if (
    input.byteLength >= 6
    && input[0] === 0x47 && input[1] === 0x49 && input[2] === 0x46 && input[3] === 0x38
    && (input[4] === 0x37 || input[4] === 0x39) && input[5] === 0x61
  ) {
    return 'image/gif'
  }

  // WEBP: RIFF....WEBP
  if (
    input.byteLength >= 12
    && input[0] === 0x52 && input[1] === 0x49 && input[2] === 0x46 && input[3] === 0x46
    && input[8] === 0x57 && input[9] === 0x45 && input[10] === 0x42 && input[11] === 0x50
  ) {
    return 'image/webp'
  }

  // BMP: BM
  if (input[0] === 0x42 && input[1] === 0x4D) {
    return 'image/bmp'
  }

  // ICO / CUR: 00 00 01 00 or 00 00 02 00
  if (input[0] === 0x00 && input[1] === 0x00 && (input[2] === 0x01 || input[2] === 0x02) && input[3] === 0x00) {
    return 'image/x-icon'
  }

  // TIFF: II*\0 or MM\0*
  if (
    (input[0] === 0x49 && input[1] === 0x49 && input[2] === 0x2A && input[3] === 0x00)
    || (input[0] === 0x4D && input[1] === 0x4D && input[2] === 0x00 && input[3] === 0x2A)
  ) {
    return 'image/tiff'
  }

  // ISO BMFF (AVIF / HEIC / HEIF): ....ftyp<brand>
  if (
    input.byteLength >= 12
    && input[4] === 0x66 && input[5] === 0x74 && input[6] === 0x79 && input[7] === 0x70
  ) {
    const brandBytes = input.subarray(8, Math.min(input.byteLength, 32))
    const brands = new TextDecoder('ascii', { fatal: false }).decode(brandBytes).toLowerCase()
    if (brands.includes('avif') || brands.includes('avis'))
      return 'image/avif'
    if (brands.includes('heic') || brands.includes('heix') || brands.includes('hevc') || brands.includes('hevx'))
      return 'image/heic'
    if (brands.includes('mif1') || brands.includes('msf1') || brands.includes('heif'))
      return 'image/heif'
  }

  return null
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

  const resolved = resolveObjectBucketBinding(event, ['IMAGES'])

  if (!hasLoggedImageStorageBinding) {
    console.warn('[imageStorage] 存储绑定检测', {
      usingR2: Boolean(resolved),
      binding: resolved?.bindingName ?? null,
    })
    hasLoggedImageStorageBinding = true
  }

  return resolved?.bucket ?? null
}

/**
 * 验证文件类型和大小
 */
function matchesAllowedMime(type: string, allowedTypes: string[]): boolean {
  const normalized = normalizeMimeType(type)
  if (!normalized)
    return false

  return allowedTypes.some(allowed => normalized === allowed.toLowerCase())
}

function validateRasterImagePayload(
  bytes: Uint8Array,
  extension: string,
  declaredMime: string,
): string {
  const expectedMimes = IMAGE_EXTENSION_TO_MIMES[extension]
  if (!expectedMimes) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid image extension: ${extension}. Allowed: ${IMAGE_ALLOWED_EXTENSIONS.join(', ')}`,
    })
  }
  const normalizedDeclared = normalizeMimeType(declaredMime)
  if (!SAFE_INLINE_IMAGE_TYPES.has(normalizedDeclared) || !expectedMimes.has(normalizedDeclared)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid image MIME type.',
    })
  }
  const detectedMime = detectRasterImageMime(bytes)
  if (!detectedMime || !SAFE_INLINE_IMAGE_TYPES.has(detectedMime) || !expectedMimes.has(detectedMime)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid image content.',
    })
  }
  return detectedMime
}

function validateFile(
  file: File,
  bytes: Uint8Array,
  allowedTypes: string[],
  allowedExtensions: string[],
  requireRasterImage: boolean,
): { extension: string, contentType: string } {
  if (bytes.byteLength === 0 || file.size > MAX_FILE_SIZE || bytes.byteLength > MAX_FILE_SIZE) {
    throw createError({
      statusCode: 400,
      statusMessage: bytes.byteLength === 0 ? 'Empty file is not allowed.' : 'File size exceeds 5MB limit.',
    })
  }

  const normalizedExtensions = allowedExtensions.map(ext => ext.toLowerCase())
  const extension = sanitizeExtension(extractExtensionFromName(file.name))
  const declaredMime = normalizeMimeType(file.type)

  const isMimeAllowed = matchesAllowedMime(declaredMime, allowedTypes)
  const isExtensionAllowed = extension ? normalizedExtensions.includes(extension) : false

  // Both MIME and extension must match the allowlist (previously `||`, which let a `.png`
  // filename smuggle `application/javascript` or `application/pdf`).
  if (!(isMimeAllowed && isExtensionAllowed) || !extension) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid file type.',
    })
  }

  const isImageExt = Object.hasOwn(IMAGE_EXTENSION_TO_MIMES, extension)
  if (requireRasterImage || isImageExt || declaredMime.startsWith('image/')) {
    const canonicalMime = validateRasterImagePayload(bytes, extension, declaredMime)
    return { extension, contentType: canonicalMime }
  }

  return { extension, contentType: declaredMime }
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
  result: Omit<UploadResult, 'url'> & { size: number, contentType: string, uploadRetry?: StorageUploadRetryMetadata },
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
    metadata: {
      ...getUploadLifecycleMetadata(options),
      ...(result.uploadRetry ?? {}),
    },
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
  const requireRasterImage = !options.allowedTypes
  const uploadAttempt = await startImageUploadLifecycle(event, file, options)

  try {
    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    const validated = validateFile(file, bytes, allowedTypes, allowedExtensions, requireRasterImage)

    const ext = sanitizeExtension(MIME_EXTENSION_MAP[validated.contentType]) ?? validated.extension
    const key = `${randomUUID()}.${ext}`
    const storageKey = toPrefixedImageKey(key)
    const bucket = getR2Bucket(event)
    const result = await putStorageObject({
      event,
      bucket,
      memoryStorage,
      key: storageKey,
      data: arrayBuffer,
      contentType: validated.contentType,
      actorId: options.actorId,
      resourceType: options.resourceType ?? 'image',
      defaultContentType: DEFAULT_CONTENT_TYPE,
    })

    await completeImageUploadLifecycle(event, uploadAttempt, { ...result, key }, options)

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
  const validKey = assertValidImageKey(key)
  const bucket = getR2Bucket(event)
  const prefixed = await getStorageObject({
    event,
    bucket,
    memoryStorage,
    key: toPrefixedImageKey(validKey),
    resourceType: 'image',
    defaultContentType: DEFAULT_CONTENT_TYPE,
  })
  if (prefixed) {
    return { data: prefixed.data, contentType: prefixed.contentType }
  }

  // Backward-compatible read for legacy single-segment image keys uploaded before `images/` prefixing.
  const legacy = await getStorageObject({
    event,
    bucket,
    memoryStorage,
    key: validKey,
    resourceType: 'image',
    defaultContentType: DEFAULT_CONTENT_TYPE,
  })
  return legacy
    ? { data: legacy.data, contentType: legacy.contentType }
    : null
}

/**
 * 删除图片
 */
export async function deleteImage(event: H3Event, key: string): Promise<void> {
  const validKey = assertValidImageKey(key)
  const bucket = getR2Bucket(event)
  await deleteStorageObject({
    event,
    bucket,
    memoryStorage,
    key: toPrefixedImageKey(validKey),
    resourceType: 'image',
    defaultContentType: DEFAULT_CONTENT_TYPE,
  })
}

/**
 * 列出所有图片（仅用于管理）
 */
export async function listImages(event: H3Event): Promise<string[]> {
  const bucket = getR2Bucket(event)
  const keys = await listStorageObjectKeys(bucket, memoryStorage, { prefix: IMAGE_STORAGE_PREFIX })
  return keys.map(stripImagePrefix).filter(Boolean)
}

/** Keys per page of `GET /api/images/list?limit=`, when the caller names no limit. */
export const IMAGE_LIST_DEFAULT_LIMIT = 60
/** The largest page `GET /api/images/list?limit=` serves; R2 itself stops at 1000. */
export const IMAGE_LIST_MAX_LIMIT = 200

export interface ImageListPageRequest {
  limit: number
  /** Continuation token from the previous page; `null` for the first page. */
  cursor: string | null
}

export interface ImageListPage {
  keys: string[]
  /** Set while more keys remain; pass it back as `cursor` for the next page. */
  cursor: string | null
  truncated: boolean
}

function firstQueryValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value
}

/**
 * The paging parameters of `GET /api/images/list`, or `null` when the request
 * names neither `limit` nor `cursor` — the original form, which still answers
 * with every key at once. A limit that is not a positive integer falls back to
 * the default, and one above the cap is lowered to it.
 */
export function parseImageListPageQuery(query: Record<string, unknown>): ImageListPageRequest | null {
  const rawLimit = firstQueryValue(query.limit)
  const rawCursor = firstQueryValue(query.cursor)
  if (rawLimit === undefined && rawCursor === undefined)
    return null

  const requested = typeof rawLimit === 'string' && /^\d+$/.test(rawLimit.trim()) ? Number(rawLimit) : Number.NaN
  const limit = Number.isSafeInteger(requested) && requested > 0
    ? Math.min(requested, IMAGE_LIST_MAX_LIMIT)
    : IMAGE_LIST_DEFAULT_LIMIT
  const cursor = typeof rawCursor === 'string' && rawCursor.trim() ? rawCursor.trim() : null
  return { limit, cursor }
}

/**
 * One page of the in-memory store (development without an R2 binding), in the
 * order R2 lists keys — ascending — with the last key of a page as its cursor.
 * Reading "after this key" rather than "from this offset" keeps the next page
 * right when an earlier key is deleted between two requests.
 */
export function pageStorageKeys(keys: readonly string[], request: ImageListPageRequest): ImageListPage {
  const sorted = [...keys].sort()
  const after = request.cursor
  const start = after === null ? 0 : sorted.findIndex(key => key > after)
  const from = start === -1 ? sorted.length : start
  const page = sorted.slice(from, from + request.limit)
  const truncated = from + page.length < sorted.length
  return {
    keys: page,
    cursor: truncated ? page[page.length - 1] ?? null : null,
    truncated,
  }
}

/**
 * One page of the listing `listImages` returns whole: R2's own `limit` / `cursor`,
 * or the in-memory store paged the same way.
 */
export async function listImagesPage(event: H3Event, request: ImageListPageRequest): Promise<ImageListPage> {
  const bucket = getR2Bucket(event)
  if (!bucket) {
    const prefixedKeys = Array.from(memoryStorage.keys())
      .filter(key => key.startsWith(IMAGE_STORAGE_PREFIX))
      .map(stripImagePrefix)
    return pageStorageKeys(prefixedKeys, request)
  }

  const listed = await bucket.list(request.cursor
    ? { prefix: IMAGE_STORAGE_PREFIX, limit: request.limit, cursor: request.cursor }
    : { prefix: IMAGE_STORAGE_PREFIX, limit: request.limit })
  return {
    keys: listed.objects.map(object => stripImagePrefix(object.key)),
    cursor: listed.truncated ? listed.cursor : null,
    truncated: listed.truncated,
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
  options: Pick<UploadOptions, 'actorId' | 'resourceType' | 'uploadLifecycle'> = {},
): Promise<UploadResult> {
  const uploadAttempt = await startImageUploadLifecycle(event, {
    name: fileName,
    size: buffer.length,
    type: mimeType,
  }, options)

  try {
    // Get extension from filename
    // Empty rather than a guessed default, so a name with no extension reports what it is.
    const ext = fileName.includes('.') ? (fileName.split('.').pop()?.toLowerCase() ?? '') : ''

    // Validate extension
    if (!IMAGE_ALLOWED_EXTENSIONS.includes(ext)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid image extension: ${ext}. Allowed: ${IMAGE_ALLOWED_EXTENSIONS.join(', ')}`,
      })
    }

    // Validate size
    if (buffer.length === 0 || buffer.length > MAX_FILE_SIZE) {
      throw createError({
        statusCode: 400,
        statusMessage: buffer.length === 0
          ? 'Empty image buffer is not allowed.'
          : `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      })
    }

    const canonicalMime = validateRasterImagePayload(buffer, ext, mimeType)

    const key = `${randomUUID()}.${ext}`
    const storageKey = toPrefixedImageKey(key)
    const bucket = getR2Bucket(event)
    const result = await putStorageObject({
      event,
      bucket,
      memoryStorage,
      key: storageKey,
      data: buffer,
      contentType: canonicalMime,
      actorId: options.actorId,
      resourceType: options.resourceType ?? 'image',
      defaultContentType: DEFAULT_CONTENT_TYPE,
    })

    await completeImageUploadLifecycle(event, uploadAttempt, { ...result, key }, options)

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
