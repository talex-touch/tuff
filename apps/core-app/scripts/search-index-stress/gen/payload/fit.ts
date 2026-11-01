import type { PayloadSpec } from '../../types'
import { dimensionsForBytes } from './pattern'

export interface FitOptions {
  /** Approximate stored bytes per pixel; sizes the first guess when the spec carries no pixel size. */
  bytesPerPixel: number
  aspect?: number
  /** Cap for derived pixel counts: formats that store flat colour reach big files through padding. */
  maxPixels?: number
  /** Smallest padding the container can carry; a smaller gap is closed by shrinking the image. */
  padRoom: number
  encode: (width: number, height: number) => Buffer
  /** Grows `body` to at least `target`; may overshoot by less than `padRoom`. */
  pad: (body: Buffer, target: number) => Buffer
}

function startingSize(bytes: number, options: FitOptions): { width: number; height: number } {
  const derived = dimensionsForBytes(bytes, options.aspect, options.bytesPerPixel)
  const cap = options.maxPixels ?? Number.POSITIVE_INFINITY
  if (derived.width * derived.height <= cap) return derived
  const scale = Math.sqrt(cap / (derived.width * derived.height))
  return {
    width: Math.max(8, Math.floor(derived.width * scale)),
    height: Math.max(8, Math.floor(derived.height * scale))
  }
}

const reachable = (length: number, target: number, room: number): boolean =>
  length === target || length + room <= target

/** At least `spec.bytes` bytes, exactly that many when the container can carry the padding; a fixed pixel size wins over the byte target. */
export function fitToBytes(spec: PayloadSpec, options: FitOptions): Buffer {
  const explicit = Boolean(spec.width && spec.height)
  let { width, height } = explicit
    ? { width: spec.width as number, height: spec.height as number }
    : startingSize(spec.bytes, options)
  let body = options.encode(width, height)
  for (
    let attempt = 0;
    !explicit && attempt < 8 && !reachable(body.length, spec.bytes, options.padRoom);
    attempt += 1
  ) {
    const scale = Math.min(0.97, Math.sqrt(spec.bytes / body.length) * 0.97)
    width = Math.max(8, Math.floor(width * scale))
    height = Math.max(8, Math.floor(height * scale))
    body = options.encode(width, height)
  }
  return body.length < spec.bytes ? options.pad(body, spec.bytes) : body
}
