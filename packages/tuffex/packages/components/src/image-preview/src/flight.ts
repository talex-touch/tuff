import type { ImagePreviewOrigin, ImagePreviewOriginRect } from './types'
import type { PreviewBox, PreviewSize, PreviewView } from './zoom'
import { cornerRadius, shownBox } from '../../../../utils/shown-box'

// A picture flying between its thumbnail and the stage, as a photo does in and out of its grid
// cell: one progress moves its centre and scale, uncrops it from the thumbnail's window to the
// whole picture, and straightens its corners. The window is cut in the picture's own pixels, so
// it turns and scales with the picture and never cuts into it mid-flight.

/** Where a picture sits on the page, read off what the host pointed at. */
export interface PreviewOrigin {
  /** In viewport pixels. */
  box: PreviewBox
  /** The part of `box` that shows, when an ancestor clips the rest: a picture zoomed inside its cell, or one half scrolled out of its row. */
  clip?: PreviewBox
  /** The corner radius the picture shows there (px). */
  radius: number
  /** How the picture fills the box: cropped to cover it, or whole inside it. */
  fit: 'cover' | 'contain'
  /** What to hide while the picture flies out of it and back into it. */
  element: HTMLElement | null
  /** The <img> shown there: its pixels stand in until the preview's own copy has loaded. */
  image: HTMLImageElement | null
}

/** A picture as drawn mid-flight, on the stage. */
export interface FlightPose {
  /** Its centre (px). */
  x: number
  y: number
  /** Its scale against its own pixels. */
  k: number
  /** Its turn (degrees). */
  angle: number
  /** The window of it shown, inset from each edge in its own pixels: top, right, bottom, left. */
  crop: readonly [number, number, number, number]
  /** That window's corner radius, on the stage (px). */
  radius: number
}

/** A picture flying between its thumbnail and the stage. */
export interface PreviewFlight {
  index: number
  /** In its thumbnail: where it flies out of, and home to. */
  from: FlightPose
  /**
   * Where it leaves the stage from on the way home. Flying out, it lands on the picture as drawn:
   * its fit, which follows the stage, or where a wheel has zoomed it to mid-air.
   */
  to: FlightPose | null
  /** The size it is drawn at the whole way. */
  size: PreviewSize
}

/**
 * Reads a host's origin: an element, whose own <img> or first <img> inside is the picture, or a
 * box in viewport pixels. `null` for nothing, or for something not laid out.
 */
export function resolveOrigin(origin: ImagePreviewOrigin | null | undefined): PreviewOrigin | null {
  if (!origin)
    return null
  if (typeof Element !== 'undefined' && origin instanceof Element) {
    const image = origin instanceof HTMLImageElement ? origin : origin.querySelector('img')
    const target = image ?? origin
    const rect = target.getBoundingClientRect()
    if (!(rect.width >= 2 && rect.height >= 2))
      return null
    const style = getComputedStyle(target)
    const shown = shownBox(target, rect)
    const box = { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
    const clipped = Math.abs(shown.clip.x - box.x) > 0.5 || Math.abs(shown.clip.y - box.y) > 0.5
      || Math.abs(shown.clip.width - box.width) > 0.5 || Math.abs(shown.clip.height - box.height) > 0.5
    const visible = clipped ? shown.clip : box
    const radius = cornerRadius(style, rect.width) || shown.radius
    const fit = image ? style.objectFit : 'cover'
    return {
      box,
      ...(clipped ? { clip: shown.clip } : {}),
      radius: Math.min(radius, visible.width / 2, visible.height / 2),
      fit: fit === 'contain' || fit === 'scale-down' ? 'contain' : 'cover',
      element: target instanceof HTMLElement ? target : null,
      image,
    }
  }
  const { x, y, width, height, radius = 0 } = origin as ImagePreviewOriginRect
  if (![x, y, width, height].every(Number.isFinite) || !(width >= 2 && height >= 2))
    return null
  return {
    box: { x, y, width, height },
    radius: Math.min(Math.max(0, radius), width / 2, height / 2),
    fit: 'cover',
    element: null,
    image: null,
  }
}

/** Whether enough of the origin shows in `viewport`, and inside whatever clips it, for the picture to fly to it. */
export function isOriginInView(origin: PreviewOrigin, viewport: PreviewSize): boolean {
  const { x, y, width, height } = origin.clip ?? origin.box
  const shownWidth = Math.min(x + width, viewport.width) - Math.max(x, 0)
  const shownHeight = Math.min(y + height, viewport.height) - Math.max(y, 0)
  return shownWidth > 0 && shownHeight > 0 && shownWidth * shownHeight >= 0.3 * origin.box.width * origin.box.height
}

/**
 * The picture as its thumbnail shows it, in `box` on the stage: covering it, cropped about its
 * centre, or whole inside it; cut down further to `clip` where an ancestor clips it.
 */
export function originPose(size: PreviewSize, origin: Pick<PreviewOrigin, 'box' | 'clip' | 'radius' | 'fit'>): FlightPose {
  const { box } = origin
  const cover = origin.fit === 'cover'
  const k = cover
    ? Math.max(box.width / size.width, box.height / size.height)
    : Math.min(box.width / size.width, box.height / size.height)
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const drawn = { left: x - (size.width * k) / 2, top: y - (size.height * k) / 2, right: x + (size.width * k) / 2, bottom: y + (size.height * k) / 2 }
  // What shows of it: the picture as drawn, inside its box, inside whatever clips the box.
  const clip = origin.clip ?? box
  const left = Math.max(drawn.left, box.x, clip.x)
  const top = Math.max(drawn.top, box.y, clip.y)
  const right = Math.min(drawn.right, box.x + box.width, clip.x + clip.width)
  const bottom = Math.min(drawn.bottom, box.y + box.height, clip.y + clip.height)
  return {
    x,
    y,
    k,
    angle: 0,
    crop: [
      Math.max(0, (top - drawn.top) / k),
      Math.max(0, (drawn.right - right) / k),
      Math.max(0, (drawn.bottom - bottom) / k),
      Math.max(0, (left - drawn.left) / k),
    ],
    // A whole picture inside a larger box shows none of the box's corners.
    radius: cover ? origin.radius : 0,
  }
}

/** Where its slide puts a picture: shifted by `x` and `y`, and scaled by `scale` about the stage's centre. */
export interface SlideShift {
  x: number
  y: number
  scale: number
}

const NO_SHIFT: SlideShift = { x: 0, y: 0, scale: 1 }

/**
 * A picture drawn at `view`, whole and turned by `angle`. `oriented` is its size as turned, which
 * the view frames; `slide` is where its slide has carried it.
 */
export function viewPose(view: PreviewView, oriented: PreviewSize, angle: number, stage: PreviewSize, slide: SlideShift = NO_SHIFT): FlightPose {
  const cx = view.tx + (view.k * oriented.width) / 2
  const cy = view.ty + (view.k * oriented.height) / 2
  const sx = stage.width / 2
  const sy = stage.height / 2
  return {
    x: sx + slide.x + slide.scale * (cx - sx),
    y: sy + slide.y + slide.scale * (cy - sy),
    k: view.k * slide.scale,
    angle,
    crop: [0, 0, 0, 0],
    radius: 0,
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * `from` at 0, `to` at 1; past either end it carries on, as a spring's overshoot does, except
 * that the window never reaches past the picture's edges.
 */
export function lerpPose(from: FlightPose, to: FlightPose, t: number): FlightPose {
  const crop = (i: 0 | 1 | 2 | 3): number => Math.max(0, lerp(from.crop[i], to.crop[i], t))
  return {
    x: lerp(from.x, to.x, t),
    y: lerp(from.y, to.y, t),
    k: Math.max(1e-4, lerp(from.k, to.k, t)),
    angle: lerp(from.angle, to.angle, t),
    crop: [crop(0), crop(1), crop(2), crop(3)],
    radius: Math.max(0, lerp(from.radius, to.radius, t)),
  }
}

/** The turn nearest `angle` that shows a picture upright: a picture flying home straightens the short way. */
export function uprightAngle(angle: number): number {
  return Math.round(angle / 360) * 360
}

export interface PoseStyles {
  frame: Record<string, string>
  image: Record<string, string>
}

/**
 * The window element's and the picture's styles for a pose of a picture `size` in its own pixels:
 * the window is cut out of the picture and carries the transform, the picture sits inside it.
 */
export function poseStyles(pose: FlightPose, size: PreviewSize): PoseStyles {
  const [top, right, bottom, left] = pose.crop
  const width = Math.max(0, size.width - left - right)
  const height = Math.max(0, size.height - top - bottom)
  const turn = pose.angle ? ` rotate(${pose.angle}deg)` : ''
  const frame: Record<string, string> = {
    width: `${width}px`,
    height: `${height}px`,
    transform: `translate3d(${pose.x}px, ${pose.y}px, 0)${turn} scale(${pose.k}) translate(${left - size.width / 2}px, ${top - size.height / 2}px)`,
  }
  if (pose.radius > 0)
    frame.borderRadius = `${pose.radius / pose.k}px`
  const image: Record<string, string> = {
    width: `${size.width}px`,
    height: `${size.height}px`,
  }
  if (top || left)
    image.transform = `translate3d(${-left}px, ${-top}px, 0)`
  return { frame, image }
}
