export type ThumbnailMediaKind = 'image' | 'video'

export const IMAGE_THUMBNAIL_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'webp',
  'heic',
  'heif',
  'tiff',
  'tif'
])

export const VIDEO_THUMBNAIL_EXTENSIONS = new Set([
  'mp4',
  'mov',
  'm4v',
  'webm',
  'mkv',
  'avi',
  'wmv',
  'flv'
])

export const THUMBNAIL_EXTENSIONS = new Set([
  ...IMAGE_THUMBNAIL_EXTENSIONS,
  ...VIDEO_THUMBNAIL_EXTENSIONS
])

export const IMAGE_THUMBNAIL_MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
export const VIDEO_THUMBNAIL_MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024 // 2GB

export function normalizeExtension(value: string | null | undefined): string {
  return (value || '').replace(/^\./, '').toLowerCase()
}

export function getThumbnailMediaKind(
  extension: string | null | undefined
): ThumbnailMediaKind | null {
  const normalized = normalizeExtension(extension)
  if (IMAGE_THUMBNAIL_EXTENSIONS.has(normalized)) return 'image'
  if (VIDEO_THUMBNAIL_EXTENSIONS.has(normalized)) return 'video'
  return null
}

export function getThumbnailMaxFileSize(extension: string | null | undefined): number | null {
  const kind = getThumbnailMediaKind(extension)
  if (kind === 'image') return IMAGE_THUMBNAIL_MAX_FILE_SIZE
  if (kind === 'video') return VIDEO_THUMBNAIL_MAX_FILE_SIZE
  return null
}

export function isThumbnailCandidate(
  extension: string | null | undefined,
  size?: number | null
): boolean {
  const maxSize = getThumbnailMaxFileSize(extension)
  if (!maxSize) return false
  if (typeof size !== 'number') return true
  return size > 0 && size <= maxSize
}

export function getThumbnailUnsupportedReason(
  extension: string | null | undefined,
  size?: number | null
): string | null {
  const kind = getThumbnailMediaKind(extension)
  if (!kind) return 'unsupported-thumbnail-type'
  const maxSize = getThumbnailMaxFileSize(extension)
  if (typeof size === 'number' && (!Number.isFinite(size) || size <= 0)) {
    return 'invalid-file-size'
  }
  if (typeof size === 'number' && maxSize && size > maxSize) {
    return 'file-too-large'
  }
  return null
}
