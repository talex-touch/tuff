import type { UserMessageAttachment } from '@talex-touch/tuff-intelligence/pilot'
import type { H3Event } from 'h3'
import type { QuotaUserTurnAttachment } from './quota-history-codec'
import { buildPilotTitleMessages } from '@talex-touch/tuff-intelligence/pilot'
import { getRequestURL } from 'h3'
import { resolvePilotAttachmentDeliveriesOrThrow } from './pilot-attachment-delivery'
import { getQuotaUploadObject } from './quota-upload-store'

const QUOTA_MODEL_ALIASES = new Set([
  'this-title',
  'this-normal',
  'this-normal-turbo',
  'this-normal-ultra',
  'this-normal-ultimate',
])

const TITLE_STREAM_CHUNK_SIZE = 6

export function resolveExecutorModel(rawModel: unknown, fallbackModel: string): string {
  const candidate = String(rawModel || '').trim()
  if (!candidate) {
    return fallbackModel
  }
  if (QUOTA_MODEL_ALIASES.has(candidate.toLowerCase())) {
    return fallbackModel
  }
  return candidate
}

export function splitTextIntoChunks(text: string, chunkSize = 24): string[] {
  const chars = Array.from(text)
  if (chars.length <= chunkSize) {
    return [text]
  }

  const chunks: string[] = []
  for (let index = 0; index < chars.length; index += chunkSize) {
    chunks.push(chars.slice(index, index + chunkSize).join(''))
  }
  return chunks
}

export function toTitleMessages(messages: unknown): Array<{ role: string, content: string }> {
  return buildPilotTitleMessages(messages).map(item => ({
    role: item.role,
    content: item.content,
  }))
}

function resolveAbsoluteAttachmentUrl(event: H3Event, input: string): string {
  const raw = String(input || '').trim()
  if (!raw) {
    return ''
  }
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) {
    return raw
  }
  if (!raw.startsWith('/')) {
    return raw
  }
  const requestUrl = getRequestURL(event)
  return `${requestUrl.protocol}//${requestUrl.host}${raw}`
}

function parseQuotaUploadIdFromUrl(input: string): string {
  const raw = String(input || '').trim()
  if (!raw) {
    return ''
  }

  let pathname = raw
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      pathname = new URL(raw).pathname
    }
    catch {
      return ''
    }
  }

  const match = pathname.match(/\/api\/tools\/upload\/content\/([^/?#]+)/)
  if (!match) {
    return ''
  }
  try {
    return decodeURIComponent(match[1] || '')
  }
  catch {
    return String(match[1] || '')
  }
}

export async function resolveCompatAttachments(
  event: H3Event,
  rawAttachments: QuotaUserTurnAttachment[],
): Promise<{
  attachments: UserMessageAttachment[]
  summary: Record<string, unknown>
}> {
  if (!Array.isArray(rawAttachments) || rawAttachments.length <= 0) {
    return {
      attachments: [],
      summary: {
        total: 0,
        resolved: 0,
        unresolved: 0,
        idCount: 0,
        urlCount: 0,
        base64Count: 0,
        loadedObjectCount: 0,
        inlinedImageBytes: 0,
        inlinedFileBytes: 0,
      },
    }
  }

  const deliveryInputs = []
  for (let index = 0; index < rawAttachments.length; index += 1) {
    const item = rawAttachments[index]
    const rawValue = String(item.value || '').trim()
    if (!rawValue) {
      continue
    }

    const id = randomId('compat-attachment')
    const ref = resolveAbsoluteAttachmentUrl(event, rawValue)
    const uploadId = parseQuotaUploadIdFromUrl(rawValue)
    const itemData = String(item.data || '').trim()
    const dataUrlFromValue = rawValue.startsWith('data:') ? rawValue : ''
    const dataUrl = dataUrlFromValue || (itemData.startsWith('data:') ? itemData : '')
    const inferredMimeType = item.type === 'file' && !itemData.startsWith('data:')
      ? itemData
      : undefined

    deliveryInputs.push({
      id,
      type: item.type,
      ref,
      name: item.name,
      mimeType: inferredMimeType,
      previewUrl: ref,
      modelUrl: ref,
      dataUrl,
      loadObject: uploadId
        ? async () => {
          const object = getQuotaUploadObject(uploadId)
          if (!object || object.data.byteLength <= 0) {
            return null
          }
          return {
            bytes: object.data,
            mimeType: object.mimeType,
            size: object.data.byteLength,
          }
        }
        : undefined,
    })
  }

  const resolved = await resolvePilotAttachmentDeliveriesOrThrow(deliveryInputs, {
    concurrency: 3,
  })
  return {
    attachments: resolved.attachments,
    summary: resolved.summary as unknown as Record<string, unknown>,
  }
}

export function createTitleSseResponse(title: string): Response {
  const encoder = new TextEncoder()
  const value = String(title || '').trim()
  const chunks = splitTextIntoChunks(value, TITLE_STREAM_CHUNK_SIZE)
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'status_updated', status: 'start', id: 'assistant' })}\n\n`))
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'status_updated', status: 'progress', id: 'assistant' })}\n\n`))
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          event: 'completion',
          id: 'assistant',
          name: 'assistant',
          content: chunk,
          completed: false,
        })}\n\n`))
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        event: 'completion',
        id: 'assistant',
        name: 'assistant',
        content: '',
        completed: true,
      })}\n\n`))
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'status_updated', status: 'end', id: 'assistant' })}\n\n`))
      controller.enqueue(encoder.encode('data: [DONE]\\n\\n'))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  })
}

export function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString().slice(-6)}`
}

function createExecutorTimeoutError(timeoutMs: number): Error {
  const safeTimeout = Math.max(3_000, Math.floor(timeoutMs))
  const error = new Error(`[executor-timeout] stream stalled for ${safeTimeout}ms`)
  Object.assign(error, {
    code: 'EXECUTOR_STREAM_TIMEOUT',
    statusCode: 504,
    statusMessage: 'Gateway Timeout',
    phase: 'upstream.stream.wait',
  })
  return error
}

export async function runWithExecutorTimeout<T>(task: () => Promise<T>, timeoutMs: number): Promise<T> {
  const safeTimeout = Math.max(3_000, Math.floor(timeoutMs))
  return await new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      reject(createExecutorTimeoutError(safeTimeout))
    }, safeTimeout)

    task()
      .then((result) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        resolve(result)
      })
      .catch((error) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        reject(error)
      })
  })
}
