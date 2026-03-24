import type {
  AgentEngineAdapter,
  DeepAgentAuditRecord,
  TurnState,
  UserMessageAttachment,
} from '@talex-touch/tuff-intelligence/pilot'
import { shouldIncludePilotMessageInModelContext } from '@talex-touch/tuff-intelligence/pilot'
import { networkClient, parseHttpStatusCode } from '@talex-touch/utils/network'

const DEFAULT_TIMEOUT_MS = 90_000
const MIN_TIMEOUT_MS = 3_000
const MAX_TIMEOUT_MS = 10 * 60 * 1000
const DEFAULT_STREAM_MODE = 'messages-tuple'

export interface LangGraphLocalServerEngineOptions {
  baseUrl: string
  apiKey?: string
  assistantId: string
  graphProfile?: string
  timeoutMs?: number
  metadata?: Record<string, unknown>
  onAudit?: (record: DeepAgentAuditRecord) => Promise<void> | void
}

interface ParsedSseFrame {
  event: string
  data: string
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeTimeoutMs(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TIMEOUT_MS
  }
  return Math.min(Math.max(Math.floor(parsed), MIN_TIMEOUT_MS), MAX_TIMEOUT_MS)
}

function trimSuffixSlash(value: string): string {
  return normalizeText(value).replace(/\/+$/, '')
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name || 'unknown_error'
  }
  return String(error || 'unknown_error')
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function parseSseFrame(frame: string): ParsedSseFrame | null {
  const lines = frame.split('\n')
  let event = ''
  const dataLines: string[] = []

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line || line.startsWith(':')) {
      continue
    }
    if (line.startsWith('event:')) {
      const value = line.slice(6)
      event = value.startsWith(' ') ? value.slice(1) : value
      continue
    }
    if (line.startsWith('data:')) {
      const value = line.slice(5)
      dataLines.push(value.startsWith(' ') ? value.slice(1) : value)
    }
  }

  if (dataLines.length <= 0) {
    return null
  }

  return {
    event: normalizeText(event) || 'message',
    data: dataLines.join('\n'),
  }
}

function extractTextFromContentArray(content: unknown[]): string {
  const chunks: string[] = []

  for (const item of content) {
    if (typeof item === 'string') {
      if (item) {
        chunks.push(item)
      }
      continue
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }

    const row = item as Record<string, unknown>
    const inlineText = normalizeText(row.text) || normalizeText(row.value) || normalizeText(row.content)
    if (inlineText) {
      chunks.push(inlineText)
      continue
    }

    if (Array.isArray(row.content)) {
      const nested = extractTextFromContentArray(row.content)
      if (nested) {
        chunks.push(nested)
      }
    }
  }

  return chunks.join('')
}

function extractTextFromMessageLike(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (!value || typeof value !== 'object') {
    return ''
  }

  if (Array.isArray(value)) {
    return extractTextFromContentArray(value)
  }

  const row = value as Record<string, unknown>
  if (typeof row.content === 'string') {
    return row.content
  }
  if (Array.isArray(row.content)) {
    return extractTextFromContentArray(row.content)
  }
  if (typeof row.text === 'string') {
    return row.text
  }
  if (typeof row.output_text === 'string') {
    return row.output_text
  }
  if (row.delta) {
    const text = extractTextFromMessageLike(row.delta)
    if (text) {
      return text
    }
  }
  if (row.message) {
    const text = extractTextFromMessageLike(row.message)
    if (text) {
      return text
    }
  }
  if (row.chunk) {
    const text = extractTextFromMessageLike(row.chunk)
    if (text) {
      return text
    }
  }
  if (row.data) {
    const text = extractTextFromMessageLike(row.data)
    if (text) {
      return text
    }
  }

  return ''
}

function extractEventDelta(eventName: string, payload: unknown): string {
  const event = normalizeText(eventName).toLowerCase()

  if (Array.isArray(payload)) {
    if (event.includes('messages')) {
      return extractTextFromMessageLike(payload[0])
    }
    const candidate = payload.find(item => Boolean(extractTextFromMessageLike(item)))
    return extractTextFromMessageLike(candidate)
  }

  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const row = payload as Record<string, unknown>

  if (event.includes('messages')) {
    if (Array.isArray(row.data)) {
      return extractEventDelta(eventName, row.data)
    }
    if (row.message) {
      return extractTextFromMessageLike(row.message)
    }
    if (row.chunk) {
      return extractTextFromMessageLike(row.chunk)
    }
  }

  if (row.data) {
    const text = extractEventDelta(eventName, row.data)
    if (text) {
      return text
    }
  }

  return extractTextFromMessageLike(payload)
}

function normalizeStreamDelta(fullText: string, nextText: string): string {
  const candidate = String(nextText || '')
  if (!candidate) {
    return ''
  }
  if (!fullText) {
    return candidate
  }
  if (candidate === fullText) {
    return ''
  }
  if (candidate.startsWith(fullText)) {
    return candidate.slice(fullText.length)
  }
  if (fullText.endsWith(candidate)) {
    return ''
  }
  return candidate
}

function renderAttachmentHint(attachments: UserMessageAttachment[] | undefined): string {
  if (!Array.isArray(attachments) || attachments.length <= 0) {
    return ''
  }
  const lines = attachments.map((item, index) => {
    const parts = [
      `#${index + 1}`,
      String(item.type || '').trim() || 'file',
      String(item.name || '').trim() || 'unnamed',
      String(item.modelUrl || item.ref || '').trim(),
    ].filter(Boolean)
    return parts.join(' | ')
  }).filter(Boolean)

  if (lines.length <= 0) {
    return ''
  }
  return `\n\n[Attachments]\n${lines.join('\n')}`
}

function buildLangGraphMessages(state: TurnState): Array<{ role: 'user' | 'assistant' | 'system', content: string }> {
  const rows = toArray(state.messages)
  const list: Array<{ role: 'user' | 'assistant' | 'system', content: string }> = []

  for (const item of rows) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    const row = item as Record<string, unknown>
    if (!shouldIncludePilotMessageInModelContext(row)) {
      continue
    }
    const roleValue = normalizeText(row.role).toLowerCase()
    const role: 'user' | 'assistant' | 'system' = roleValue === 'assistant'
      ? 'assistant'
      : roleValue === 'system'
        ? 'system'
        : 'user'
    const content = normalizeText(row.content)
    if (!content) {
      continue
    }
    list.push({
      role,
      content,
    })
  }

  if (list.length <= 0) {
    list.push({
      role: 'user',
      content: '',
    })
  }

  if (state.attachments && state.attachments.length > 0) {
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const target = list[index]
      if (target?.role !== 'user') {
        continue
      }
      target.content = `${target.content}${renderAttachmentHint(state.attachments)}`
      break
    }
  }

  return list
}

function createLangGraphRequestBody(state: TurnState, options: LangGraphLocalServerEngineOptions): Record<string, unknown> {
  const input: Record<string, unknown> = {
    messages: buildLangGraphMessages(state),
  }

  const metadata = toRecord(options.metadata)
  const stateMetadata = toRecord(state.metadata)
  const mergedMetadata = {
    ...metadata,
    ...stateMetadata,
    sessionId: state.sessionId,
  }
  if (Object.keys(mergedMetadata).length > 0) {
    input.metadata = mergedMetadata
  }

  const body: Record<string, unknown> = {
    assistant_id: options.assistantId,
    input,
    stream_mode: DEFAULT_STREAM_MODE,
  }

  const graphProfile = normalizeText(options.graphProfile)
  if (graphProfile) {
    body.config = {
      configurable: {
        graph_profile: graphProfile,
      },
    }
  }

  return body
}

async function readStreamToText(stream: ReadableStream<Uint8Array> | null | undefined): Promise<string> {
  if (!stream) {
    return ''
  }

  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let output = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      output += decoder.decode()
      break
    }
    if (!value) {
      continue
    }
    output += decoder.decode(value, { stream: true })
  }
  return output
}

function createLangGraphError(message: string, detail: Record<string, unknown>): Error {
  const error = new Error(message)
  Object.assign(error, detail)
  return error
}

export class LangGraphLocalServerEngineAdapter implements AgentEngineAdapter {
  readonly id = 'langgraph-local-server'

  constructor(private readonly options: LangGraphLocalServerEngineOptions) {}

  async run(state: TurnState): Promise<unknown> {
    let text = ''
    for await (const item of this.runStream(state)) {
      const row = toRecord(item)
      const part = normalizeText(row.text)
      if (row.done === true && part) {
        text = part
        continue
      }
      if (part) {
        text += part
      }
    }
    return {
      text,
      done: true,
      metadata: {
        provider: 'langgraph-local-server',
        assistantId: this.options.assistantId,
      },
    }
  }

  async* runStream(state: TurnState): AsyncIterable<unknown> {
    const baseUrl = trimSuffixSlash(this.options.baseUrl)
    const assistantId = normalizeText(this.options.assistantId)
    const timeoutMs = normalizeTimeoutMs(this.options.timeoutMs)
    if (!baseUrl || !assistantId) {
      throw createLangGraphError('[langgraph] missing baseUrl or assistantId', {
        code: 'LANGGRAPH_CONFIG_INVALID',
        statusCode: 500,
      })
    }

    const endpoint = `${baseUrl}/runs/stream`
    const headers: Record<string, string> = {
      'accept': 'text/event-stream',
      'content-type': 'application/json',
    }

    const apiKey = normalizeText(this.options.apiKey)
    if (apiKey) {
      headers.authorization = `Bearer ${apiKey}`
    }

    const startedAt = Date.now()
    await this.options.onAudit?.({
      type: 'langgraph.request.start',
      payload: {
        endpoint,
        assistantId,
        graphProfile: normalizeText(this.options.graphProfile) || null,
        timeoutMs,
      },
    })

    let response: Awaited<ReturnType<typeof networkClient.request<ReadableStream<Uint8Array> | null>>> | null = null
    try {
      response = await networkClient.request<ReadableStream<Uint8Array> | null>({
        method: 'POST',
        url: endpoint,
        headers,
        timeoutMs,
        body: createLangGraphRequestBody(state, this.options),
        responseType: 'stream',
      })
    }
    catch (error) {
      const statusCode = parseHttpStatusCode(error) || 502
      throw createLangGraphError(`[langgraph] request failed: ${stringifyError(error)}`, {
        code: 'LANGGRAPH_REQUEST_FAILED',
        statusCode,
        endpoint,
      })
    }

    if (!response || response.status < 200 || response.status >= 300 || !response.data) {
      const detailText = await readStreamToText(response?.data || null).catch(() => '')
      throw createLangGraphError(`[langgraph] upstream unavailable: HTTP ${response?.status || 502}`, {
        code: 'LANGGRAPH_UPSTREAM_UNAVAILABLE',
        statusCode: response?.status || 502,
        endpoint,
        detail: detailText.slice(0, 800),
      })
    }

    const reader = response.data.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullText = ''
    let chunkCount = 0

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) {
          const tail = decoder.decode()
          if (tail) {
            buffer += tail.replace(/\r\n/g, '\n')
          }
          break
        }

        if (!value) {
          continue
        }

        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
        let frameEnd = buffer.indexOf('\n\n')
        while (frameEnd !== -1) {
          const frame = buffer.slice(0, frameEnd)
          buffer = buffer.slice(frameEnd + 2)
          frameEnd = buffer.indexOf('\n\n')

          const parsed = parseSseFrame(frame)
          if (!parsed) {
            continue
          }
          if (parsed.data === '[DONE]') {
            continue
          }

          let payload: unknown = parsed.data
          try {
            payload = JSON.parse(parsed.data)
          }
          catch {
            payload = parsed.data
          }

          if (parsed.event === 'error') {
            throw createLangGraphError('[langgraph] stream error event', {
              code: 'LANGGRAPH_STREAM_ERROR_EVENT',
              statusCode: 502,
              endpoint,
              detail: payload,
            })
          }

          const candidate = extractEventDelta(parsed.event, payload)
          const delta = normalizeStreamDelta(fullText, candidate)
          if (!delta) {
            continue
          }

          fullText += delta
          chunkCount += 1
          yield {
            text: delta,
            done: false,
            metadata: {
              provider: 'langgraph-local-server',
              assistantId,
              graphProfile: normalizeText(this.options.graphProfile) || undefined,
              event: parsed.event,
            },
          }
        }
      }
    }
    finally {
      try {
        reader.releaseLock()
      }
      catch {
        // ignore release error
      }
    }

    if (!fullText) {
      throw createLangGraphError('[langgraph] empty response', {
        code: 'LANGGRAPH_EMPTY_RESPONSE',
        statusCode: 502,
        endpoint,
      })
    }

    await this.options.onAudit?.({
      type: 'langgraph.request.end',
      payload: {
        endpoint,
        assistantId,
        chunkCount,
        outputChars: fullText.length,
        durationMs: Math.max(0, Date.now() - startedAt),
      },
    })

    yield {
      text: fullText,
      done: true,
      metadata: {
        provider: 'langgraph-local-server',
        assistantId,
        graphProfile: normalizeText(this.options.graphProfile) || undefined,
      },
    }
  }
}
