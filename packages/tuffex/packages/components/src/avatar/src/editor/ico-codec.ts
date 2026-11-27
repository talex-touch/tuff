export interface IcoPngEntry {
  width: number
  height: number
  pngBytes: Uint8Array
}

export interface IcoDirectoryEntry {
  width: number
  height: number
  colorCount: number
  planes: number
  bitCount: number
  bytesInRes: number
  imageOffset: number
}

export interface ExtractedIcoEntry {
  width: number
  height: number
  bitCount: number
  isPng: boolean
  bytes: Uint8Array
  blob: Blob
}

const PNG_MAGIC = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] as const

function hasPngMagic(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_MAGIC.length)
    return false
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (bytes[i] !== PNG_MAGIC[i])
      return false
  }
  return true
}

/**
 * Encodes one or more PNG-encoded square frames into a standards-compliant
 * multi-resolution `.ico` binary (Windows Vista+, macOS, Linux, Chromium, Safari, Firefox).
 */
export function encodeIco(entries: readonly IcoPngEntry[]): Blob {
  if (!entries.length)
    throw new Error('encodeIco requires at least one PNG entry')

  const headerSize = 6
  const dirEntrySize = 16
  const directoryBytes = headerSize + entries.length * dirEntrySize
  let totalBytes = directoryBytes
  for (const entry of entries)
    totalBytes += entry.pngBytes.byteLength

  const buffer = new ArrayBuffer(totalBytes)
  const view = new DataView(buffer)
  const out = new Uint8Array(buffer)

  // ICONDIR header: reserved = 0, type = 1 (icon), count = entries.length
  view.setUint16(0, 0, true)
  view.setUint16(2, 1, true)
  view.setUint16(4, entries.length, true)

  let dataOffset = directoryBytes
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    const offset = headerSize + i * dirEntrySize
    const w = Math.max(1, Math.min(256, Math.round(entry.width)))
    const h = Math.max(1, Math.min(256, Math.round(entry.height)))

    view.setUint8(offset + 0, w >= 256 ? 0 : w)
    view.setUint8(offset + 1, h >= 256 ? 0 : h)
    view.setUint8(offset + 2, 0) // colorCount (0 for >= 256 colors / PNG)
    view.setUint8(offset + 3, 0) // reserved
    view.setUint16(offset + 4, 1, true) // planes
    view.setUint16(offset + 6, 32, true) // bitCount (32-bit RGBA PNG)
    view.setUint32(offset + 8, entry.pngBytes.byteLength, true)
    view.setUint32(offset + 12, dataOffset, true)

    out.set(entry.pngBytes, dataOffset)
    dataOffset += entry.pngBytes.byteLength
  }

  return new Blob([buffer], { type: 'image/x-icon' })
}

/**
 * Parses the ICONDIR table of an `.ico` buffer. Returns an empty array if invalid.
 */
export function parseIcoEntries(buffer: ArrayBuffer): IcoDirectoryEntry[] {
  if (buffer.byteLength < 6)
    return []

  const view = new DataView(buffer)
  const reserved = view.getUint16(0, true)
  const type = view.getUint16(2, true)
  const count = view.getUint16(4, true)
  if (reserved !== 0 || (type !== 1 && type !== 2) || count === 0)
    return []

  const entries: IcoDirectoryEntry[] = []
  for (let i = 0; i < count; i++) {
    const offset = 6 + i * 16
    if (offset + 16 > buffer.byteLength)
      break

    const rawW = view.getUint8(offset)
    const rawH = view.getUint8(offset + 1)
    const colorCount = view.getUint8(offset + 2)
    const planes = view.getUint16(offset + 4, true)
    const bitCount = view.getUint16(offset + 6, true)
    const bytesInRes = view.getUint32(offset + 8, true)
    const imageOffset = view.getUint32(offset + 12, true)

    if (imageOffset + bytesInRes > buffer.byteLength || bytesInRes === 0)
      continue

    entries.push({
      width: rawW === 0 ? 256 : rawW,
      height: rawH === 0 ? 256 : rawH,
      colorCount,
      planes,
      bitCount,
      bytesInRes,
      imageOffset,
    })
  }

  return entries
}

/**
 * Extracts the highest-resolution entry from a multi-image `.ico` container.
 * When that entry is PNG-compressed, returning it directly lets the browser decode
 * the full 256px frame instead of defaulting to a 16px/32px entry.
 */
export function extractBestIcoEntry(buffer: ArrayBuffer): ExtractedIcoEntry | null {
  const entries = parseIcoEntries(buffer)
  if (!entries.length)
    return null

  const sorted = [...entries].sort((a, b) => {
    const areaDiff = b.width * b.height - a.width * a.height
    if (areaDiff !== 0)
      return areaDiff
    return b.bitCount - a.bitCount
  })

  const best = sorted[0]!
  const slice = new Uint8Array(buffer.slice(best.imageOffset, best.imageOffset + best.bytesInRes))
  const isPng = hasPngMagic(slice)

  return {
    width: best.width,
    height: best.height,
    bitCount: best.bitCount,
    isPng,
    bytes: slice,
    blob: isPng
      ? new Blob([slice], { type: 'image/png' })
      : new Blob([buffer], { type: 'image/x-icon' }),
  }
}

export function resolveIcoSizes(outputSize: number, requested?: readonly number[]): number[] {
  const cap = Math.max(16, Math.min(256, Math.round(outputSize)))
  const base = requested && requested.length ? requested : [16, 32, 48, 64, 128, 256]
  const filtered = Array.from(
    new Set(
      base
        .map(s => Math.round(s))
        .filter(s => Number.isFinite(s) && s >= 16 && s <= cap),
    ),
  ).sort((a, b) => a - b)

  if (!filtered.length || filtered[filtered.length - 1] !== cap)
    filtered.push(cap)

  return filtered
}
