import type { ImageAddon } from '@xterm/addon-image'
import type { IDisposable, Terminal as XtermTerminal } from '@xterm/xterm'
import type { TerminalData } from './types'

/**
 * Private internal OSC number injected by the Kitty stream preprocessor so xterm's own
 * parser reports exact cursor coordinates and maintains strict sequence ordering.
 */
export const KITTY_INTERNAL_OSC = 51337

const ESC = '\u001B'
const BEL = '\u0007'
const KITTY_PLACEHOLDER = '\u{10EEEE}'
const KITTY_PLACEHOLDER_HIGH_SURROGATE = KITTY_PLACEHOLDER[0]!
const KITTY_PLACEHOLDER_LOW_SURROGATE = KITTY_PLACEHOLDER[1]!
const KITTY_ORIGIN_DIACRITIC = 0x0305
const COMBINING_MARK_RE = /\p{Mn}/u

const MAX_APC_RAW_CHARS = 24 * 1024 * 1024
const MAX_PIXEL_COUNT = 16_777_216
const MAX_CACHED_IMAGES = 12

type KittyDrawable = HTMLCanvasElement | ImageBitmap

interface KittyParams {
  a?: string
  f?: number
  t?: string
  o?: string
  s?: number
  v?: number
  i?: number
  p?: number
  c?: number
  r?: number
  U?: number
  C?: number
  m?: number
  d?: string
}

interface PendingTransmit {
  params: KittyParams
  chunks: string[]
  totalChars: number
}

interface KittyImageRecord {
  id: number
  cols: number
  rows: number
  source: KittyDrawable | null
  pending: Promise<KittyDrawable | null> | null
  generation: number
}

interface KittyPlacement {
  x: number
  y: number
  bufferType: 'normal' | 'alternate'
  direct: boolean
}

interface InternalImageRenderer {
  cellSize?: { width: number, height: number }
}

interface InternalImageStorage {
  _lastId?: number
  _images?: Map<number, unknown>
  _needsFullClear?: boolean
  _fullyCleared?: boolean
  addImage?: (img: KittyDrawable) => void
  _delImg?: (id: number) => void
}

interface InternalImageAddon extends ImageAddon {
  _renderer?: InternalImageRenderer
  _storage?: InternalImageStorage
}

interface InternalBuffer {
  x: number
  y: number
  scrollBottom?: number
}

interface InternalXtermTerminal extends XtermTerminal {
  _core?: {
    buffer?: InternalBuffer
  }
}

export interface KittyGraphicsAdapter extends IDisposable {
  /** Preprocesses terminal output before xterm parses it. */
  transform: (data: TerminalData) => TerminalData
  /** Flushes pending image placements once xterm finishes parsing a write chunk. */
  flush: () => void
  /** Clears buffered parser and image state (called on terminal reset / clear). */
  reset: () => void
}

function isPositiveInt(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function parseKittyParams(header: string): KittyParams {
  const params: KittyParams = {}
  if (!header)
    return params
  for (const part of header.split(',')) {
    const eq = part.indexOf('=')
    if (eq <= 0)
      continue
    const key = part.slice(0, eq).trim()
    const raw = part.slice(eq + 1).trim()
    switch (key) {
      case 'a':
        params.a = raw
        break
      case 't':
        params.t = raw
        break
      case 'o':
        params.o = raw
        break
      case 'd':
        params.d = raw
        break
      case 'f':
      case 's':
      case 'v':
      case 'i':
      case 'p':
      case 'c':
      case 'r':
      case 'U':
      case 'C':
      case 'm': {
        const parsed = Number.parseInt(raw, 10)
        if (Number.isFinite(parsed))
          params[key] = parsed
        break
      }
    }
  }
  return params
}

function decodeBase64(base64: string): Uint8Array | null {
  const normalized = base64.replace(/\s+/g, '')
  if (!normalized)
    return new Uint8Array(0)
  try {
    if (typeof atob === 'function') {
      const binary = atob(normalized)
      const out = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++)
        out[i] = binary.charCodeAt(i)
      return out
    }
    return null
  }
  catch {
    return null
  }
}

async function decompressZlib(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream !== 'function')
    return null
  try {
    const stream = new DecompressionStream('deflate')
    const writer = stream.writable.getWriter()
    const input = new Uint8Array(bytes.byteLength)
    input.set(bytes)
    void writer.write(input)
    void writer.close()
    const reader = stream.readable.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done)
        break
      if (value) {
        total += value.byteLength
        if (total > MAX_PIXEL_COUNT * 4)
          return null
        chunks.push(value)
      }
    }
    const merged = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.byteLength
    }
    return merged
  }
  catch {
    return null
  }
}

function buildCanvasFromRawPixels(
  bytes: Uint8Array,
  format: number,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined')
    return null
  if (width <= 0 || height <= 0 || width * height > MAX_PIXEL_COUNT)
    return null
  const bpp = format === 24 ? 3 : 4
  const expected = width * height * bpp
  if (bytes.byteLength < expected)
    return null

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx)
    return null

  const rgba = new Uint8ClampedArray(width * height * 4)
  if (format === 24) {
    let src = 0
    let dst = 0
    const pixels = width * height
    for (let idx = 0; idx < pixels; idx++) {
      rgba[dst++] = bytes[src++]!
      rgba[dst++] = bytes[src++]!
      rgba[dst++] = bytes[src++]!
      rgba[dst++] = 255
    }
  }
  else {
    rgba.set(bytes.subarray(0, expected))
  }

  const imageData = typeof ImageData === 'function'
    ? new ImageData(rgba, width, height)
    : (() => {
        const created = ctx.createImageData(width, height)
        created.data.set(rgba)
        return created
      })()
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

async function decodePng(bytes: Uint8Array): Promise<KittyDrawable | null> {
  if (typeof Blob === 'undefined' || bytes.byteLength === 0)
    return null
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const blob = new Blob([copy], { type: 'image/png' })
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob)
      if (bitmap.width * bitmap.height > MAX_PIXEL_COUNT) {
        bitmap.close()
        return null
      }
      return bitmap
    }
    catch {
      return null
    }
  }
  if (typeof URL === 'undefined' || typeof Image === 'undefined' || typeof document === 'undefined')
    return null
  const url = URL.createObjectURL(blob)
  return await new Promise<KittyDrawable | null>((resolve) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      if (!img.width || !img.height || img.width * img.height > MAX_PIXEL_COUNT) {
        resolve(null)
        return
      }
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      canvas.getContext('2d')?.drawImage(img, 0, 0)
      resolve(canvas)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

function closeDrawable(drawable: KittyDrawable | null): void {
  if (drawable && typeof ImageBitmap !== 'undefined' && drawable instanceof ImageBitmap)
    drawable.close()
}

function parseSgrForegroundImageId(paramsText: string, currentId: number): number {
  if (!paramsText)
    return 0
  const parts = paramsText.split(';')
  let nextId = currentId
  for (let i = 0; i < parts.length; i++) {
    const token = parts[i]!
    if (!token) {
      nextId = 0
      continue
    }
    if (token.includes(':')) {
      const sub = token.split(':').map(part => Number.parseInt(part, 10))
      if (sub[0] === 38) {
        if (sub[1] === 2) {
          // 38:2:CS:R:G:B or 38:2:R:G:B
          const offset = sub.length >= 6 ? 3 : 2
          const r = sub[offset]
          const g = sub[offset + 1]
          const b = sub[offset + 2]
          if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b))
            nextId = (((r! & 0xFF) << 16) | ((g! & 0xFF) << 8) | (b! & 0xFF)) >>> 0
        }
        else if (sub[1] === 5 && Number.isFinite(sub[2])) {
          nextId = (sub[2]! & 0xFF) >>> 0
        }
      }
      continue
    }
    const code = Number.parseInt(token, 10)
    if (!Number.isFinite(code))
      continue
    if (code === 0 || code === 39) {
      nextId = 0
    }
    else if (code >= 30 && code <= 37) {
      nextId = code - 30
    }
    else if (code >= 90 && code <= 97) {
      nextId = code - 90 + 8
    }
    else if (code === 38) {
      const mode = Number.parseInt(parts[i + 1] ?? '', 10)
      if (mode === 2 && i + 4 < parts.length) {
        const r = Number.parseInt(parts[i + 2] ?? '', 10)
        const g = Number.parseInt(parts[i + 3] ?? '', 10)
        const b = Number.parseInt(parts[i + 4] ?? '', 10)
        if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b))
          nextId = (((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF)) >>> 0
        i += 4
      }
      else if (mode === 5 && i + 2 < parts.length) {
        const idx = Number.parseInt(parts[i + 2] ?? '', 10)
        if (Number.isFinite(idx))
          nextId = (idx & 0xFF) >>> 0
        i += 2
      }
    }
  }
  return nextId
}

function uint8MayContainKitty(bytes: Uint8Array): boolean {
  // 0x1B = ESC (APC / CSI SGR), 0xF4 = UTF-8 lead byte of U+10EEEE (F4 8E BB AE).
  for (let i = 0; i < bytes.byteLength; i++) {
    const byte = bytes[i]!
    if (byte === 0x1B || byte === 0xF4)
      return true
  }
  return false
}

function findEscTerminator(text: string, from: number): { index: number, length: number } | null {
  for (let i = from; i < text.length; i++) {
    const ch = text[i]!
    if (ch === BEL)
      return { index: i, length: 1 }
    if (ch === ESC) {
      if (i + 1 < text.length && text[i + 1] === '\\')
        return { index: i, length: 2 }
      if (i + 1 === text.length)
        return null
    }
  }
  return null
}

function resizeOrCropDrawable(
  source: KittyDrawable,
  targetWidth: number,
  targetHeight: number,
  cropOnly: boolean,
): KittyDrawable {
  const srcWidth = source.width
  const srcHeight = source.height
  const w = Math.max(1, Math.floor(targetWidth))
  const h = Math.max(1, Math.floor(targetHeight))
  if (w === srcWidth && h === srcHeight)
    return source
  if (typeof document === 'undefined')
    return source
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx)
    return source
  if (cropOnly)
    ctx.drawImage(source, 0, 0, w, h, 0, 0, w, h)
  else
    ctx.drawImage(source, 0, 0, srcWidth, srcHeight, 0, 0, w, h)
  return canvas
}

/**
 * Adds passive Kitty Graphics Protocol (`APC _G` + `U+10EEEE` Unicode Placeholders)
 * rendering to `TxTerminal`, painting decoded images onto `@xterm/addon-image`'s
 * HiDPI overlay canvas and replacing placeholder cells with spaces so tofu boxes
 * never appear when attached to Ghostty/Kitty-identity sessions (e.g. `herdr-core`).
 */
export function createKittyGraphicsAdapter(
  terminal: XtermTerminal,
  imageAddon: ImageAddon | null,
): KittyGraphicsAdapter {
  const internalTerminal = terminal as InternalXtermTerminal
  const internalAddon = imageAddon as InternalImageAddon | null
  const decoder = new TextDecoder('utf-8')
  const disposables: IDisposable[] = []

  let disposed = false
  let generation = 0
  let autoId = 0
  let pendingTail = ''
  let currentFgImageId = 0
  let pendingTransmit: PendingTransmit | null = null
  let needsFullRefresh = false

  const images = new Map<number, KittyImageRecord>()
  const placements = new Map<number, KittyPlacement>()
  const ownedStorageIds = new Map<number, number>()
  const dirtyPlacements = new Set<number>()

  function evictStorageImage(kittyId: number): void {
    const storageId = ownedStorageIds.get(kittyId)
    if (storageId === undefined)
      return
    ownedStorageIds.delete(kittyId)
    const storage = internalAddon?._storage
    if (storage?._delImg) {
      storage._delImg(storageId)
      storage._needsFullClear = true
      storage._fullyCleared = false
      needsFullRefresh = true
    }
  }

  function deleteKittyImage(kittyId: number): void {
    const existing = images.get(kittyId)
    if (existing) {
      closeDrawable(existing.source)
      images.delete(kittyId)
    }
    placements.delete(kittyId)
    dirtyPlacements.delete(kittyId)
    evictStorageImage(kittyId)
  }

  function deleteAllKittyImages(): void {
    generation += 1
    for (const record of images.values())
      closeDrawable(record.source)
    images.clear()
    placements.clear()
    dirtyPlacements.clear()
    for (const kittyId of [...ownedStorageIds.keys()])
      evictStorageImage(kittyId)
  }

  function storeImageRecord(record: KittyImageRecord): void {
    const existing = images.get(record.id)
    if (existing)
      closeDrawable(existing.source)
    images.delete(record.id)
    images.set(record.id, record)
    while (images.size > MAX_CACHED_IMAGES) {
      const oldestKey = images.keys().next().value
      if (oldestKey === undefined)
        break
      deleteKittyImage(oldestKey)
    }
  }

  function applyImageToStorage(
    kittyId: number,
    record: KittyImageRecord,
    placement: KittyPlacement,
  ): void {
    const source = record.source
    const storage = internalAddon?._storage
    const renderer = internalAddon?._renderer
    const coreBuffer = internalTerminal._core?.buffer
    if (!source || !storage?.addImage || !coreBuffer || disposed)
      return
    if (terminal.buffer.active.type !== placement.bufferType)
      return

    const rawCell = renderer?.cellSize
    const cellW = rawCell && rawCell.width > 0 ? rawCell.width : 8
    const cellH = rawCell && rawCell.height > 0 ? rawCell.height : 16

    const maxCols = Math.max(1, terminal.cols - placement.x)
    const maxRows = Math.max(1, terminal.rows - placement.y)
    let targetW = source.width
    let targetH = source.height
    let scaled = false

    if (record.cols > 0 || record.rows > 0) {
      const reqW = record.cols > 0 ? record.cols * cellW : 0
      const reqH = record.rows > 0 ? record.rows * cellH : 0
      if (reqW > 0 && reqH > 0) {
        targetW = reqW
        targetH = reqH
      }
      else if (reqW > 0) {
        targetW = reqW
        targetH = Math.max(1, Math.round((source.height * reqW) / source.width))
      }
      else if (reqH > 0) {
        targetH = reqH
        targetW = Math.max(1, Math.round((source.width * reqH) / source.height))
      }
      scaled = true
    }

    const maxPxW = Math.floor(maxCols * cellW)
    const maxPxH = Math.floor(maxRows * cellH)
    let drawable: KittyDrawable = scaled
      ? resizeOrCropDrawable(source, targetW, targetH, false)
      : source
    if (drawable.width > maxPxW || drawable.height > maxPxH) {
      drawable = resizeOrCropDrawable(
        drawable,
        Math.min(drawable.width, maxPxW),
        Math.min(drawable.height, maxPxH),
        true,
      )
    }

    evictStorageImage(kittyId)

    const savedX = coreBuffer.x
    const savedY = coreBuffer.y
    const savedScrollBottom = coreBuffer.scrollBottom
    try {
      coreBuffer.x = Math.max(0, Math.min(terminal.cols - 1, placement.x))
      coreBuffer.y = Math.max(0, Math.min(terminal.rows - 1, placement.y))
      if (typeof savedScrollBottom === 'number')
        coreBuffer.scrollBottom = Math.max(savedScrollBottom, terminal.rows - 1)
      storage.addImage(drawable)
      if (typeof storage._lastId === 'number')
        ownedStorageIds.set(kittyId, storage._lastId)
    }
    finally {
      coreBuffer.x = savedX
      coreBuffer.y = savedY
      if (typeof savedScrollBottom === 'number')
        coreBuffer.scrollBottom = savedScrollBottom
    }

    const spanRows = Math.max(1, Math.ceil(drawable.height / cellH))
    const endRow = Math.min(terminal.rows - 1, placement.y + spanRows - 1)
    if (typeof terminal.refresh === 'function')
      terminal.refresh(placement.y, Math.max(placement.y, endRow))
  }

  function finalizeTransmit(params: KittyParams, base64Payload: string): string {
    const medium = params.t ?? 'd'
    if (medium !== 'd')
      return ''

    const format = params.f ?? 32
    if (format !== 24 && format !== 32 && format !== 100)
      return ''

    const id = isPositiveInt(params.i) ? params.i : --autoId
    const cols = isPositiveInt(params.c) ? params.c : 0
    const rows = isPositiveInt(params.r) ? params.r : 0
    const bytes = decodeBase64(base64Payload)
    if (!bytes || bytes.byteLength === 0)
      return ''

    const recordGeneration = ++generation
    const record: KittyImageRecord = {
      id,
      cols,
      rows,
      source: null,
      pending: null,
      generation: recordGeneration,
    }

    if ((format === 24 || format === 32) && params.o !== 'z') {
      if (!isPositiveInt(params.s) || !isPositiveInt(params.v))
        return ''
      const canvas = buildCanvasFromRawPixels(bytes, format, params.s, params.v)
      if (!canvas)
        return ''
      record.source = canvas
    }
    else {
      record.pending = (async () => {
        const raw = params.o === 'z' ? await decompressZlib(bytes) : bytes
        if (!raw || disposed)
          return null
        if (format === 100)
          return await decodePng(raw)
        if (!isPositiveInt(params.s) || !isPositiveInt(params.v))
          return null
        return buildCanvasFromRawPixels(raw, format, params.s, params.v)
      })().then((decoded) => {
        record.pending = null
        if (disposed || images.get(id)?.generation !== recordGeneration) {
          closeDrawable(decoded)
          return null
        }
        record.source = decoded
        const placement = placements.get(id)
        if (decoded && placement)
          applyImageToStorage(id, record, placement)
        return decoded
      })
    }

    storeImageRecord(record)

    const action = params.a ?? 't'
    if (action === 'T' && params.U !== 1)
      return `${ESC}]${KITTY_INTERNAL_OSC};d;${id}${BEL}`
    return ''
  }

  function handleKittyApc(body: string): string {
    const semi = body.indexOf(';')
    const header = semi >= 0 ? body.slice(0, semi) : body
    const payload = semi >= 0 ? body.slice(semi + 1) : ''
    const params = parseKittyParams(header)

    if (pendingTransmit) {
      if (pendingTransmit.totalChars + payload.length <= MAX_APC_RAW_CHARS) {
        pendingTransmit.chunks.push(payload)
        pendingTransmit.totalChars += payload.length
      }
      else {
        pendingTransmit = null
        return ''
      }
      if (params.m === 1)
        return ''
      const completed = pendingTransmit
      pendingTransmit = null
      return finalizeTransmit(completed.params, completed.chunks.join(''))
    }

    const action = params.a ?? (params.m === 1 || payload.length > 0 ? 't' : '')
    if (action === 'q')
      return ''

    if (action === 'd') {
      const selector = params.d ?? 'a'
      const targetId = isPositiveInt(params.i) ? params.i : 0
      return `${ESC}]${KITTY_INTERNAL_OSC};x;${selector};${targetId}${BEL}`
    }

    if (action === 'p') {
      if (params.U === 1 || !isPositiveInt(params.i))
        return ''
      return `${ESC}]${KITTY_INTERNAL_OSC};d;${params.i}${BEL}`
    }

    if (action === 't' || action === 'T') {
      if (params.m === 1) {
        if (payload.length <= MAX_APC_RAW_CHARS) {
          pendingTransmit = {
            params,
            chunks: [payload],
            totalChars: payload.length,
          }
        }
        return ''
      }
      return finalizeTransmit(params, payload)
    }

    return ''
  }

  function handleInternalOsc(payload: string): boolean {
    const [op, arg1, arg2] = payload.split(';')
    if (op === 'x') {
      const selector = (arg1 ?? 'a').toLowerCase()
      const targetId = Number.parseInt(arg2 ?? '0', 10)
      if (selector === 'i' && Number.isFinite(targetId) && targetId > 0)
        deleteKittyImage(targetId)
      else
        deleteAllKittyImages()
      return true
    }

    const id = Number.parseInt(arg1 ?? '', 10)
    if (!Number.isFinite(id) || id === 0)
      return true

    if (op === 'p' || op === 'd') {
      const active = terminal.buffer.active
      const x = typeof active.cursorX === 'number' ? active.cursorX : 0
      const y = typeof active.cursorY === 'number' ? active.cursorY : 0
      const bufferType = active.type === 'alternate' ? 'alternate' : 'normal'
      placements.set(id, { x, y, bufferType, direct: op === 'd' })
      dirtyPlacements.add(id)
      return true
    }

    if (op === 't') {
      if (placements.has(id))
        dirtyPlacements.add(id)
      return true
    }

    return true
  }

  if (typeof terminal.parser?.registerOscHandler === 'function') {
    disposables.push(
      terminal.parser.registerOscHandler(KITTY_INTERNAL_OSC, handleInternalOsc),
    )
  }

  if (typeof terminal.buffer?.onBufferChange === 'function') {
    disposables.push(
      terminal.buffer.onBufferChange(() => {
        const currentType = terminal.buffer.active.type === 'alternate' ? 'alternate' : 'normal'
        for (const [id, placement] of placements.entries()) {
          if (placement.bufferType !== currentType) {
            placements.delete(id)
            dirtyPlacements.delete(id)
            evictStorageImage(id)
          }
        }
      }),
    )
  }

  function transformString(chunk: string): string {
    if (
      !pendingTail
      && !pendingTransmit
      && images.size === 0
      && currentFgImageId === 0
      && !chunk.includes(`${ESC}_G`)
      && !chunk.includes(KITTY_PLACEHOLDER)
      && !chunk.endsWith(ESC)
      && !chunk.endsWith(`${ESC}_`)
      && !chunk.endsWith(KITTY_PLACEHOLDER_HIGH_SURROGATE)
    ) {
      return chunk
    }

    const input = pendingTail ? pendingTail + chunk : chunk
    pendingTail = ''

    let output = ''
    let cursor = 0
    const touchedInChunk = new Set<number>()
    let i = 0

    while (i < input.length) {
      const ch = input[i]!

      // Escape sequence (APC Kitty or CSI SGR color tracking)
      if (ch === ESC) {
        if (i + 1 >= input.length) {
          output += input.slice(cursor, i)
          pendingTail = input.slice(i)
          return output
        }
        const next = input[i + 1]!

        // APC: ESC _ G ... (ST | BEL)
        if (next === '_') {
          if (i + 2 >= input.length) {
            output += input.slice(cursor, i)
            pendingTail = input.slice(i)
            return output
          }
          if (input[i + 2] === 'G') {
            const term = findEscTerminator(input, i + 3)
            if (!term) {
              output += input.slice(cursor, i)
              const tail = input.slice(i)
              if (tail.length <= MAX_APC_RAW_CHARS)
                pendingTail = tail
              return output
            }
            output += input.slice(cursor, i)
            const marker = handleKittyApc(input.slice(i + 3, term.index))
            if (marker)
              output += marker
            i = term.index + term.length
            cursor = i
            continue
          }
        }

        // CSI: ESC [ <params> <final> — inspect SGR (`m`) to track 24-bit foreground image ID
        if (next === '[') {
          let j = i + 2
          while (j < input.length) {
            const code = input.charCodeAt(j)
            if (code >= 0x40 && code <= 0x7E)
              break
            j++
          }
          if (j >= input.length) {
            // Only hold short incomplete CSI tails; avoid stalling on malformed input.
            if (input.length - i <= 64) {
              output += input.slice(cursor, i)
              pendingTail = input.slice(i)
              return output
            }
            i += 2
            continue
          }
          if (input[j] === 'm')
            currentFgImageId = parseSgrForegroundImageId(input.slice(i + 2, j), currentFgImageId)
          i = j + 1
          continue
        }

        i += 2
        continue
      }

      // Trailing lone high surrogate of U+10EEEE split across chunks
      if (ch === KITTY_PLACEHOLDER_HIGH_SURROGATE) {
        if (i + 1 >= input.length) {
          output += input.slice(cursor, i)
          pendingTail = input.slice(i)
          return output
        }
        if (input[i + 1] === KITTY_PLACEHOLDER_LOW_SURROGATE) {
          // Hold near-end placeholders whose trailing combining diacritics may arrive next chunk.
          let j = i + 2
          const diacritics: number[] = []
          let hitEndWhileScanningDiacritics = false
          while (diacritics.length < 3) {
            if (j >= input.length) {
              hitEndWhileScanningDiacritics = true
              break
            }
            const cp = input.codePointAt(j)!
            const cpLen = cp > 0xFFFF ? 2 : 1
            if (cp >= 0xD800 && cp <= 0xDBFF && j + 1 >= input.length) {
              hitEndWhileScanningDiacritics = true
              break
            }
            const charStr = String.fromCodePoint(cp)
            if (!COMBINING_MARK_RE.test(charStr))
              break
            diacritics.push(cp)
            j += cpLen
          }

          if (hitEndWhileScanningDiacritics && diacritics.length < 2) {
            output += input.slice(cursor, i)
            pendingTail = input.slice(i)
            return output
          }

          output += input.slice(cursor, i)

          const imageId = currentFgImageId
          const isOrigin = diacritics.length >= 1
            && diacritics[0] === KITTY_ORIGIN_DIACRITIC
            && (diacritics.length === 1 || diacritics[1] === KITTY_ORIGIN_DIACRITIC)

          if (imageId > 0) {
            if (isOrigin) {
              output += `${ESC}]${KITTY_INTERNAL_OSC};p;${imageId}${BEL}`
              touchedInChunk.add(imageId)
            }
            else if (!touchedInChunk.has(imageId)) {
              output += `${ESC}]${KITTY_INTERNAL_OSC};t;${imageId}${BEL}`
              touchedInChunk.add(imageId)
            }
          }

          // Always replace U+10EEEE + diacritics with a plain space so missing-glyph tofu never paints.
          output += ' '
          i = j
          cursor = i
          continue
        }
      }

      i++
    }

    if (cursor === 0)
      return input
    output += input.slice(cursor)
    return output
  }

  return {
    transform(data: TerminalData): TerminalData {
      if (disposed)
        return data
      if (typeof data === 'string')
        return transformString(data)
      if (!pendingTail && !pendingTransmit && images.size === 0 && !uint8MayContainKitty(data))
        return data
      return transformString(decoder.decode(data, { stream: true }))
    },

    flush(): void {
      if (disposed)
        return
      if (needsFullRefresh) {
        needsFullRefresh = false
        if (typeof terminal.refresh === 'function')
          terminal.refresh(0, Math.max(0, terminal.rows - 1))
      }
      if (dirtyPlacements.size === 0)
        return
      const pendingIds = [...dirtyPlacements]
      dirtyPlacements.clear()
      for (const id of pendingIds) {
        const placement = placements.get(id)
        const record = images.get(id)
        if (!placement || !record)
          continue
        if (record.source)
          applyImageToStorage(id, record, placement)
      }
    },

    reset(): void {
      pendingTail = ''
      pendingTransmit = null
      currentFgImageId = 0
      needsFullRefresh = false
      deleteAllKittyImages()
    },

    dispose(): void {
      if (disposed)
        return
      disposed = true
      for (const disposable of disposables.splice(0))
        disposable.dispose()
      pendingTail = ''
      pendingTransmit = null
      currentFgImageId = 0
      for (const record of images.values())
        closeDrawable(record.source)
      images.clear()
      placements.clear()
      dirtyPlacements.clear()
      ownedStorageIds.clear()
    },
  }
}
