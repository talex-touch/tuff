export const THUMBNAIL_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'])
export const THUMBNAIL_MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
export const THUMBNAIL_SIZE = 64
export const THUMBNAIL_JPEG_QUALITY = 50

const PHOTOS_LIBRARY_MARKER = 'Photos Library.photoslibrary'

export function normalizeExtension(value: string | null | undefined): string {
  return (value || '').replace(/^\./, '').toLowerCase()
}

export function isPhotosLibraryPath(filePath: string): boolean {
  return filePath.includes(PHOTOS_LIBRARY_MARKER)
}

export function isThumbnailCandidate(
  extension: string | null | undefined,
  size?: number | null
): boolean {
  const normalized = normalizeExtension(extension)
  if (!normalized || !THUMBNAIL_EXTENSIONS.has(normalized)) return false
  if (typeof size !== 'number') return true
  return size > 0 && size <= THUMBNAIL_MAX_FILE_SIZE
}
