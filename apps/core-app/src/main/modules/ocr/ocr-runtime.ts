import type { Buffer } from 'node:buffer'
import { app } from 'electron'
import type { IntelligenceVisionOcrPayload } from '@talex-touch/tuff-intelligence'
import type { NativeOcrResult } from '@talex-touch/tuff-native'
import {
  closeRustOcrHelper,
  getRustOcrHelperStatus,
  recognizeImageTextViaRustHelper
} from '@talex-touch/tuff-native/ocr-helper'
import { recognizeImageTextIsolated, type OcrProcessInvocation } from './ocr-process-client'

const FALLBACK_TO_UTILITY_ERROR_CODES = new Set([
  'OCR_HELPER_UNAVAILABLE',
  'OCR_HELPER_SPAWN_FAILED'
])

let quitHookRegistered = false

function ensureQuitCleanupHook(): void {
  if (quitHookRegistered) return
  if (typeof app?.once !== 'function') return
  quitHookRegistered = true
  app.once('before-quit', () => {
    closeRustOcrHelper()
  })
}

function createEmptyPayloadError(): Error & { code: string } {
  return Object.assign(new Error('Image payload is empty'), {
    code: 'ERR_OCR_DECODE_FAILED'
  })
}

function shouldFallbackToUtilityProcess(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && FALLBACK_TO_UTILITY_ERROR_CODES.has(code)
}

export interface RecognizeOcrSourceOptions {
  source: IntelligenceVisionOcrPayload['source']
  languageHint?: string
  includeLayout?: boolean
  maxBlocks?: number
  decodeBuffer: (source: IntelligenceVisionOcrPayload['source']) => Promise<Buffer>
}

/**
 * Runs native OCR outside the Electron main process. Prefers the persistent Rust `tuff-native-ocr`
 * helper (direct file reads, native ImageIO/WIC resize, warm Vision/WinRT reuse); falls back to
 * the one-shot utility process only when the Rust helper binary cannot be launched.
 */
export async function recognizeOcrSourceIsolated(
  options: RecognizeOcrSourceOptions,
  invocation?: OcrProcessInvocation
): Promise<NativeOcrResult> {
  const { source, languageHint, includeLayout, maxBlocks = 120, decodeBuffer } = options
  const rustStatus = getRustOcrHelperStatus()

  if (rustStatus.available) {
    ensureQuitCleanupHook()
    try {
      if (source.type === 'file' && source.filePath) {
        return await recognizeImageTextViaRustHelper(
          {
            filePath: source.filePath,
            languageHint,
            includeLayout,
            maxBlocks
          },
          invocation
        )
      }

      const image = await decodeBuffer(source)
      if (image.byteLength === 0) {
        throw createEmptyPayloadError()
      }
      return await recognizeImageTextViaRustHelper(
        {
          image,
          languageHint,
          includeLayout,
          maxBlocks
        },
        invocation
      )
    } catch (error) {
      if (!shouldFallbackToUtilityProcess(error)) {
        throw error
      }
    }
  }

  const image = await decodeBuffer(source)
  if (image.byteLength === 0) {
    throw createEmptyPayloadError()
  }
  return await recognizeImageTextIsolated(
    {
      image,
      languageHint,
      includeLayout,
      maxBlocks
    },
    invocation
  )
}

export function closePreferredOcrRuntime(): void {
  closeRustOcrHelper()
}
