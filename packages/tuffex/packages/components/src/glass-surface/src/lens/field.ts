import type { EdgeProbe, LensShape } from './geometry'
import type { LensImage } from './rim'
import type { LensProfile } from './profile'
import { probeRoundedRect } from './geometry'
import { lensShiftAt } from './profile'
import { rimAlpha } from './rim'

export interface LensFieldOptions {
  shape: LensShape
  profile: LensProfile
  /** Multiplies the bezel's carry. */
  strength: number
  /** Map pixels per CSS px. */
  scale: number
  /** Lets the blue channel carry the rim light, for the vivid rim; off leaves it empty. */
  rimMask: boolean
}

export interface LensField extends LensImage {
  /** The `scale` of the feDisplacementMap that reads this map, px. */
  displacement: number
}

/** Brightens the rim mask the way the highlight is boosted before it is used as a filter mask. */
const RIM_MASK_GAIN = 1.8

function encode(value: number): number {
  return Math.round(127.5 + value * 127.5)
}

/**
 * The displacement field of the rim as an image: red and green carry how far, and which way, to look
 * for the pixel that belongs at each point, blue the rim light, alpha is opaque. Content at the rim
 * comes from deeper in, since a dome bends rays towards its middle; the face is left neutral.
 *
 * Magnification is a separate pass (see `buildLensZoom`): added to this field, a gentle slope would
 * share its 8 bits with the rim's peak of several tens of px and come out in half-pixel terraces.
 */
export function buildLensField(options: LensFieldOptions): LensField {
  const { shape, profile, scale } = options
  const peak = profile.maximum * options.strength

  const width = Math.max(1, Math.round(shape.width * scale))
  const height = Math.max(1, Math.round(shape.height * scale))
  const data = new Uint8ClampedArray(width * height * 4)
  data.fill(255)
  const stepX = shape.width / width
  const stepY = shape.height / height
  const probe: EdgeProbe = { inside: 0, nx: 0, ny: 0 }
  const spread = Math.max(1, 1 / scale)
  const bezel = shape.bezel
  const marginX = Math.ceil(bezel / stepX) + 1
  const marginY = Math.ceil(bezel / stepY) + 1
  const neutral = encode(0)

  for (let iy = 0; iy < height; iy++) {
    const y = (iy + 0.5) * stepY
    const edgeRow = iy < marginY || iy >= height - marginY
    for (let ix = 0; ix < width; ix++) {
      const x = (ix + 0.5) * stepX
      let red = neutral
      let green = neutral
      let blue = 0

      if (edgeRow || ix < marginX || ix >= width - marginX) {
        probeRoundedRect(x, y, shape, probe)
        if (probe.inside >= 0) {
          if (peak > 0) {
            const shift = lensShiftAt(profile, probe.inside, bezel) * options.strength
            red = encode(-probe.nx * shift / peak)
            green = encode(-probe.ny * shift / peak)
          }
          if (options.rimMask)
            blue = Math.round(Math.min(1, rimAlpha(probe.inside, probe.nx, probe.ny, bezel, spread) * RIM_MASK_GAIN) * 255)
        }
      }

      const o = (iy * width + ix) * 4
      data[o] = red
      data[o + 1] = green
      data[o + 2] = blue
    }
  }
  return { width, height, data, displacement: peak * 2 }
}

/** Samples of the zoom ramp per CSS px; it is a straight slope, which the browser fills in smoothly between them. */
const ZOOM_SAMPLE_PX = 6

/**
 * The magnification of the face as its own, small displacement map: every point looks `1 - 1/zoom` of
 * its distance from the middle towards it, which is a straight ramp. Kept apart from the rim field so
 * that the ramp has the whole 8 bits to itself and the face stays smooth. Null when there is no zoom.
 */
export function buildLensZoom(shape: LensShape, zoom: number): LensField | null {
  const pull = 1 - 1 / Math.max(1, zoom)
  if (pull < 0.0005)
    return null

  const peak = Math.max(shape.width, shape.height) / 2 * pull
  const width = Math.min(64, Math.max(4, Math.ceil(shape.width / ZOOM_SAMPLE_PX)))
  const height = Math.min(64, Math.max(4, Math.ceil(shape.height / ZOOM_SAMPLE_PX)))
  const data = new Uint8ClampedArray(width * height * 4)
  data.fill(255)

  for (let iy = 0; iy < height; iy++) {
    const py = (iy + 0.5) * shape.height / height - shape.height / 2
    for (let ix = 0; ix < width; ix++) {
      const px = (ix + 0.5) * shape.width / width - shape.width / 2
      const o = (iy * width + ix) * 4
      data[o] = encode(-px * pull / peak)
      data[o + 1] = encode(-py * pull / peak)
      data[o + 2] = 0
    }
  }
  return { width, height, data, displacement: peak * 2 }
}
