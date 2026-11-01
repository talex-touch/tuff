import type { PayloadSpec } from '../../types'
import { encodeBmp } from './bmp'
import { encodeGif } from './gif'
import { encodeHeic } from './heic'
import { encodeJpeg } from './jpeg'
import { encodeBinary, encodeFakeImage, encodeText } from './misc'
import { encodePng } from './png'
import { encodeSvg } from './svg'
import { encodeTiff } from './tiff'
import { encodeWebp } from './webp'

export const MAX_PAYLOAD_BYTES = 32 * 1024 * 1024
export const MAX_PIXEL_SIDE = 16383

function assertSpec(spec: PayloadSpec): void {
  if (!Number.isInteger(spec.bytes) || spec.bytes < 0 || spec.bytes > MAX_PAYLOAD_BYTES) {
    throw new RangeError(`payload bytes out of range: ${spec.bytes}`)
  }
  if (!Number.isInteger(spec.seed))
    throw new RangeError(`payload seed must be an integer: ${spec.seed}`)
  for (const side of [spec.width, spec.height]) {
    if (side !== undefined && (!Number.isInteger(side) || side < 1 || side > MAX_PIXEL_SIDE)) {
      throw new RangeError(`payload pixel size out of range: ${side}`)
    }
  }
}

/** Image kinds give at least `bytes` bytes (GIF, WebP, HEIC may overshoot a little; a pixel size needing more wins), other kinds exactly `bytes`; same spec, same bytes. */
export function materializePayload(spec: PayloadSpec): Buffer {
  assertSpec(spec)
  switch (spec.kind) {
    case 'png':
      return encodePng(spec)
    case 'jpg':
      return encodeJpeg(spec)
    case 'gif':
      return encodeGif(spec)
    case 'bmp':
      return encodeBmp(spec)
    case 'webp':
      return encodeWebp(spec)
    case 'tiff':
      return encodeTiff(spec)
    case 'heic':
      return encodeHeic(spec)
    case 'svg':
      return encodeSvg(spec)
    case 'fake-image':
      return encodeFakeImage(spec)
    case 'text':
      return encodeText(spec)
    case 'binary':
      return encodeBinary(spec)
  }
}
