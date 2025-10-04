import { parentPort, workerData } from 'node:worker_threads'
import { readFile } from 'node:fs/promises'
import { createWorker } from 'tesseract.js'

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

  const worker = await createWorker(language, undefined, {
    logger: (_message) => undefined,
    cacheMethod: 'read',
    gzip: true
  })

  try {
    if (payload.options.config || payload.options.tesseditPagesegMode !== undefined) {
      const parameters: Record<string, string> = {}
      if (payload.options.config) {
        for (const [key, value] of Object.entries(payload.options.config)) {
          parameters[key] = String(value)
        }
      }
      parameters['tessedit_pageseg_mode'] = String(payload.options.tesseditPagesegMode ?? 3)
      await worker.setParameters(parameters)
    }

    const { data } = await worker.recognize(buffer)

    parentPort?.postMessage({
      status: 'success',
      jobId: payload.jobId,
      text: data.text ?? '',
      confidence: data.confidence ?? 0,
      language,
      extra: {
        symbols: data.symbols?.length ?? 0,
        words: data.words?.length ?? 0,
        lines: data.lines?.length ?? 0
      }
    })
  } catch (error) {
    parentPort?.postMessage({
      status: 'error',
      jobId: payload.jobId,
      error: error instanceof Error ? error.message : String(error)
    })
  } finally {
    await worker.terminate()
  }
}

run().catch((error) => {
  parentPort?.postMessage({
    status: 'error',
    jobId: (workerData as WorkerData).jobId,
    error: error instanceof Error ? error.message : String(error)
  })
})
