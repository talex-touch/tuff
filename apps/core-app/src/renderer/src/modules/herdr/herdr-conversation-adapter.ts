import type { AiMessagePart, AiToolCallPart } from '@talex-touch/tuffex/ai-elements'
import type {
  HerdrProjectedConversation,
  HerdrProjectedMessage,
  HerdrProjectedProvider,
  HerdrProjectedToolCall
} from '@talex-touch/utils/transport/sdk/domains/herdr'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import type { RunStep } from '~/views/base/home/composer/run-status'
import type { HerdrProjectedSession } from './useHerdrRuntime'
import { deriveRunStep } from '~/views/base/home/composer/run-status'

/** Matches `herdr.put` transport cap (8 MiB raw bytes before base64 encoding). */
export const HERDR_PUT_MAX_BYTES = 8 * 1024 * 1024

export const HERDR_ATTACHMENT_TOO_LARGE_CODE = 'HERDR_ATTACHMENT_TOO_LARGE'

const PROVIDER_DISPLAY_NAMES: Record<HerdrProjectedProvider, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  pi: 'Pi',
  'oh-my-pi': 'Oh-My-Pi'
}

export function formatHerdrProviderLabel(
  provider: HerdrProjectedProvider | string | null | undefined
): string {
  if (!provider) return 'Herdr'
  const key = provider.trim().toLowerCase() as HerdrProjectedProvider
  if (key in PROVIDER_DISPLAY_NAMES) {
    return PROVIDER_DISPLAY_NAMES[key]
  }
  return provider.trim() || 'Herdr'
}

const SUMMARY_KEYS = ['path', 'file_path', 'filePath', 'command', 'cmd', 'query', 'pattern', 'url']

export function summarizeHerdrToolArgs(argsPreview?: string): string | undefined {
  const trimmed = argsPreview?.trim()
  if (!trimmed) return undefined

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const key of SUMMARY_KEYS) {
          const val = parsed[key]
          if (typeof val === 'string' && val.trim()) {
            const singleLine = val.trim().split(/\r?\n/u)[0] ?? ''
            return singleLine.length > 88 ? `${singleLine.slice(0, 87)}…` : singleLine
          }
        }
      }
    } catch {
      // Truncated JSON preview — fall through to single-line excerpt.
    }
  }

  const firstLine = trimmed.split(/\r?\n/u)[0]?.trim() ?? ''
  if (!firstLine) return undefined
  return firstLine.length > 88 ? `${firstLine.slice(0, 87)}…` : firstLine
}

export function mapHerdrToolCallToPart(tool: HerdrProjectedToolCall): AiToolCallPart {
  const isError = tool.isError === true || tool.status === 'failed'
  const status: AiToolCallPart['status'] = isError
    ? 'error'
    : tool.status === 'running'
      ? 'running'
      : 'done'

  const summary = summarizeHerdrToolArgs(tool.argsPreview)
  return {
    type: 'tool-call',
    id: tool.id,
    name: tool.name,
    status,
    ...(summary ? { summary } : {}),
    ...(tool.argsPreview ? { input: tool.argsPreview } : {}),
    ...(isError
      ? { error: tool.outputPreview || tool.name }
      : tool.outputPreview
        ? { output: tool.outputPreview }
        : {})
  }
}

export interface HerdrMessageAdapterOptions {
  providerLabel?: string
  isLast?: boolean
  sessionWorking?: boolean
}

export function herdrMessageToConversationMessage(
  message: HerdrProjectedMessage,
  options: HerdrMessageAdapterOptions = {}
): ConversationMessage {
  const createdAt = message.timestamp ?? undefined

  if (message.role === 'user') {
    return {
      id: message.id,
      role: 'user',
      content: message.text,
      status: 'complete',
      ...(createdAt !== undefined ? { createdAt } : {})
    }
  }

  if (message.role === 'system') {
    const content = message.text.trim()
    return {
      id: message.id,
      role: 'assistant',
      content,
      status: 'complete',
      ...(createdAt !== undefined ? { createdAt } : {}),
      meta: { coordinator: 'system' },
      parts: content ? [{ type: 'text', text: content }] : []
    }
  }

  if (message.role === 'tool') {
    const calls = message.toolCalls ?? []
    const parts: AiMessagePart[] =
      calls.length > 0
        ? calls.map((call) => mapHerdrToolCallToPart(call))
        : message.text.trim()
          ? [{ type: 'text', text: message.text.trim() }]
          : []
    return {
      id: message.id,
      role: 'assistant',
      content: message.text,
      status: 'complete',
      ...(createdAt !== undefined ? { createdAt } : {}),
      ...(options.providerLabel
        ? { meta: { provider: options.providerLabel, coordinator: 'herdr' } }
        : {}),
      parts
    }
  }

  // Assistant turn
  const isStreaming = Boolean(options.isLast && options.sessionWorking)
  const parts: AiMessagePart[] = []
  const callsById = new Map<string, HerdrProjectedToolCall>()
  for (const call of message.toolCalls ?? []) {
    callsById.set(call.id, call)
  }

  if (message.parts && message.parts.length > 0) {
    const seenToolIds = new Set<string>()
    const lastIndex = message.parts.length - 1
    message.parts.forEach((part, index) => {
      if (part.type === 'reasoning') {
        const text = part.text.trim()
        if (!text) return
        parts.push({
          type: 'reasoning',
          text,
          done: !(isStreaming && index === lastIndex)
        })
      } else if (part.type === 'text') {
        const text = part.text.trim()
        if (!text) return
        parts.push({ type: 'text', text })
      } else if (part.type === 'tool-call') {
        const call = callsById.get(part.toolCallId)
        if (!call) return
        seenToolIds.add(call.id)
        parts.push(mapHerdrToolCallToPart(call))
      }
    })
    for (const call of message.toolCalls ?? []) {
      if (!seenToolIds.has(call.id)) {
        parts.push(mapHerdrToolCallToPart(call))
      }
    }
  } else {
    const hasTrailingContent = Boolean(message.text.trim()) || Boolean(message.toolCalls?.length)
    if (message.reasoning?.trim()) {
      parts.push({
        type: 'reasoning',
        text: message.reasoning.trim(),
        done: !isStreaming || hasTrailingContent
      })
    }
    if (message.text.trim()) {
      parts.push({ type: 'text', text: message.text.trim() })
    }
    for (const call of message.toolCalls ?? []) {
      parts.push(mapHerdrToolCallToPart(call))
    }
  }

  return {
    id: message.id,
    role: 'assistant',
    content: message.text,
    status: isStreaming ? 'streaming' : 'complete',
    ...(createdAt !== undefined ? { createdAt } : {}),
    ...(options.providerLabel
      ? { meta: { provider: options.providerLabel, coordinator: 'herdr' } }
      : {}),
    parts
  }
}

export function herdrProjectionToConversationMessages(
  projection: HerdrProjectedConversation | null,
  session: HerdrProjectedSession | null
): ConversationMessage[] {
  const sessionWorking = session?.state === 'live' && session.status?.state === 'working'
  const providerLabel = formatHerdrProviderLabel(projection?.provider ?? session?.appName ?? null)
  const rawMessages = projection?.messages ?? []
  const lastIndex = rawMessages.length - 1

  const mapped = rawMessages.map((msg, index) =>
    herdrMessageToConversationMessage(msg, {
      providerLabel,
      isLast: index === lastIndex,
      sessionWorking
    })
  )

  if (sessionWorking && session) {
    const tail = mapped[mapped.length - 1]
    if (!tail || tail.role === 'user') {
      mapped.push({
        id: `herdr-pending-${session.address}-${session.turn}`,
        role: 'assistant',
        content: '',
        status: 'streaming',
        createdAt: session.statusMs ?? Date.now(),
        meta: { provider: providerLabel, coordinator: 'herdr' }
      })
    }
  }

  return mapped
}

export function resolveHerdrRunStep(
  messages: readonly ConversationMessage[],
  session: HerdrProjectedSession | null
): RunStep {
  const tail = messages[messages.length - 1]
  const derived =
    tail && tail.role === 'assistant' ? deriveRunStep(tail.parts) : { kind: 'waiting' as const }

  if (derived.kind === 'waiting') {
    const statusHint = session?.status?.msg?.trim() || session?.status?.title?.trim()
    if (statusHint) {
      return { kind: 'thinking', title: statusHint }
    }
  }

  return derived
}

export function sanitizeHerdrUploadName(rawName: string): string {
  const leaf = rawName.replace(/\\/g, '/').split('/').pop() ?? ''
  const cleaned = Array.from(leaf)
    .filter((ch) => {
      const code = ch.charCodeAt(0)
      return code >= 0x20 && code !== 0x7f
    })
    .join('')
    .trim()
  return cleaned || 'attachment.bin'
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  const chunks: string[] = []
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, offset + chunkSize)
    chunks.push(String.fromCharCode(...slice))
  }
  return btoa(chunks.join(''))
}

async function readBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer()
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result)
      } else {
        reject(new Error('Failed to read attachment bytes'))
      }
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read attachment bytes'))
    reader.readAsArrayBuffer(blob)
  })
}

export async function fileToHerdrBase64(file: File): Promise<string> {
  if (file.size > HERDR_PUT_MAX_BYTES) {
    const error = new Error(`Attachment exceeds 8 MiB limit (${file.size} bytes)`)
    ;(error as Error & { code?: string }).code = HERDR_ATTACHMENT_TOO_LARGE_CODE
    throw error
  }
  const buffer = await readBlobArrayBuffer(file)
  return arrayBufferToBase64(buffer)
}

export function composeHerdrMessageWithAttachments(
  draftText: string,
  uploadedPaths: readonly string[]
): string {
  const trimmed = draftText.trim()
  const cleanPaths = uploadedPaths.map((item) => item.trim()).filter(Boolean)
  if (cleanPaths.length === 0) return trimmed

  const refs = cleanPaths.map((filePath) => (/\s/u.test(filePath) ? `"${filePath}"` : filePath))
  const attachmentBlock = refs.join('\n')
  return trimmed ? `${trimmed}\n\n${attachmentBlock}` : attachmentBlock
}
