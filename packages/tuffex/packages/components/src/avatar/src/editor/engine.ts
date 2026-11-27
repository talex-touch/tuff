import { encodeBmp } from './bmp-encoder'
import {
  buildCanvasFilter,
  clampTransform,
  computeContainZoom,
  computeCoverZoom,
  computeTransformMetrics,
  normalizeRotation,
} from './geometry'
import { decodeGif, encodeGif } from './gif-codec'
import { encodeIco, extractBestIcoEntry, parseIcoEntries, resolveIcoSizes } from './ico-codec'
import {
  blobToDataUrl,
  buildOutputFileName,
  detectSupportedAvatarFormats,
  exportAvatarMedia,
  formatByteSize,
  formatMediaTime,
  resetSupportedAvatarFormatsCache,
  triggerAvatarDownload,
} from './media-codecs'
import { detectAvatarSourceKind, loadAvatarMedia } from './media-loader'
import { buildRasterAvatarSvg, buildVectorAvatarSvg, parseAndSanitizeSvg } from './svg-codec'
import {
  AVATAR_EDITOR_DEFAULT_ACCEPT,
  AVATAR_EDITOR_DEFAULT_LABELS,
  AVATAR_EDITOR_IMAGE_ACCEPT,
  AVATAR_EDITOR_VIDEO_ACCEPT,
  AVATAR_FORMAT_META,
  AVATAR_OUTPUT_FORMATS,
  DEFAULT_AVATAR_TRANSFORM,
  DEFAULT_ICO_SIZES,
  DEFAULT_OUTPUT_SIZE_PRESETS,
} from './types'

/**
 * Grouped client-side avatar media codec, geometry, and format-conversion toolkit.
 */
export const avatarMediaEngine = Object.freeze({
  AVATAR_EDITOR_DEFAULT_ACCEPT,
  AVATAR_EDITOR_DEFAULT_LABELS,
  AVATAR_EDITOR_IMAGE_ACCEPT,
  AVATAR_EDITOR_VIDEO_ACCEPT,
  AVATAR_FORMAT_META,
  AVATAR_OUTPUT_FORMATS,
  DEFAULT_AVATAR_TRANSFORM,
  DEFAULT_ICO_SIZES,
  DEFAULT_OUTPUT_SIZE_PRESETS,
  encodeBmp,
  encodeGif,
  decodeGif,
  encodeIco,
  extractBestIcoEntry,
  parseIcoEntries,
  resolveIcoSizes,
  parseAndSanitizeSvg,
  buildVectorAvatarSvg,
  buildRasterAvatarSvg,
  detectAvatarSourceKind,
  loadAvatarMedia,
  detectSupportedAvatarFormats,
  resetSupportedAvatarFormatsCache,
  exportAvatarMedia,
  blobToDataUrl,
  buildOutputFileName,
  formatByteSize,
  formatMediaTime,
  triggerAvatarDownload,
  normalizeRotation,
  computeContainZoom,
  computeCoverZoom,
  computeTransformMetrics,
  clampTransform,
  buildCanvasFilter,
})
