import type { BaseSurfaceMode } from '../../base-surface/src/types'

export interface ImagePreviewItem {
  url: string
  /** Shown in the top bar, and the picture's alt text when `alt` is absent. */
  name?: string
  alt?: string
  /**
   * The picture's own size, when known before it loads: the placeholder takes its shape, so
   * nothing moves when it arrives.
   */
  width?: number
  height?: number
  /** A smaller copy, for the strip of thumbnails along the bottom. */
  thumbnail?: string
}

/** A URL, or an item with a name and a size. */
export type ImagePreviewSource = string | ImagePreviewItem

/** A box in viewport pixels, with the corner radius the picture shows there. */
export interface ImagePreviewOriginRect {
  x: number
  y: number
  width: number
  height: number
  radius?: number
}

/**
 * Where a picture sits on the page: the element showing it, which is hidden while the picture
 * flies out of it and back into it, or a box. An element's own <img>, or the first one inside it,
 * is the picture: its box, corners and `object-fit` are read, and what its ancestors clip off it,
 * as a cell does a picture zoomed on hover; its pixels stand in while the preview's own copy loads.
 */
export type ImagePreviewOrigin = Element | ImagePreviewOriginRect

/** How the preview opens and closes: out of the picture's place and back into it, or a fade. */
export type ImagePreviewTransition = 'zoom' | 'fade'

/** What the toolbar and the menu offer for the current picture. */
export type ImagePreviewAction = 'rotate' | 'copy' | 'share' | 'download'

/** The strip along the bottom: the pictures' thumbnails, a dot for each, or nothing. */
export type ImagePreviewIndicator = 'thumbnails' | 'dots' | 'none'

export interface ImagePreviewActionEvent {
  action: ImagePreviewAction
  index: number
  item: ImagePreviewItem
  /** Skips the preview's own handling: the host copies, shares or saves the picture itself. */
  preventDefault: () => void
  readonly defaultPrevented: boolean
}

export interface ImagePreviewProps {
  images?: readonly ImagePreviewSource[]
  /** The largest zoom, against a picture's own pixels, so 1 is 100%; never less than the whole picture's fit. @default 4 */
  maxScale?: number
  /** URLs the host has already seen fail, a thumbnail's say: drawn as the placeholder, not requested again. */
  failed?: ReadonlySet<string> | readonly string[]
  /**
   * Where picture `index` sits on the page, so the preview grows out of it and shrinks back into
   * it. Asked on opening, and again on closing for the picture shown then.
   */
  origin?: (index: number) => ImagePreviewOrigin | null | undefined
  /**
   * How the preview opens and closes. `zoom` needs an `origin` in view and pixels to fly: the
   * picture itself, cached or loaded within a moment, or the origin's own <img>. Otherwise, and
   * with reduced motion, it fades. @default 'zoom'
   */
  transition?: ImagePreviewTransition
  /** In the toolbar and the menu, in this order. Share shows only where the browser can share. @default ['rotate', 'copy', 'share', 'download'] */
  actions?: readonly ImagePreviewAction[]
  /** A long press on the picture, a right-click or the context-menu key opens a menu of the actions. @default true */
  contextMenu?: boolean
  /** The strip along the bottom. @default 'thumbnails' */
  indicator?: ImagePreviewIndicator
  /** While a picture is zoomed in, the whole of it in the bottom-right corner, the part on screen framed; a press or a drag on it moves there. @default true */
  minimap?: boolean
  /** How far a page turn and the flight out of `origin` overshoot before they settle, 0 to 1. @default 0.2 */
  bounce?: number
  /** The material behind the picture. @default 'refraction' */
  maskSurface?: BaseSurfaceMode
  /** The colour of that material. @default 'rgb(10, 10, 12)' */
  maskColor?: string
  /** The opacity of that colour, 0 to 1. @default 0.35 */
  maskOpacity?: number
  /** How far that material blurs the page behind it (px). @default 12 */
  maskBlur?: number
  /** The material of the buttons, the toolbar and the menu. @default 'blur' */
  controlSurface?: BaseSurfaceMode
  /** The colour of that material. @default 'rgb(64, 64, 70)' */
  controlColor?: string
  /** The opacity of that colour, 0 to 1. @default 0.6 */
  controlOpacity?: number
  /** How far that material blurs what is behind it (px). @default 16 */
  controlBlur?: number
  /** The dialog's accessible name, joined to the picture's name by `labelFormatter`. @default 'Image preview' */
  label?: string
  /** @default 'Close' */
  closeLabel?: string
  /** @default 'Previous image' */
  previousLabel?: string
  /** @default 'Next image' */
  nextLabel?: string
  /** @default 'Zoom in' */
  zoomInLabel?: string
  /** @default 'Zoom out' */
  zoomOutLabel?: string
  /**
   * The accessible name of the menu the zoom readout opens: the whole picture, then those of 25%,
   * 50%, 100% and its doublings that lie past it, up to `maxScale`. The readout's name too, joined
   * after the readout by `readoutLabelFormatter`. @default 'Zoom'
   */
  zoomLabel?: string
  /** The first item of the zoom readout's menu, which shows the whole picture again. @default 'Fit to screen' */
  resetLabel?: string
  /** Turns the picture a quarter clockwise; Shift + R turns it back. @default 'Rotate' */
  rotateLabel?: string
  /** @default 'Copy image' */
  copyLabel?: string
  /** @default 'Share' */
  shareLabel?: string
  /** @default 'Download' */
  downloadLabel?: string
  /** The menu's accessible name. @default 'Image actions' */
  menuLabel?: string
  /** The strip's accessible name. @default 'Images' */
  indicatorLabel?: string
  /** Said once the picture is on the clipboard. @default 'Image copied' */
  copiedText?: string
  /** Said when only the picture's link could go on the clipboard: a picture from another site that does not hand over its pixels. @default 'Link copied' */
  linkCopiedText?: string
  /** @default 'Could not copy the image' */
  copyFailedText?: string
  /** In place of a picture that failed to load. @default 'This image could not be loaded' */
  failedText?: string
  /** @default (current, total) => `${current} / ${total}` */
  counterFormatter?: (current: number, total: number) => string
  /** The zoom readout and the scales in its menu, from a scale against the picture's own pixels. @default (scale) => `${Math.round(scale * 100)}%` */
  scaleFormatter?: (scale: number) => string
  /** The accessible name of a thumbnail or a dot in the strip. @default (current, total, name) => name ? `${name}, ${current} of ${total}` : `Image ${current} of ${total}` */
  indicatorItemFormatter?: (current: number, total: number, name?: string) => string
  /** The dialog's accessible name while the picture shown has a `name`. @default (label, name) => `${label}: ${name}` */
  labelFormatter?: (label: string, name: string) => string
  /** The zoom readout's accessible name, from the readout and `zoomLabel`. @default (readout, label) => `${readout}, ${label}` */
  readoutLabelFormatter?: (readout: string, label: string) => string
}

export interface ImagePreviewEmits {
  /** The person closed the preview: the close button, Escape, the backdrop, or a drag away. */
  (event: 'close'): void
  /** A picture failed to load. */
  (event: 'error', url: string, index: number): void
  /** An action was chosen, before the preview carries it out; `preventDefault()` carries it out yourself. */
  (event: 'action', payload: ImagePreviewActionEvent): void
}
