import type { BaseSurfaceMode } from '../../../base-surface/src/types'
import type { AvatarShape } from '../types'

export type AvatarOutputFormat = 'png' | 'jpeg' | 'webp' | 'avif' | 'ico' | 'svg' | 'gif' | 'bmp'

export type AvatarSourceKind = 'image' | 'svg' | 'gif' | 'video' | 'ico'

export type AvatarCaptureMode = 'frame' | 'gif-clip'

export type AvatarEditTrigger = 'editor' | 'upload'

export interface AvatarFormatMeta {
  format: AvatarOutputFormat
  label: string
  mimeType: string
  extension: string
  lossy: boolean
  supportsAlpha: boolean
  supportsAnimation: boolean
}

export const AVATAR_OUTPUT_FORMATS: readonly AvatarOutputFormat[] = [
  'png',
  'jpeg',
  'webp',
  'avif',
  'ico',
  'svg',
  'gif',
  'bmp',
] as const

export const AVATAR_FORMAT_META: Record<AvatarOutputFormat, AvatarFormatMeta> = {
  png: {
    format: 'png',
    label: 'PNG',
    mimeType: 'image/png',
    extension: 'png',
    lossy: false,
    supportsAlpha: true,
    supportsAnimation: false,
  },
  jpeg: {
    format: 'jpeg',
    label: 'JPEG',
    mimeType: 'image/jpeg',
    extension: 'jpg',
    lossy: true,
    supportsAlpha: false,
    supportsAnimation: false,
  },
  webp: {
    format: 'webp',
    label: 'WebP',
    mimeType: 'image/webp',
    extension: 'webp',
    lossy: true,
    supportsAlpha: true,
    supportsAnimation: false,
  },
  avif: {
    format: 'avif',
    label: 'AVIF',
    mimeType: 'image/avif',
    extension: 'avif',
    lossy: true,
    supportsAlpha: true,
    supportsAnimation: false,
  },
  ico: {
    format: 'ico',
    label: 'ICO',
    mimeType: 'image/x-icon',
    extension: 'ico',
    lossy: false,
    supportsAlpha: true,
    supportsAnimation: false,
  },
  svg: {
    format: 'svg',
    label: 'SVG',
    mimeType: 'image/svg+xml',
    extension: 'svg',
    lossy: false,
    supportsAlpha: true,
    supportsAnimation: false,
  },
  gif: {
    format: 'gif',
    label: 'GIF',
    mimeType: 'image/gif',
    extension: 'gif',
    lossy: false,
    supportsAlpha: true,
    supportsAnimation: true,
  },
  bmp: {
    format: 'bmp',
    label: 'BMP',
    mimeType: 'image/bmp',
    extension: 'bmp',
    lossy: false,
    supportsAlpha: false,
    supportsAnimation: false,
  },
}

export const AVATAR_EDITOR_IMAGE_ACCEPT
  = 'image/png,image/jpeg,image/webp,image/avif,image/gif,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,image/bmp,.png,.jpg,.jpeg,.webp,.avif,.gif,.svg,.ico,.bmp'

export const AVATAR_EDITOR_VIDEO_ACCEPT
  = 'video/mp4,video/webm,video/quicktime,video/ogg,.mp4,.webm,.mov,.m4v,.ogv'

export const AVATAR_EDITOR_DEFAULT_ACCEPT = `${AVATAR_EDITOR_IMAGE_ACCEPT},${AVATAR_EDITOR_VIDEO_ACCEPT}`

export const DEFAULT_ICO_SIZES: readonly number[] = [16, 32, 48, 64, 128, 256]

export const DEFAULT_OUTPUT_SIZE_PRESETS: readonly number[] = [128, 256, 512, 1024]

export interface AvatarEditorTransform {
  /** Scale multiplier relative to cover-fit (`1` fills the crop square; `< 1` leaves margin). */
  zoom: number
  /** Horizontal pan offset normalized to crop viewport size (`0` is centered). */
  offsetX: number
  /** Vertical pan offset normalized to crop viewport size (`0` is centered). */
  offsetY: number
  /** Rotation in degrees (`-180` to `180`). */
  rotation: number
  /** Horizontal mirror. */
  flipX: boolean
  /** Vertical mirror. */
  flipY: boolean
  /** Brightness percentage (`50` to `150`, default `100`). */
  brightness: number
  /** Contrast percentage (`50` to `150`, default `100`). */
  contrast: number
  /** Saturation percentage (`0` to `200`, default `100`). */
  saturation: number
  /** Background matte color (`'transparent'` or CSS hex color). */
  background: string
  /** Bake the selected `shape` mask into alpha-capable outputs. */
  maskClip: boolean
}

export const DEFAULT_AVATAR_TRANSFORM: Readonly<AvatarEditorTransform> = Object.freeze({
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  flipX: false,
  flipY: false,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  background: 'transparent',
  maskClip: false,
})

export interface AvatarGifClipOptions {
  /** Clip start timestamp in seconds. */
  startTime: number
  /** Clip end timestamp in seconds. */
  endTime: number
  /** Output frames per second (`4` to `20`). */
  fps: number
  /** Pixel dimension of the animated GIF (kept compact for fast client encoding). */
  size: number
}

export interface AvatarEditorConverterContext {
  canvas: HTMLCanvasElement
  format: AvatarOutputFormat
  quality: number
  size: number
  shape: AvatarShape
  transform: AvatarEditorTransform
  sourceKind: AvatarSourceKind
  originalFile: File | null
  svgSource?: string
}

export type AvatarEditorCustomConverter = (
  ctx: AvatarEditorConverterContext,
) => Promise<Blob | null | undefined>

export interface AvatarEditResult {
  file: File
  blob: Blob
  /** Preview URL (`data:` URL by default so it stays valid after the editor closes). */
  url: string
  dataUrl: string
  format: AvatarOutputFormat
  mimeType: string
  width: number
  height: number
  size: number
  animated: boolean
  frameCount?: number
  frameTime?: number
  sourceKind: AvatarSourceKind
  originalFile: File | null
  shape: AvatarShape
  transform: AvatarEditorTransform
}

export interface AvatarEditorLabels {
  title: string
  close: string
  uploadDropText: string
  uploadHintText: string
  uploadButtonText: string
  uploadFormatsHint: string
  replaceFile: string
  rotateLeft: string
  rotateRight: string
  flipHorizontal: string
  flipVertical: string
  fitContain: string
  fitCover: string
  reset: string
  zoom: string
  rotation: string
  shape: string
  shapeCircle: string
  shapeRounded: string
  shapeSquare: string
  maskClip: string
  adjustments: string
  brightness: string
  contrast: string
  saturation: string
  background: string
  transparent: string
  outputSection: string
  format: string
  outputSize: string
  quality: string
  preview: string
  timeline: string
  play: string
  pause: string
  prevFrame: string
  nextFrame: string
  captureFrame: string
  captureGifClip: string
  clipStart: string
  clipEnd: string
  clipFps: string
  clipSummary: string
  download: string
  cancel: string
  apply: string
  exporting: string
  loading: string
  unsupportedFormat: string
  corsTaintedError: string
  loadFailedError: string
  videoUnsupportedError: string
  pasteHint: string
}

export const AVATAR_EDITOR_DEFAULT_LABELS: Readonly<AvatarEditorLabels> = Object.freeze({
  title: 'Edit avatar',
  close: 'Close',
  uploadDropText: 'Drop image, GIF, SVG, ICO or video here',
  uploadHintText: 'Click to browse or paste from clipboard',
  uploadButtonText: 'Choose file',
  uploadFormatsHint: 'Supports PNG, JPEG, WebP, AVIF, ICO, SVG, GIF, BMP, MP4 & WebM',
  replaceFile: 'Replace',
  rotateLeft: 'Rotate 90° left',
  rotateRight: 'Rotate 90° right',
  flipHorizontal: 'Flip horizontal',
  flipVertical: 'Flip vertical',
  fitContain: 'Fit',
  fitCover: 'Fill',
  reset: 'Reset',
  zoom: 'Zoom',
  rotation: 'Angle',
  shape: 'Mask',
  shapeCircle: 'Circle',
  shapeRounded: 'Rounded',
  shapeSquare: 'Square',
  maskClip: 'Bake mask into alpha',
  adjustments: 'Adjustments',
  brightness: 'Brightness',
  contrast: 'Contrast',
  saturation: 'Saturation',
  background: 'Background',
  transparent: 'Transparent',
  outputSection: 'Export & Convert',
  format: 'Format',
  outputSize: 'Size',
  quality: 'Quality',
  preview: 'Live preview',
  timeline: 'Frame & clip',
  play: 'Play',
  pause: 'Pause',
  prevFrame: 'Previous frame',
  nextFrame: 'Next frame',
  captureFrame: 'Still frame',
  captureGifClip: 'Animated GIF',
  clipStart: 'Start',
  clipEnd: 'End',
  clipFps: 'FPS',
  clipSummary: 'Clip',
  download: 'Download',
  cancel: 'Cancel',
  apply: 'Apply',
  exporting: 'Exporting...',
  loading: 'Loading media...',
  unsupportedFormat: 'Not supported by this browser',
  corsTaintedError: 'This remote image blocks cross-origin export. Upload a local file instead.',
  loadFailedError: 'Could not decode this file in the current browser.',
  videoUnsupportedError: 'This video codec is not playable in the current browser.',
  pasteHint: 'Tip: Ctrl/⌘+V to paste an image',
})

export interface AvatarEditorConfig {
  accept?: string
  outputFormat?: AvatarOutputFormat
  allowedOutputFormats?: AvatarOutputFormat[]
  allowFormatConversion?: boolean
  outputSize?: number
  outputSizePresets?: number[]
  outputQuality?: number
  minZoom?: number
  maxZoom?: number
  allowVideoCapture?: boolean
  allowGifAnimation?: boolean
  maxGifDuration?: number
  maxGifFrames?: number
  icoSizes?: number[]
  allowDownload?: boolean
  allowAdjustments?: boolean
  surface?: BaseSurfaceMode
  fileName?: string
  labels?: Partial<AvatarEditorLabels>
  customConverter?: AvatarEditorCustomConverter
  beforeConfirm?: (result: AvatarEditResult) => boolean | void | Promise<boolean | void>
}

export interface AvatarEditorProps extends AvatarEditorConfig {
  open: boolean
  /** Initial image/SVG/GIF/ICO/video source: File, Blob, or URL string. */
  source?: File | Blob | string | null
  /** Initial crop mask shape; mirrors TxAvatar `shape`. */
  shape?: AvatarShape
  /** Modal width CSS length. @default 'min(94vw, 800px)' */
  width?: string
}

export interface AvatarEditorEmits {
  'update:open': [value: boolean]
  'confirm': [result: AvatarEditResult]
  'cancel': []
  'error': [error: Error]
  'source-change': [payload: { kind: AvatarSourceKind, file: File | null, width: number, height: number }]
}
