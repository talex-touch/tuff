import type { LensParams } from './params'
import type { LensImage } from './rim'
import { buildLensField, buildLensZoom } from './field'
import { createLensProfile } from './profile'
import { buildLensRim } from './rim'

export interface LensFieldImage {
  /** Displacement field, a data URL for the filter's `feImage`. */
  href: string
  /** `scale` of the feDisplacementMap that reads it, px. */
  displacement: number
}

/**
 * Chromium copies an feImage into every compositor frame that draws the filter, rasterized on the CPU
 * at the size it is drawn, so the field is kept near one map pixel per CSS px and never past this many
 * on its long side: a lens is a rim and a smooth slope, which a map this size carries within a pixel.
 */
const FIELD_MAX_SIDE = 384
const FIELD_MAX_SCALE = 1.5
/** The rim light is an ordinary background painted once, so it can follow the display, within a budget. */
const RIM_MAX_SCALE = 2
const RIM_MAX_PIXELS = 1_500_000
const CACHE_SIZE = 24

function createCache<T>() {
  const entries = new Map<string, T>()
  return {
    get(key: string): T | undefined {
      const hit = entries.get(key)
      if (hit !== undefined) {
        entries.delete(key)
        entries.set(key, hit)
      }
      return hit
    },
    set(key: string, value: T): T {
      entries.set(key, value)
      if (entries.size > CACHE_SIZE) {
        const oldest = entries.keys().next().value
        if (oldest !== undefined)
          entries.delete(oldest)
      }
      return value
    },
  }
}

const fieldCache = createCache<LensFieldImage>()
const zoomCache = createCache<LensFieldImage | null>()
const rimCache = createCache<string>()

export function lensFieldScale(width: number, height: number, devicePixelRatio: number): number {
  const wanted = Math.min(FIELD_MAX_SCALE, Math.max(1, devicePixelRatio))
  return Math.min(wanted, FIELD_MAX_SIDE / Math.max(width, height))
}

export function lensRimScale(width: number, height: number, devicePixelRatio: number): number {
  const wanted = Math.min(RIM_MAX_SCALE, Math.max(1, devicePixelRatio))
  return Math.min(wanted, Math.sqrt(RIM_MAX_PIXELS / (width * height)))
}

/** PNG data URL of an image, or null where there is no 2D canvas to draw it on. */
export function imageToDataUrl(image: LensImage): string | null {
  if (typeof document === 'undefined')
    return null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    if (!context)
      return null
    context.putImageData(new ImageData(image.data, image.width, image.height), 0, 0)
    return canvas.toDataURL('image/png')
  }
  catch {
    return null
  }
}

/**
 * The displacement field for `params`; null when no canvas is available. The same inputs give the
 * same image, so recent ones are kept: a resize back to a size, or twenty identical lenses, draws once.
 */
export function renderLensField(params: LensParams, devicePixelRatio: number): LensFieldImage | null {
  const { shape } = params
  const scale = lensFieldScale(shape.width, shape.height, devicePixelRatio)
  const key = [
    shape.width,
    shape.height,
    shape.radius,
    shape.bezel,
    params.thickness,
    params.ior,
    params.strength,
    params.profile,
    params.rimSaturation > 1 ? 1 : 0,
    scale,
  ].join('|')

  const hit = fieldCache.get(key)
  if (hit)
    return hit

  const profile = createLensProfile({
    bezel: shape.bezel,
    thickness: params.thickness,
    ior: params.ior,
    profile: params.profile,
  })
  const field = buildLensField({
    shape,
    profile,
    strength: params.strength,
    scale,
    rimMask: params.rimSaturation > 1,
  })
  const href = imageToDataUrl(field)
  return href ? fieldCache.set(key, { href, displacement: field.displacement }) : null
}

/**
 * The magnification map for `params`. Null when the lens does not magnify, and also where there is no
 * canvas, which the field has already ruled out by then.
 */
export function renderLensZoom(params: LensParams): LensFieldImage | null {
  const { shape } = params
  const key = [shape.width, shape.height, params.zoom].join('|')

  const hit = zoomCache.get(key)
  if (hit !== undefined)
    return hit

  const zoom = buildLensZoom(shape, params.zoom)
  const href = zoom ? imageToDataUrl(zoom) : null
  return zoomCache.set(key, zoom && href ? { href, displacement: zoom.displacement } : null)
}

/** The rim light for `params` as a PNG data URL, cached like the field; null when no canvas is available. */
export function renderLensRim(params: LensParams, devicePixelRatio: number): string | null {
  const { shape } = params
  const scale = lensRimScale(shape.width, shape.height, devicePixelRatio)
  const key = [shape.width, shape.height, shape.radius, shape.bezel, params.rimLight, scale].join('|')

  const hit = rimCache.get(key)
  if (hit)
    return hit

  const href = imageToDataUrl(buildLensRim(shape, scale, params.rimLight))
  return href ? rimCache.set(key, href) : null
}
