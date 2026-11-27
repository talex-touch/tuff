/**
 * Pure-TypeScript GIF89a decoder and encoder for client-side avatar frame
 * extraction, animated GIF trimming/cropping, and video-to-GIF conversion.
 */

export interface GifFrame {
  rgba: Uint8ClampedArray
  width: number
  height: number
  /** Display duration of this frame in milliseconds. */
  delayMs: number
}

export interface DecodedGif {
  width: number
  height: number
  frames: GifFrame[]
  totalDurationMs: number
}

export interface GifEncodeOptions {
  width: number
  height: number
  /** Repeat count (`0` = loop forever). Ignored for single-frame GIFs. @default 0 */
  loop?: number
  /** Maximum colors per frame (2..256). @default 256 */
  maxColors?: number
}

interface ColorBox {
  indices: Uint32Array
  start: number
  end: number
  rMin: number
  rMax: number
  gMin: number
  gMax: number
  bMin: number
  bMax: number
}

// ---------------------------------------------------------------------------
// Palette quantization (median-cut in RGB + 15-bit LUT for fast nearest match)
// ---------------------------------------------------------------------------

function computeBoxBounds(
  rgba: Uint8ClampedArray,
  indices: Uint32Array,
  start: number,
  end: number,
): ColorBox {
  let rMin = 255
  let rMax = 0
  let gMin = 255
  let gMax = 0
  let bMin = 255
  let bMax = 0

  for (let i = start; i < end; i++) {
    const p = indices[i]! * 4
    const r = rgba[p]!
    const g = rgba[p + 1]!
    const b = rgba[p + 2]!
    if (r < rMin) rMin = r
    if (r > rMax) rMax = r
    if (g < gMin) gMin = g
    if (g > gMax) gMax = g
    if (b < bMin) bMin = b
    if (b > bMax) bMax = b
  }

  return { indices, start, end, rMin, rMax, gMin, gMax, bMin, bMax }
}

function quantizeFrame(
  rgba: Uint8ClampedArray,
  pixelCount: number,
  maxColors: number,
): {
  palette: Uint8Array
  paletteSize: number
  indexed: Uint8Array
  transparentIndex: number
} {
  let hasTransparent = false
  const opaqueList: number[] = []

  // Collect opaque pixels (and downsample sampling stride for large frames to keep quantization fast).
  const stride = pixelCount > 65536 ? Math.ceil(pixelCount / 32768) : 1
  for (let i = 0; i < pixelCount; i++) {
    const a = rgba[i * 4 + 3]!
    if (a < 128) {
      hasTransparent = true
    }
    else if (i % stride === 0) {
      opaqueList.push(i)
    }
  }

  const targetColors = Math.max(2, Math.min(256, maxColors))
  const maxOpaqueColors = hasTransparent ? targetColors - 1 : targetColors

  const paletteColors: [number, number, number][] = []

  if (opaqueList.length === 0) {
    paletteColors.push([0, 0, 0])
  }
  else {
    const sampleIndices = new Uint32Array(opaqueList)
    const boxes: ColorBox[] = [computeBoxBounds(rgba, sampleIndices, 0, sampleIndices.length)]

    while (boxes.length < maxOpaqueColors) {
      let bestIdx = -1
      let bestScore = -1
      for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i]!
        const count = box.end - box.start
        if (count < 2)
          continue
        const range = Math.max(box.rMax - box.rMin, box.gMax - box.gMin, box.bMax - box.bMin)
        if (range === 0)
          continue
        const score = range * count
        if (score > bestScore) {
          bestScore = score
          bestIdx = i
        }
      }

      if (bestIdx < 0)
        break

      const box = boxes.splice(bestIdx, 1)[0]!
      const rRange = box.rMax - box.rMin
      const gRange = box.gMax - box.gMin
      const bRange = box.bMax - box.bMin
      const channel = rRange >= gRange && rRange >= bRange ? 0 : (gRange >= bRange ? 1 : 2)

      // Counting sort by the widest channel (O(n) instead of O(n log n) comparator).
      const counts = new Uint32Array(256)
      for (let i = box.start; i < box.end; i++) {
        const val = rgba[sampleIndices[i]! * 4 + channel]!
        counts[val] = counts[val]! + 1
      }

      const midCount = (box.end - box.start) >> 1
      let acc = 0
      let splitVal = 0
      for (let v = 0; v < 256; v++) {
        acc += counts[v]!
        if (acc >= midCount) {
          splitVal = v
          break
        }
      }

      // Partition in-place around splitVal.
      let left = box.start
      let right = box.end - 1
      while (left <= right) {
        while (left <= right && rgba[sampleIndices[left]! * 4 + channel]! <= splitVal)
          left++
        while (left <= right && rgba[sampleIndices[right]! * 4 + channel]! > splitVal)
          right--
        if (left < right) {
          const tmp = sampleIndices[left]!
          sampleIndices[left] = sampleIndices[right]!
          sampleIndices[right] = tmp
          left++
          right--
        }
      }

      let split = left
      if (split <= box.start || split >= box.end)
        split = (box.start + box.end) >> 1

      boxes.push(computeBoxBounds(rgba, sampleIndices, box.start, split))
      boxes.push(computeBoxBounds(rgba, sampleIndices, split, box.end))
    }

    for (const box of boxes) {
      let rSum = 0
      let gSum = 0
      let bSum = 0
      const count = box.end - box.start
      for (let i = box.start; i < box.end; i++) {
        const p = sampleIndices[i]! * 4
        rSum += rgba[p]!
        gSum += rgba[p + 1]!
        bSum += rgba[p + 2]!
      }
      paletteColors.push([
        Math.round(rSum / count),
        Math.round(gSum / count),
        Math.round(bSum / count),
      ])
    }
  }

  // Place the transparency index immediately after the opaque palette so small palettes stay compact.
  const transparentIndex = hasTransparent ? paletteColors.length : -1
  const usedEntries = hasTransparent ? paletteColors.length + 1 : paletteColors.length
  let tableSize = 4
  while (tableSize < usedEntries && tableSize < 256)
    tableSize <<= 1

  const palette = new Uint8Array(tableSize * 3)
  for (let i = 0; i < paletteColors.length; i++) {
    const [r, g, b] = paletteColors[i]!
    palette[i * 3] = r
    palette[i * 3 + 1] = g
    palette[i * 3 + 2] = b
  }

  // Map every pixel to its closest palette entry using a 15-bit RGB cache (32×32×32).
  const cache = new Int16Array(32768).fill(-1)
  const indexed = new Uint8Array(pixelCount)
  const colorCount = paletteColors.length

  for (let i = 0; i < pixelCount; i++) {
    const p = i * 4
    if (hasTransparent && rgba[p + 3]! < 128) {
      indexed[i] = transparentIndex
      continue
    }
    const r = rgba[p]!
    const g = rgba[p + 1]!
    const b = rgba[p + 2]!
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    let best = cache[key]!
    if (best < 0) {
      let bestDist = Infinity
      best = 0
      for (let c = 0; c < colorCount; c++) {
        const pr = palette[c * 3]!
        const pg = palette[c * 3 + 1]!
        const pb = palette[c * 3 + 2]!
        const dr = r - pr
        const dg = g - pg
        const db = b - pb
        const dist = dr * dr * 2 + dg * dg * 4 + db * db
        if (dist < bestDist) {
          bestDist = dist
          best = c
          if (dist === 0)
            break
        }
      }
      cache[key] = best
    }
    indexed[i] = best
  }

  return {
    palette,
    paletteSize: tableSize,
    indexed,
    transparentIndex,
  }
}

// ---------------------------------------------------------------------------
// GIF LZW Encoder (variable 3..12 bit codes with clear/EOI & 255B sub-blocks)
// ---------------------------------------------------------------------------

function lzwEncode(indexed: Uint8Array, minCodeSize: number): Uint8Array {
  const clearCode = 1 << minCodeSize
  const eoiCode = clearCode + 1
  const out: number[] = []
  const block = new Uint8Array(256)
  let blockLen = 0
  let bitBuf = 0
  let bitCount = 0

  function flushBlock(): void {
    if (blockLen > 0) {
      out.push(blockLen)
      for (let i = 0; i < blockLen; i++)
        out.push(block[i]!)
      blockLen = 0
    }
  }

  function writeCode(code: number, size: number): void {
    bitBuf |= code << bitCount
    bitCount += size
    while (bitCount >= 8) {
      block[blockLen++] = bitBuf & 0xFF
      bitBuf >>= 8
      bitCount -= 8
      if (blockLen === 255)
        flushBlock()
    }
  }

  // Open-addressing hash table for (prefix << 8) | suffix -> code
  const HASH_SIZE = 8192
  const HASH_MASK = HASH_SIZE - 1
  const keys = new Int32Array(HASH_SIZE).fill(-1)
  const vals = new Int16Array(HASH_SIZE)

  function clearTable(): void {
    keys.fill(-1)
  }

  let codeSize = minCodeSize + 1
  let nextCode = eoiCode + 1

  writeCode(clearCode, codeSize)

  if (indexed.length > 0) {
    let prefix = indexed[0]!

    for (let i = 1; i < indexed.length; i++) {
      const k = indexed[i]!
      const combined = (prefix << 8) | k
      let slot = ((combined * 2654435761) >>> 19) & HASH_MASK
      let found = -1

      while (keys[slot] !== -1) {
        if (keys[slot] === combined) {
          found = vals[slot]!
          break
        }
        slot = (slot + 1) & HASH_MASK
      }

      if (found >= 0) {
        prefix = found
      }
      else {
        writeCode(prefix, codeSize)

        if (nextCode < 4096) {
          if (nextCode === (1 << codeSize) && codeSize < 12)
            codeSize++
          keys[slot] = combined
          vals[slot] = nextCode++
        }
        else {
          writeCode(clearCode, codeSize)
          clearTable()
          codeSize = minCodeSize + 1
          nextCode = eoiCode + 1
        }

        prefix = k
      }
    }

    writeCode(prefix, codeSize)
    if (nextCode === (1 << codeSize) && codeSize < 12)
      codeSize++
  }

  writeCode(eoiCode, codeSize)
  if (bitCount > 0) {
    block[blockLen++] = bitBuf & 0xFF
    bitBuf = 0
    bitCount = 0
  }
  flushBlock()
  out.push(0) // block terminator

  return new Uint8Array(out)
}

/**
 * Encodes one or more RGBA frames into a standards-compliant GIF89a byte array.
 */
export function encodeGif(frames: readonly GifFrame[], options: GifEncodeOptions): Uint8Array<ArrayBuffer> {
  if (!frames.length)
    throw new Error('encodeGif requires at least one frame')

  const width = Math.max(1, Math.min(65535, Math.round(options.width)))
  const height = Math.max(1, Math.min(65535, Math.round(options.height)))
  const maxColors = options.maxColors ?? 256
  const loop = options.loop ?? 0
  const chunks: Uint8Array[] = []

  // Header + Logical Screen Descriptor (no Global Color Table; each frame carries an optimal local table)
  const header = new Uint8Array(13)
  header.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0) // 'GIF89a'
  header[6] = width & 0xFF
  header[7] = (width >> 8) & 0xFF
  header[8] = height & 0xFF
  header[9] = (height >> 8) & 0xFF
  header[10] = 0x70 // color resolution = 7 (8 bits/channel), no GCT
  header[11] = 0 // background color index
  header[12] = 0 // pixel aspect ratio
  chunks.push(header)

  // NETSCAPE2.0 looping extension for animated GIFs
  if (frames.length > 1) {
    const netscape = new Uint8Array([
      0x21, 0xFF, 0x0B,
      0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2E, 0x30,
      0x03, 0x01,
      loop & 0xFF, (loop >> 8) & 0xFF,
      0x00,
    ])
    chunks.push(netscape)
  }

  const pixelCount = width * height

  for (const frame of frames) {
    const { palette, paletteSize, indexed, transparentIndex } = quantizeFrame(
      frame.rgba,
      pixelCount,
      maxColors,
    )

    const minCodeSize = Math.max(2, Math.round(Math.log2(paletteSize)))
    const lctSizeField = minCodeSize - 1
    const delayCs = Math.max(2, Math.min(65535, Math.round((frame.delayMs || 100) / 10)))

    // Graphic Control Extension
    const gce = new Uint8Array(8)
    gce[0] = 0x21
    gce[1] = 0xF9
    gce[2] = 0x04
    // Disposal = 2 (restore to background) so transparent frames never smear over previous frames
    gce[3] = (2 << 2) | (transparentIndex >= 0 ? 1 : 0)
    gce[4] = delayCs & 0xFF
    gce[5] = (delayCs >> 8) & 0xFF
    gce[6] = transparentIndex >= 0 ? transparentIndex : 0
    gce[7] = 0x00
    chunks.push(gce)

    // Image Descriptor
    const desc = new Uint8Array(10)
    desc[0] = 0x2C
    desc[1] = 0
    desc[2] = 0
    desc[3] = 0
    desc[4] = 0
    desc[5] = width & 0xFF
    desc[6] = (width >> 8) & 0xFF
    desc[7] = height & 0xFF
    desc[8] = (height >> 8) & 0xFF
    desc[9] = 0x80 | (lctSizeField & 0x07) // Local Color Table present, non-interlaced
    chunks.push(desc)

    chunks.push(palette)
    chunks.push(new Uint8Array([minCodeSize]))
    chunks.push(lzwEncode(indexed, minCodeSize))
  }

  chunks.push(new Uint8Array([0x3B])) // GIF trailer

  let total = 0
  for (const chunk of chunks)
    total += chunk.byteLength

  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }

  return output
}

// ---------------------------------------------------------------------------
// GIF87a / GIF89a Decoder (LZW + sub-rect + interlace + disposal compositing)
// ---------------------------------------------------------------------------

function lzwDecode(data: Uint8Array, minCodeSize: number, pixelCount: number): Uint8Array {
  const clearCode = 1 << minCodeSize
  const eoiCode = clearCode + 1
  const output = new Uint8Array(pixelCount)
  let outPos = 0

  const prefix = new Int32Array(4096)
  const suffix = new Uint8Array(4096)
  const stack = new Uint8Array(4096)

  let codeSize = minCodeSize + 1
  let nextCode = eoiCode + 1
  let codeMask = (1 << codeSize) - 1

  for (let i = 0; i < clearCode; i++)
    suffix[i] = i

  let bitPos = 0
  const totalBits = data.length * 8

  function readCode(): number {
    if (bitPos + codeSize > totalBits)
      return eoiCode
    let val = 0
    for (let i = 0; i < codeSize; i++) {
      const byteIdx = (bitPos + i) >> 3
      const bitIdx = (bitPos + i) & 7
      if ((data[byteIdx]! >> bitIdx) & 1)
        val |= 1 << i
    }
    bitPos += codeSize
    return val & codeMask
  }

  let prevCode = -1
  let firstChar = 0

  while (outPos < pixelCount) {
    const code = readCode()
    if (code === eoiCode)
      break

    if (code === clearCode) {
      codeSize = minCodeSize + 1
      nextCode = eoiCode + 1
      codeMask = (1 << codeSize) - 1
      prevCode = -1
      continue
    }

    let inCode = code
    let stackTop = 0

    if (code >= nextCode) {
      if (prevCode < 0)
        break
      stack[stackTop++] = firstChar
      inCode = prevCode
    }

    while (inCode >= clearCode) {
      stack[stackTop++] = suffix[inCode]!
      inCode = prefix[inCode]!
      if (stackTop >= 4096)
        break
    }

    firstChar = suffix[inCode]!
    stack[stackTop++] = firstChar

    while (stackTop > 0 && outPos < pixelCount)
      output[outPos++] = stack[--stackTop]!

    if (prevCode >= 0 && nextCode < 4096) {
      prefix[nextCode] = prevCode
      suffix[nextCode] = firstChar
      nextCode++
      if (nextCode === (1 << codeSize) && codeSize < 12) {
        codeSize++
        codeMask = (1 << codeSize) - 1
      }
    }

    prevCode = code
  }

  return output
}

function readSubBlocks(bytes: Uint8Array, startOffset: number): { data: Uint8Array, nextOffset: number } {
  const parts: Uint8Array[] = []
  let pos = startOffset
  let total = 0

  while (pos < bytes.length) {
    const len = bytes[pos++]!
    if (len === 0)
      break
    const end = Math.min(bytes.length, pos + len)
    parts.push(bytes.subarray(pos, end))
    total += end - pos
    pos = end
  }

  const data = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    data.set(part, offset)
    offset += part.length
  }

  return { data, nextOffset: pos }
}

const INTERLACE_OFFSETS = [0, 4, 2, 1] as const
const INTERLACE_STEPS = [8, 8, 4, 2] as const

/**
 * Decodes all composited RGBA frames of a GIF87a/GIF89a byte array.
 * Works identically in browsers without `ImageDecoder` and in Node/Vitest tests.
 */
export function decodeGif(bytes: Uint8Array, maxFrames = 240): DecodedGif {
  if (bytes.length < 13)
    throw new Error('Invalid GIF: file too short')

  const sig = String.fromCharCode(...bytes.subarray(0, 6))
  if (sig !== 'GIF87a' && sig !== 'GIF89a')
    throw new Error(`Invalid GIF header: ${sig}`)

  const width = bytes[6]! | (bytes[7]! << 8)
  const height = bytes[8]! | (bytes[9]! << 8)
  const packed = bytes[10]!
  const hasGct = (packed & 0x80) !== 0
  const gctSize = hasGct ? 1 << ((packed & 0x07) + 1) : 0

  let pos = 13
  let gct: Uint8Array | null = null
  if (hasGct) {
    gct = bytes.subarray(pos, pos + gctSize * 3)
    pos += gctSize * 3
  }

  const canvas = new Uint8ClampedArray(width * height * 4)
  const frames: GifFrame[] = []
  let totalDurationMs = 0

  let delayMs = 100
  let disposal = 0
  let transparentIndex = -1

  while (pos < bytes.length && frames.length < maxFrames) {
    const introducer = bytes[pos++]!
    if (introducer === 0x3B)
      break

    if (introducer === 0x21) {
      const label = bytes[pos++]!
      if (label === 0xF9 && pos + 5 <= bytes.length) {
        const blockSize = bytes[pos++]!
        const gcePacked = bytes[pos]!
        disposal = (gcePacked >> 2) & 0x07
        const hasTrans = (gcePacked & 0x01) !== 0
        const delayCs = bytes[pos + 1]! | (bytes[pos + 2]! << 8)
        delayMs = delayCs <= 1 ? 100 : delayCs * 10
        transparentIndex = hasTrans ? bytes[pos + 3]! : -1
        pos += blockSize
        if (bytes[pos] === 0)
          pos++
      }
      else {
        const skipped = readSubBlocks(bytes, pos)
        pos = skipped.nextOffset
      }
      continue
    }

    if (introducer === 0x2C) {
      if (pos + 9 > bytes.length)
        break
      const left = bytes[pos]! | (bytes[pos + 1]! << 8)
      const top = bytes[pos + 2]! | (bytes[pos + 3]! << 8)
      const frameW = bytes[pos + 4]! | (bytes[pos + 5]! << 8)
      const frameH = bytes[pos + 6]! | (bytes[pos + 7]! << 8)
      const imgPacked = bytes[pos + 8]!
      pos += 9

      const hasLct = (imgPacked & 0x80) !== 0
      const interlaced = (imgPacked & 0x40) !== 0
      let colorTable = gct
      if (hasLct) {
        const lctSize = 1 << ((imgPacked & 0x07) + 1)
        colorTable = bytes.subarray(pos, pos + lctSize * 3)
        pos += lctSize * 3
      }

      const minCodeSize = bytes[pos++]!
      const { data: compressed, nextOffset } = readSubBlocks(bytes, pos)
      pos = nextOffset

      const indices = lzwDecode(compressed, minCodeSize, frameW * frameH)
      const snapshotBefore = disposal === 3 ? new Uint8ClampedArray(canvas) : null

      if (colorTable) {
        let srcIdx = 0
        if (interlaced) {
          for (let pass = 0; pass < 4; pass++) {
            for (let y = INTERLACE_OFFSETS[pass]!; y < frameH; y += INTERLACE_STEPS[pass]!) {
              const dstY = top + y
              for (let x = 0; x < frameW; x++, srcIdx++) {
                const colorIdx = indices[srcIdx]!
                if (colorIdx === transparentIndex)
                  continue
                const dstX = left + x
                if (dstX < 0 || dstX >= width || dstY < 0 || dstY >= height)
                  continue
                const dst = (dstY * width + dstX) * 4
                canvas[dst] = colorTable[colorIdx * 3] ?? 0
                canvas[dst + 1] = colorTable[colorIdx * 3 + 1] ?? 0
                canvas[dst + 2] = colorTable[colorIdx * 3 + 2] ?? 0
                canvas[dst + 3] = 255
              }
            }
          }
        }
        else {
          for (let y = 0; y < frameH; y++) {
            const dstY = top + y
            for (let x = 0; x < frameW; x++, srcIdx++) {
              const colorIdx = indices[srcIdx]!
              if (colorIdx === transparentIndex)
                continue
              const dstX = left + x
              if (dstX < 0 || dstX >= width || dstY < 0 || dstY >= height)
                continue
              const dst = (dstY * width + dstX) * 4
              canvas[dst] = colorTable[colorIdx * 3] ?? 0
              canvas[dst + 1] = colorTable[colorIdx * 3 + 1] ?? 0
              canvas[dst + 2] = colorTable[colorIdx * 3 + 2] ?? 0
              canvas[dst + 3] = 255
            }
          }
        }
      }

      frames.push({
        rgba: new Uint8ClampedArray(canvas),
        width,
        height,
        delayMs,
      })
      totalDurationMs += delayMs

      if (disposal === 2) {
        for (let y = 0; y < frameH; y++) {
          const dstY = top + y
          if (dstY < 0 || dstY >= height)
            continue
          for (let x = 0; x < frameW; x++) {
            const dstX = left + x
            if (dstX < 0 || dstX >= width)
              continue
            const dst = (dstY * width + dstX) * 4
            canvas[dst] = 0
            canvas[dst + 1] = 0
            canvas[dst + 2] = 0
            canvas[dst + 3] = 0
          }
        }
      }
      else if (disposal === 3 && snapshotBefore) {
        canvas.set(snapshotBefore)
      }

      // Reset GCE state for the next frame per GIF89a spec
      delayMs = 100
      disposal = 0
      transparentIndex = -1
    }
  }

  return { width, height, frames, totalDurationMs }
}
