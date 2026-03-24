import { readFile } from 'node:fs/promises'
import { parentPort, workerData } from 'node:worker_threads'
import { getNativeOcrSupport, recognizeImageText } from '@talex-touch/tuff-native'

interface WorkerData {
  jobId: number
  clipboardId: number | null
  payloadHash: string | null
  source: {
    type: 'data-url' | 'file'
    dataUrl?: string
    filePath?: string
  }
  options: {
    language: string
    tesseditPagesegMode?: number
    config?: Record<string, string | number | boolean>
  }
}

interface WorkerSuccessMessage {
  status: 'success'
  jobId: number
  result: {
    text: string
    confidence?: number
    language?: string
    blocks?: unknown[]
    engine?: string
    durationMs?: number
    raw?: unknown
  }
}

interface WorkerErrorMessage {
  status: 'error'
  jobId: number
  error: string
}

function decodeDataUrl(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/)
  const base64 = match ? match[2] : dataUrl
  return Buffer.from(base64, 'base64')
}

async function loadImageBuffer(source: WorkerData['source']): Promise<Buffer> {
  if (source.type === 'file') {
    if (!source.filePath) {
      throw new Error('Missing file path for OCR job')
    }
    return readFile(source.filePath)
  }

  if (!source.dataUrl) {
    throw new Error('Missing image data for OCR job')
  }

  return decodeDataUrl(source.dataUrl)
}

async function run(): Promise<void> {
  const payload = workerData as WorkerData
  const language = payload.options.language || 'eng'
  const buffer = await loadImageBuffer(payload.source)

  const support = getNativeOcrSupport()
  if (!support.supported) {
    const message = `[OCR Worker] Native OCR unavailable on ${support.platform}: ${support.reason || 'unsupported'}`
    const errorPayload: WorkerErrorMessage = {
      status: 'error',
      jobId: payload.jobId,
      error: message
    }
    parentPort?.postMessage(errorPayload)
    return
  }

  try {
    const recognized = await recognizeImageText({
      image: buffer,
      languageHint: language,
      includeLayout: true,
      maxBlocks: 120
    })

    const successPayload: WorkerSuccessMessage = {
      status: 'success',
      jobId: payload.jobId,
      result: {
        text: recognized.text ?? '',
        confidence: recognized.confidence,
        language: recognized.language || language,
        blocks: recognized.blocks,
        engine: recognized.engine,
        durationMs: recognized.durationMs,
        raw: recognized
      }
    }
    parentPort?.postMessage(successPayload)
  } catch (error) {
    const errorPayload: WorkerErrorMessage = {
      status: 'error',
      jobId: payload.jobId,
      error: error instanceof Error ? error.message : String(error)
    }
    parentPort?.postMessage(errorPayload)
  }
}

run().catch((error) => {
  const payload: WorkerErrorMessage = {
    status: 'error',
    jobId: (workerData as WorkerData).jobId,
    error: error instanceof Error ? error.message : String(error)
  }
  parentPort?.postMessage(payload)
})
