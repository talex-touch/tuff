import type { NativeImage } from 'electron'
import { clipboard, nativeImage } from 'electron'

/**
 * Async, single-source reader for the OS clipboard.
 *
 * The capture pipeline resolves exactly one reader per capture, so every read
 * within a capture comes from the same source — this preserves the "single
 * reader" invariant (no two readers disagreeing on clipboard state) while
 * letting the expensive reads happen off the main-process event loop when a
 * native reader is available.
 *
 * Background: reads used to block the event loop because they went through
 * Electron's synchronous `clipboard.readImage()`/`readText()` on the main
 * thread (a large image could freeze the loop for seconds). The native reader
 * moves the pasteboard read onto `@crosscopy`'s native background thread.
 */
export interface ClipboardImageRead {
  image: NativeImage
  /**
   * The PNG bytes the OS already holds for this image, when the source can hand them over.
   * The capture pipeline persists them as-is instead of re-encoding: `NativeImage.toPNG()`
   * is synchronous on the main thread and cost 1.4s for one 2000x1360 screenshot (2026-10-08).
   */
  png: Buffer | null
}

export interface ClipboardReader {
  readonly kind: 'native' | 'electron'
  readText(): Promise<string>
  readHtml(): Promise<string>
  readFiles(): Promise<string[]>
  /** Resolves to `null` when the clipboard holds no decodable image. */
  readImage(): Promise<NativeImage | null>
  /** Like `readImage`, plus the already-encoded PNG bytes when the source has them. */
  readImageWithEncoded?(): Promise<ClipboardImageRead | null>
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_IHDR_TAG = Buffer.from('IHDR')
const PNG_MIN_IHDR_BYTES = 24

/** True when `buffer` starts with the PNG file signature. */
export function isPngBuffer(buffer: Buffer): boolean {
  return (
    buffer.length > PNG_SIGNATURE.length &&
    buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  )
}

/**
 * Reads width and height directly from a PNG `IHDR` header without decoding pixel data.
 * Returns `null` when `buffer` is shorter than 24 bytes, lacks a valid PNG/IHDR header,
 * or declares zero dimensions.
 */
export function parsePngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (!Buffer.isBuffer(buffer) || buffer.length < PNG_MIN_IHDR_BYTES) {
    return null
  }
  if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return null
  }
  if (!buffer.subarray(12, 16).equals(PNG_IHDR_TAG)) {
    return null
  }
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  if (width <= 0 || height <= 0) {
    return null
  }
  return { width, height }
}

/**
 * Wraps already-encoded PNG bytes in a `NativeImage` facade whose common metadata/persistence
 * methods (`isEmpty`, `getSize`, `toPNG`) answer directly from `buffer` + `dimensions` without
 * running synchronous `nativeImage.createFromBuffer` on the main thread. Any other `NativeImage`
 * operation lazily decodes once on demand.
 */
export function createLazyPngNativeImage(
  buffer: Buffer,
  dimensions: { width: number; height: number }
): NativeImage {
  let decoded: NativeImage | null = null
  const ensureDecoded = (): NativeImage => {
    decoded ??= nativeImage.createFromBuffer(buffer)
    return decoded
  }
  const target = {} as NativeImage
  return new Proxy(target, {
    get(_target, prop) {
      if (prop === 'isEmpty') {
        return () => false
      }
      if (prop === 'getSize') {
        return () => ({ width: dimensions.width, height: dimensions.height })
      }
      if (prop === 'toPNG') {
        return () => buffer
      }
      if (prop === 'then' || typeof prop === 'symbol') {
        return Reflect.get(_target, prop)
      }
      const image = ensureDecoded()
      const value = Reflect.get(image as object, prop, image)
      return typeof value === 'function' ? value.bind(image) : value
    }
  })
}

/** Pasteboard formats under which the platform exposes raw PNG bytes. */
function resolveNativePngFormats(platform: NodeJS.Platform): string[] {
  if (platform === 'darwin') return ['public.png']
  if (platform === 'win32') return ['PNG']
  return ['image/png']
}

/**
 * Subset of `@crosscopy/clipboard` we depend on for reads. Each method resolves
 * from the module's native background thread, so awaiting them never blocks the
 * JS main-process event loop on the pasteboard read itself.
 */
export interface NativeClipboardReaderModule {
  getText?: () => Promise<string>
  getHtml?: () => Promise<string>
  getFiles?: () => Promise<string[]>
  getImageBinary?: () => Promise<Uint8Array | Buffer | number[]>
}

/** True when a resolved native module exposes the full async reader surface. */
export function hasNativeReaderApi(
  module: NativeClipboardReaderModule | null | undefined
): module is Required<NativeClipboardReaderModule> {
  return Boolean(
    module &&
    typeof module.getText === 'function' &&
    typeof module.getHtml === 'function' &&
    typeof module.getFiles === 'function' &&
    typeof module.getImageBinary === 'function'
  )
}

/**
 * Reads via `@crosscopy`'s native background thread. The pasteboard read never
 * blocks the JS event loop; only the final `createFromBuffer` decode of the
 * returned bytes runs on the main thread (mirrors the pre-refactor behaviour).
 * Each getter is defensive: a format the clipboard does not currently hold just
 * yields an empty value rather than throwing.
 */
export class NativeClipboardReader implements ClipboardReader {
  readonly kind = 'native' as const

  constructor(private readonly module: NativeClipboardReaderModule) {}

  async readText(): Promise<string> {
    try {
      return (await this.module.getText?.()) ?? ''
    } catch {
      return ''
    }
  }

  async readHtml(): Promise<string> {
    try {
      return (await this.module.getHtml?.()) ?? ''
    } catch {
      return ''
    }
  }

  async readFiles(): Promise<string[]> {
    try {
      return (await this.module.getFiles?.()) ?? []
    } catch {
      return []
    }
  }

  async readImage(): Promise<NativeImage | null> {
    return (await this.readImageWithEncoded())?.image ?? null
  }

  /** `getImageBinary` is documented as PNG bytes; `IHDR` parsing avoids eager main-thread decode. */
  async readImageWithEncoded(): Promise<ClipboardImageRead | null> {
    try {
      const bytes = await this.module.getImageBinary?.()
      if (!bytes || bytes.length === 0) return null
      const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
      const dimensions = parsePngDimensions(buffer)
      if (dimensions) {
        return { image: createLazyPngNativeImage(buffer, dimensions), png: buffer }
      }
      const image = nativeImage.createFromBuffer(buffer)
      if (image.isEmpty()) return null
      return { image, png: isPngBuffer(buffer) ? buffer : null }
    } catch {
      return null
    }
  }
}

export interface ElectronClipboardReaderDeps {
  /** File-path reader (Electron's clipboard has no first-class file read). */
  readFiles: () => string[]
}

/**
 * Fallback reader used when the native module is unavailable. Wraps Electron's
 * synchronous clipboard API in the async interface — it still blocks the loop
 * while reading, but only on the degraded path where there is no native watcher
 * (and therefore polling, with cooldowns) anyway.
 */
export class ElectronClipboardReader implements ClipboardReader {
  readonly kind = 'electron' as const

  constructor(private readonly deps: ElectronClipboardReaderDeps) {}

  async readText(): Promise<string> {
    return clipboard.readText()
  }

  async readHtml(): Promise<string> {
    return clipboard.readHTML()
  }

  async readFiles(): Promise<string[]> {
    return this.deps.readFiles()
  }

  async readImage(): Promise<NativeImage | null> {
    const image = clipboard.readImage()
    return image.isEmpty() ? null : image
  }

  async readImageWithEncoded(): Promise<ClipboardImageRead | null> {
    const png = this.readNativePng()
    if (png) {
      const dimensions = parsePngDimensions(png)
      if (dimensions) {
        return { image: createLazyPngNativeImage(png, dimensions), png }
      }
    }
    const image = await this.readImage()
    if (!image) return null
    return { image, png }
  }

  /** Raw PNG straight off the pasteboard, or `null` when the OS holds the image another way. */
  private readNativePng(): Buffer | null {
    for (const format of resolveNativePngFormats(process.platform)) {
      try {
        const buffer = clipboard.readBuffer(format)
        if (isPngBuffer(buffer)) return buffer
      } catch {
        // A format the clipboard does not hold right now; try the next spelling.
      }
    }
    return null
  }
}
