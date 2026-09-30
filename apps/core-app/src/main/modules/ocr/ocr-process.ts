import { Buffer } from 'node:buffer'
import process from 'node:process'
import { getNativeOcrSupport, recognizeImageText } from '@talex-touch/tuff-native'
import type { NativeOcrOptions } from '@talex-touch/tuff-native'
import type { OcrProcessRequest, OcrProcessSuccessMessage } from './ocr-process-client'

interface UtilityParentPort {
  once(event: 'message', listener: (event: { data: unknown }) => void): void
  off(event: 'message', listener: (event: { data: unknown }) => void): void
  postMessage(message: unknown): void
}

/**
 * OCR child entry. The main process forks one of these per request, so a native hang or SIGABRT
 * is contained to this process. The listener is detached before settling and the process is then
 * scheduled to exit (never mid-native-callback) so a finished job cannot hold the child open.
 */

const OCR_PROCESS_INVALID_REQUEST = 'OCR_PROCESS_INVALID_REQUEST'

function toNativeImage(value: unknown): Buffer {
  // Structured clone delivers a Uint8Array view; wrap the same memory (never copy) as a Buffer.
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  }
  throw new Error(OCR_PROCESS_INVALID_REQUEST)
}

function parseRequest(value: unknown): OcrProcessRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(OCR_PROCESS_INVALID_REQUEST)
  }
  const payload = value as Record<string, unknown>
  if (payload.type !== 'ocr.request') throw new Error(OCR_PROCESS_INVALID_REQUEST)
  if (typeof payload.requestId !== 'string' || payload.requestId.length === 0) {
    throw new Error(OCR_PROCESS_INVALID_REQUEST)
  }
  const options = payload.options
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error(OCR_PROCESS_INVALID_REQUEST)
  }
  return { type: 'ocr.request', requestId: payload.requestId, options: options as NativeOcrOptions }
}

function toNativeOptions(options: NativeOcrOptions): NativeOcrOptions {
  const image = toNativeImage((options as unknown as { image: unknown }).image)
  const normalized: NativeOcrOptions = { image }
  if (typeof options.languageHint === 'string') normalized.languageHint = options.languageHint
  if (typeof options.includeLayout === 'boolean') normalized.includeLayout = options.includeLayout
  if (typeof options.maxBlocks === 'number') normalized.maxBlocks = options.maxBlocks
  return normalized
}

function toErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && code.length > 0 ? code : undefined
}

async function run(): Promise<void> {
  const port = (process as NodeJS.Process & { parentPort?: UtilityParentPort }).parentPort
  if (!port) {
    throw new Error('OCR process requires an Electron utility parent port')
  }

  const handleRequest = (event: { data: unknown }): void => {
    port.off('message', handleRequest)

    const settle = (message: unknown): void => {
      port.postMessage(message)
      // Exit only once the native callback has returned and the reply is queued. Calling
      // process.exit() from inside the N-API completion stack is what aborted the old worker.
      setImmediate(() => process.exit(0))
    }

    let request: OcrProcessRequest
    try {
      request = parseRequest(event.data)
    } catch {
      // Identity is unknown, so the parent cannot match a reply; it settles on child exit.
      setImmediate(() => process.exit(1))
      return
    }

    const { requestId } = request
    void (async () => {
      try {
        const support = getNativeOcrSupport()
        if (!support.supported) {
          settle({
            type: 'ocr.error',
            requestId,
            message: `Native OCR unavailable on ${support.platform}: ${support.reason || 'unsupported'}`
          })
          return
        }

        const result = await recognizeImageText(toNativeOptions(request.options))
        const success: OcrProcessSuccessMessage = {
          type: 'ocr.success',
          requestId,
          result: {
            text: result.text ?? '',
            confidence: result.confidence,
            language: result.language ?? request.options.languageHint,
            blocks: result.blocks,
            engine: result.engine,
            durationMs: result.durationMs
          }
        }
        settle(success)
      } catch (error) {
        settle({
          type: 'ocr.error',
          requestId,
          code: toErrorCode(error),
          message: error instanceof Error ? error.message : String(error)
        })
      }
    })()
  }

  port.once('message', handleRequest)
}

run().catch(() => {
  process.exit(1)
})
