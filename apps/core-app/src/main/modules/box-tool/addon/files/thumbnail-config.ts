export {
  getThumbnailMaxFileSize,
  getThumbnailMediaKind,
  getThumbnailUnsupportedReason,
  IMAGE_THUMBNAIL_EXTENSIONS,
  IMAGE_THUMBNAIL_MAX_FILE_SIZE,
  isThumbnailCandidate,
  normalizeExtension,
  THUMBNAIL_EXTENSIONS,
  VIDEO_THUMBNAIL_EXTENSIONS,
  VIDEO_THUMBNAIL_MAX_FILE_SIZE,
  type ThumbnailMediaKind
} from '../../../../shared/thumbnail-policy'

export const THUMBNAIL_SIZE = 64
/** Video frames are opaque; JPEG keeps them small. Images are written losslessly with alpha. */
export const THUMBNAIL_JPEG_QUALITY = 50

/**
 * Bump when the bytes a thumbnail contains stop describing the same picture.
 *
 * Stored thumbnails are recognized as fresh by mtime/size of the source, so changing the encoder
 * alone would leave every existing thumbnail in place forever — including the opaque-silhouette
 * JPEGs that this version replaces. The version is written into each `thumbnailStatus` value and
 * compared when deciding whether a stored thumbnail may be kept.
 */
export const THUMBNAIL_ENCODER_VERSION = 2

/** Extension key holding a row's thumbnail status payload. */
export const THUMBNAIL_STATUS_EXTENSION_KEY = 'thumbnailStatus'

/**
 * Whether a stored `thumbnailStatus` payload was written by the current encoder.
 *
 * A stored thumbnail is a slice of pixels, not a description: when the encoder changes what those
 * bytes mean, every older value has to be treated as absent. Absent, unparsable, or older values
 * are all simply not current, so callers get one answer instead of three cases.
 */
export function isThumbnailStatusCurrentVersion(value: string | undefined): boolean {
  if (!value) return false
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || !('v' in parsed)) return false
    return parsed.v === THUMBNAIL_ENCODER_VERSION
  } catch {
    return false
  }
}

const PHOTOS_LIBRARY_MARKER = 'Photos Library.photoslibrary'

export function isPhotosLibraryPath(filePath: string): boolean {
  return filePath.includes(PHOTOS_LIBRARY_MARKER)
}
