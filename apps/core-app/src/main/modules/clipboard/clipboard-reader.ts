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
export interface ClipboardReader {
  readonly kind: 'native' | 'electron'
  readText(): Promise<string>
  readHtml(): Promise<string>
  readFiles(): Promise<string[]>
  /** Resolves to `null` when the clipboard holds no decodable image. */
  readImage(): Promise<NativeImage | null>
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
  getImageBinary?: () => Promise<number[]>
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
    try {
      const bytes = await this.module.getImageBinary?.()
      if (!bytes || bytes.length === 0) return null
      const image = nativeImage.createFromBuffer(Buffer.from(bytes))
      return image.isEmpty() ? null : image
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
}
