import type { EdgeProbe, LensShape } from './geometry'
import { probeRoundedRect } from './geometry'

export interface LensImage {
  width: number
  height: number
  /** Straight (not premultiplied) RGBA, ready for `ImageData`. */
  data: Uint8ClampedArray<ArrayBuffer>
}

/**
 * How bright the edge catches the light, 0 to 1. Light comes from the top left: the rim facing it
 * glints, the rim facing away shows a faint reflection, the sides keep a hairline. `inside` is the
 * distance in from the outline in px; `spread` widens the hairline for maps drawn below 1 px per px.
 */
export function rimAlpha(inside: number, nx: number, ny: number, bezel: number, spread = 1): number {
  const light = -(nx + ny) * Math.SQRT1_2
  const glint = Math.max(light, 0) ** 3
  const reflected = Math.max(-light, 0) ** 3
  const edge = Math.exp(-(((inside - 0.4 * spread) / (0.38 * spread)) ** 2))
  const bloom = bezel > 0 ? Math.exp(-((inside / (bezel * 0.22)) ** 2)) : 0
  return edge * (0.045 + 0.52 * glint + 0.2 * reflected) + bloom * 0.02 * glint
}

/** Farthest in from the outline, px, that the rim still paints anything visible. */
export function rimReach(bezel: number): number {
  return Math.max(2, bezel * 0.7)
}

/**
 * The rim light as a white image whose alpha is the highlight, drawn at `scale` map pixels per CSS px.
 * Only the strip along the outline is evaluated; the rest stays transparent.
 */
export function buildLensRim(shape: LensShape, scale: number, intensity: number): LensImage {
  const width = Math.max(1, Math.round(shape.width * scale))
  const height = Math.max(1, Math.round(shape.height * scale))
  const data = new Uint8ClampedArray(width * height * 4)
  const stepX = shape.width / width
  const stepY = shape.height / height
  const reach = rimReach(shape.bezel)
  const marginX = Math.ceil(reach / stepX) + 1
  const marginY = Math.ceil(reach / stepY) + 1
  const probe: EdgeProbe = { inside: 0, nx: 0, ny: 0 }

  for (let iy = 0; iy < height; iy++) {
    const edgeRow = iy < marginY || iy >= height - marginY
    for (let ix = 0; ix < width; ix++) {
      if (!edgeRow && ix >= marginX && ix < width - marginX) {
        // Interior: skip to the far margin instead of probing every pixel in between.
        ix = Math.max(ix, width - marginX) - 1
        continue
      }
      probeRoundedRect((ix + 0.5) * stepX, (iy + 0.5) * stepY, shape, probe)
      if (probe.inside < 0 || probe.inside > reach)
        continue
      const alpha = rimAlpha(probe.inside, probe.nx, probe.ny, shape.bezel) * intensity
      if (alpha <= 0)
        continue
      const o = (iy * width + ix) * 4
      data[o] = 255
      data[o + 1] = 255
      data[o + 2] = 255
      data[o + 3] = Math.round(Math.min(1, alpha) * 255)
    }
  }
  return { width, height, data }
}
