import path from 'node:path'
import { Worker } from 'node:worker_threads'
import type {
  PluginImageToolsImageMetadata,
  PluginImageToolsRenderedImage,
  PluginImageToolsRenderer,
  PluginImageToolsRenderRequest
} from './plugin-image-tools-capabilities'

const SAFE_WORKER_ERROR_CODES = new Set([
  'PLUGIN_HOST_CAPABILITY_CANCELLED',
  'PLUGIN_IMAGE_TOOLS_ANIMATED_INPUT',
  'PLUGIN_IMAGE_TOOLS_ICO_SQUARE_REQUIRED',
  'PLUGIN_IMAGE_TOOLS_INPUT_TOO_LARGE',
  'PLUGIN_IMAGE_TOOLS_INVALID_DIMENSIONS',
  'PLUGIN_IMAGE_TOOLS_OUTPUT_TOO_LARGE',
  'PLUGIN_IMAGE_TOOLS_UNSUPPORTED_FORMAT'
])

interface ImageToolsWorkerRequest {
  readonly operation: 'inspect' | 'render'
  readonly source: Buffer
  readonly request?: PluginImageToolsRenderRequest
}

function workerError(code: string): Error {
  const safeCode = SAFE_WORKER_ERROR_CODES.has(code) ? code : 'PLUGIN_IMAGE_TOOLS_RENDER_FAILED'
  return Object.assign(new Error(safeCode), { code: safeCode })
}

function readWorkerErrorCode(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return 'PLUGIN_IMAGE_TOOLS_RENDER_FAILED'
  const code = Object.getOwnPropertyDescriptor(value, 'code')?.value
  return typeof code === 'string' ? code : 'PLUGIN_IMAGE_TOOLS_RENDER_FAILED'
}

function normalizeWorkerResult(
  operation: ImageToolsWorkerRequest['operation'],
  value: unknown
): PluginImageToolsImageMetadata | PluginImageToolsRenderedImage {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw workerError('PLUGIN_IMAGE_TOOLS_RENDER_FAILED')
  if (operation === 'inspect') return value as PluginImageToolsImageMetadata
  const data = Object.getOwnPropertyDescriptor(value, 'data')?.value
  const width = Object.getOwnPropertyDescriptor(value, 'width')?.value
  const height = Object.getOwnPropertyDescriptor(value, 'height')?.value
  if (!(data instanceof Uint8Array)) throw workerError('PLUGIN_IMAGE_TOOLS_RENDER_FAILED')
  return {
    data: Buffer.from(data.buffer, data.byteOffset, data.byteLength),
    width: Number(width),
    height: Number(height)
  }
}

function runWorker(
  input: ImageToolsWorkerRequest,
  signal: AbortSignal
): Promise<PluginImageToolsImageMetadata | PluginImageToolsRenderedImage> {
  if (signal.aborted) return Promise.reject(workerError('PLUGIN_HOST_CAPABILITY_CANCELLED'))
  const source = Uint8Array.from(input.source)
  const worker = new Worker(path.join(__dirname, 'plugin-image-tools-worker.js'))

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (
      result?: PluginImageToolsImageMetadata | PluginImageToolsRenderedImage,
      error?: Error
    ): void => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      worker.removeAllListeners()
      void worker.terminate().catch(() => undefined)
      if (error) reject(error)
      else resolve(result!)
    }
    const onAbort = (): void => finish(undefined, workerError('PLUGIN_HOST_CAPABILITY_CANCELLED'))

    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) {
      onAbort()
      return
    }
    worker.once('message', (message: unknown) => {
      if (!message || typeof message !== 'object' || Array.isArray(message)) {
        finish(undefined, workerError('PLUGIN_IMAGE_TOOLS_RENDER_FAILED'))
        return
      }
      const ok = Object.getOwnPropertyDescriptor(message, 'ok')?.value
      if (ok === false) {
        finish(undefined, workerError(readWorkerErrorCode(message)))
        return
      }
      if (ok !== true) {
        finish(undefined, workerError('PLUGIN_IMAGE_TOOLS_RENDER_FAILED'))
        return
      }
      try {
        const value = Object.getOwnPropertyDescriptor(message, 'result')?.value
        finish(normalizeWorkerResult(input.operation, value))
      } catch (error) {
        finish(
          undefined,
          error instanceof Error ? error : workerError('PLUGIN_IMAGE_TOOLS_RENDER_FAILED')
        )
      }
    })
    worker.once('error', () => finish(undefined, workerError('PLUGIN_IMAGE_TOOLS_RENDER_FAILED')))
    worker.once('exit', () => finish(undefined, workerError('PLUGIN_IMAGE_TOOLS_RENDER_FAILED')))

    try {
      worker.postMessage(
        {
          operation: input.operation,
          source,
          ...(input.request === undefined ? {} : { request: input.request })
        },
        [source.buffer]
      )
    } catch {
      finish(undefined, workerError('PLUGIN_IMAGE_TOOLS_RENDER_FAILED'))
    }
  })
}

export function createWorkerPluginImageToolsRenderer(): PluginImageToolsRenderer {
  return Object.freeze({
    async inspect(source: Buffer, signal: AbortSignal): Promise<PluginImageToolsImageMetadata> {
      return (await runWorker(
        { operation: 'inspect', source },
        signal
      )) as PluginImageToolsImageMetadata
    },
    async render(
      source: Buffer,
      request: PluginImageToolsRenderRequest,
      signal: AbortSignal
    ): Promise<PluginImageToolsRenderedImage> {
      return (await runWorker(
        { operation: 'render', source, request },
        signal
      )) as PluginImageToolsRenderedImage
    }
  })
}
