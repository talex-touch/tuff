import type {
  HerdrProjectedConversation,
  HerdrProjectedMessage,
  HerdrProjectedMessagePart,
  HerdrProjectedProvider,
  HerdrProjectedToolCall,
  HerdrSessionUpsertPayload,
  HerdrSessionView
} from '@talex-touch/utils/transport/events/herdr'
import type { FSWatcher } from 'node:fs'
import type {
  DiscoveredNativeSessionCandidate,
  NativeSessionDiscoveryRoots
} from '../local-ai-cli/native-session-discovery'
import type { HerdrContentProjector } from './runtime-plane'
import { Buffer } from 'node:buffer'
import { constants as fsConstants, watch as nodeFsWatch } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import path from 'node:path'
import {
  findNativeSessionFile,
  resolveNativeSessionDiscoveryRoots,
  scanNativeSessionsForProject
} from '../local-ai-cli/native-session-discovery'

export const HERDR_PROJECTION_MAX_TAIL_BYTES = 256 * 1024
export const HERDR_PROJECTION_DEFAULT_LIMIT = 50
export const HERDR_PROJECTION_MAX_LIMIT = 120
export const HERDR_PROJECTION_WATCH_DEBOUNCE_MS = 250

const MAX_ARGS_PREVIEW_CHARS = 1200
const MAX_OUTPUT_PREVIEW_CHARS = 2400
const SESSION_MATCH_GRACE_MS = 5_000
const WRAPPER_EXECUTABLES = new Set([
  'node',
  'bun',
  'deno',
  'npx',
  'pnpx',
  'env',
  'sh',
  'zsh',
  'bash'
])

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function parseTimestampMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

function clampLimit(limit?: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return HERDR_PROJECTION_DEFAULT_LIMIT
  }
  return Math.max(1, Math.min(HERDR_PROJECTION_MAX_LIMIT, Math.floor(limit)))
}

function truncatePreview(value: unknown, maxChars: number): string | undefined {
  if (value === undefined || value === null) return undefined
  let text: string
  if (typeof value === 'string') {
    text = value
  } else {
    try {
      text = JSON.stringify(value)
    } catch {
      text = String(value)
    }
  }
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return undefined
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, maxChars - 1)}…`
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const item of content) {
    if (typeof item === 'string') {
      if (item) parts.push(item)
      continue
    }
    const block = asRecord(item)
    if (!block) continue
    if (
      (block.type === 'text' || block.type === 'input_text' || block.type === 'output_text') &&
      typeof block.text === 'string' &&
      block.text
    ) {
      parts.push(block.text)
    }
  }
  return parts.join('\n')
}

function matchProviderToken(raw: string | null | undefined): HerdrProjectedProvider | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const base = path
    .basename(trimmed)
    .toLowerCase()
    .replace(/\.exe$/u, '')
  if (base === 'claude' || base === 'claude-code') return 'claude'
  if (base === 'codex') return 'codex'
  if (base === 'omp' || base === 'oh-my-pi') return 'oh-my-pi'
  if (base === 'pi' || base === 'pie' || base === 'pi-coding-agent') return 'pi'
  return null
}

/**
 * Detects which coding-agent CLI runs inside a `HerdrSessionView` based strictly
 * on structured session metadata (`foregroundName`, OSC 7501 `status.app`, `argv`, `template`).
 */
export function detectProjectedProvider(session: HerdrSessionView): HerdrProjectedProvider | null {
  const fromForeground = matchProviderToken(session.foregroundName)
  if (fromForeground) return fromForeground

  const fromStatusApp = matchProviderToken(session.status?.app)
  if (fromStatusApp) return fromStatusApp

  if (Array.isArray(session.argv) && session.argv.length > 0) {
    const first = session.argv[0] ?? ''
    const fromFirst = matchProviderToken(first)
    if (fromFirst) return fromFirst

    const firstBase = path
      .basename(first)
      .toLowerCase()
      .replace(/\.exe$/u, '')
    if (WRAPPER_EXECUTABLES.has(firstBase)) {
      for (const arg of session.argv.slice(1, 4)) {
        if (!arg || arg.startsWith('-')) continue
        const direct = matchProviderToken(arg)
        if (direct) return direct
        // Handle `/bin/sh -c "claude ..."` command string wrapper.
        const firstWord = arg.trim().split(/\s+/u)[0]
        const fromWord = matchProviderToken(firstWord)
        if (fromWord) return fromWord
      }
    }
  }

  return matchProviderToken(session.template)
}

function pickClosestCandidate(
  candidates: readonly DiscoveredNativeSessionCandidate[],
  session: HerdrSessionView
): DiscoveredNativeSessionCandidate | null {
  if (candidates.length === 0) return null
  const createdMs = session.createdMs || 0

  const activeDuringTerminal = candidates.filter(
    (candidate) => candidate.updatedAt >= createdMs - SESSION_MATCH_GRACE_MS
  )
  const pool = activeDuringTerminal.length > 0 ? activeDuringTerminal : [...candidates]

  const createdWithTerminal = pool.filter(
    (candidate) => candidate.createdAt >= createdMs - SESSION_MATCH_GRACE_MS
  )
  if (createdWithTerminal.length > 0) {
    createdWithTerminal.sort((a, b) => {
      const diffA = Math.abs(a.createdAt - createdMs)
      const diffB = Math.abs(b.createdAt - createdMs)
      return diffA - diffB || b.updatedAt - a.updatedAt
    })
    return createdWithTerminal[0]!
  }

  pool.sort((a, b) => b.updatedAt - a.updatedAt)
  return pool[0]!
}

async function readBoundedJsonlTail(
  filePath: string,
  maxTailBytes = HERDR_PROJECTION_MAX_TAIL_BYTES
): Promise<{ lines: string[]; tailTruncated: boolean; mtimeMs: number } | null> {
  let info
  try {
    info = await lstat(filePath)
  } catch {
    return null
  }
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1) {
    return null
  }

  const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
  const handle = await open(filePath, fsConstants.O_RDONLY | noFollow).catch(() => null)
  if (!handle) return null

  try {
    const opened = await handle.stat()
    if (!opened.isFile() || opened.size < 1) return null

    const tailTruncated = opened.size > maxTailBytes
    const startOffset = tailTruncated ? opened.size - maxTailBytes : 0
    const length = opened.size - startOffset
    const buffer = Buffer.allocUnsafe(length)
    const { bytesRead } = await handle.read(buffer, 0, length, startOffset)
    const slice = buffer.subarray(0, bytesRead)

    let start = 0
    if (tailTruncated) {
      const firstNewline = slice.indexOf(0x0a)
      if (firstNewline < 0) {
        return { lines: [], tailTruncated: true, mtimeMs: opened.mtimeMs }
      }
      start = firstNewline + 1
    }

    const lines = slice
      .subarray(start)
      .toString('utf8')
      .split('\n')
      .map((line) => line.replace(/\r$/u, '').trim())
      .filter(Boolean)

    return {
      lines,
      tailTruncated,
      mtimeMs: opened.mtimeMs
    }
  } finally {
    await handle.close().catch(() => undefined)
  }
}

function appendProjectedPart(
  parts: HerdrProjectedMessagePart[],
  part: HerdrProjectedMessagePart
): void {
  if (part.type === 'text' || part.type === 'reasoning') {
    const normalized = part.text.trim()
    if (!normalized) return
    const prev = parts[parts.length - 1]
    if (prev && prev.type === part.type) {
      prev.text = `${prev.text}\n${normalized}`
      return
    }
    parts.push({ type: part.type, text: normalized })
    return
  }
  parts.push(part)
}

function ensureMessageParts(message: HerdrProjectedMessage): HerdrProjectedMessagePart[] {
  if (message.parts) return message.parts
  const parts: HerdrProjectedMessagePart[] = []
  if (message.reasoning) {
    appendProjectedPart(parts, { type: 'reasoning', text: message.reasoning })
  }
  if (message.text) {
    appendProjectedPart(parts, { type: 'text', text: message.text })
  }
  if (message.toolCalls) {
    for (const call of message.toolCalls) {
      appendProjectedPart(parts, { type: 'tool-call', toolCallId: call.id })
    }
  }
  message.parts = parts
  return parts
}

export interface ParsedProjectionResult {
  messages: HerdrProjectedMessage[]
  truncated: boolean
}

/**
 * Pure JSONL line parser supporting Claude Code, Codex, Pi, and Oh-My-Pi session logs.
 * Correlates tool calls with their results without any terminal screen-scraping.
 */
export function parseNativeSessionJsonlLines(
  provider: HerdrProjectedProvider,
  lines: readonly string[],
  options: { limit?: number; tailTruncated?: boolean } = {}
): ParsedProjectionResult {
  const limit = clampLimit(options.limit)
  const messages: HerdrProjectedMessage[] = []
  const toolCallsById = new Map<string, HerdrProjectedToolCall>()
  let pendingReasoning: string[] = []
  let seqId = 0

  const nextId = (preferred?: string): string => {
    seqId += 1
    return preferred || `msg-${seqId}`
  }

  const pushOrAttachToolCall = (
    call: HerdrProjectedToolCall,
    timestamp: number | null,
    preferredId?: string
  ): void => {
    toolCallsById.set(call.id, call)
    const last = messages[messages.length - 1]
    if (last && last.role === 'assistant') {
      const parts = ensureMessageParts(last)
      if (!last.toolCalls) last.toolCalls = []
      last.toolCalls.push(call)
      if (pendingReasoning.length > 0) {
        const joined = pendingReasoning.join('\n')
        last.reasoning = [last.reasoning, joined].filter(Boolean).join('\n')
        appendProjectedPart(parts, { type: 'reasoning', text: joined })
        pendingReasoning = []
      }
      appendProjectedPart(parts, { type: 'tool-call', toolCallId: call.id })
      return
    }
    const reasoning = pendingReasoning.length > 0 ? pendingReasoning.join('\n') : undefined
    pendingReasoning = []
    const parts: HerdrProjectedMessagePart[] = []
    if (reasoning) {
      appendProjectedPart(parts, { type: 'reasoning', text: reasoning })
    }
    appendProjectedPart(parts, { type: 'tool-call', toolCallId: call.id })
    messages.push({
      id: nextId(preferredId),
      role: 'assistant',
      text: '',
      ...(reasoning ? { reasoning } : {}),
      toolCalls: [call],
      parts,
      timestamp
    })
  }

  const applyToolResult = (
    callId: string,
    output: unknown,
    isError: boolean,
    timestamp: number | null,
    fallbackName = 'tool'
  ): void => {
    const preview = truncatePreview(output, MAX_OUTPUT_PREVIEW_CHARS)
    const existing = callId ? toolCallsById.get(callId) : undefined
    if (existing) {
      existing.status = isError ? 'failed' : 'completed'
      if (preview !== undefined) existing.outputPreview = preview
      if (isError) existing.isError = true
      return
    }
    if (preview) {
      const orphanCallId = callId || nextId()
      messages.push({
        id: nextId(callId ? `tool-${callId}` : undefined),
        role: 'tool',
        text: preview,
        toolCalls: [
          {
            id: orphanCallId,
            name: fallbackName,
            status: isError ? 'failed' : 'completed',
            outputPreview: preview,
            ...(isError ? { isError: true } : {})
          }
        ],
        parts: [{ type: 'tool-call', toolCallId: orphanCallId }],
        timestamp
      })
    }
  }

  for (const line of lines) {
    let parsed: Record<string, unknown> | null = null
    try {
      parsed = asRecord(JSON.parse(line))
    } catch {
      continue
    }
    if (!parsed) continue

    const timestamp = parseTimestampMs(parsed.timestamp)

    if (provider === 'claude') {
      if (parsed.isSidechain === true) continue
      const recordType = asString(parsed.type)
      const messageObj = asRecord(parsed.message)
      const recordId = asString(parsed.uuid) ?? asString(parsed.id)

      if (recordType === 'user') {
        const content = messageObj?.content ?? parsed.content
        const textParts: string[] = []
        if (typeof content === 'string') {
          if (content.trim()) textParts.push(content)
        } else if (Array.isArray(content)) {
          for (const rawBlock of content) {
            const block = asRecord(rawBlock)
            if (!block) continue
            if (block.type === 'tool_result') {
              const callId = asString(block.tool_use_id) ?? asString(block.id) ?? ''
              const outputText = extractTextFromContent(block.content) || block.content
              applyToolResult(callId, outputText, block.is_error === true, timestamp)
            } else if (
              block.type === 'text' &&
              typeof block.text === 'string' &&
              block.text.trim()
            ) {
              textParts.push(block.text)
            }
          }
        }
        const text = textParts.join('\n').trim()
        if (text) {
          messages.push({
            id: nextId(recordId),
            role: 'user',
            text,
            timestamp
          })
        }
        continue
      }

      if (recordType === 'assistant') {
        const content = messageObj?.content ?? parsed.content
        const textParts: string[] = []
        const reasoningParts: string[] = [...pendingReasoning]
        const orderedParts: HerdrProjectedMessagePart[] = []
        for (const thought of pendingReasoning) {
          appendProjectedPart(orderedParts, { type: 'reasoning', text: thought })
        }
        pendingReasoning = []
        const toolCalls: HerdrProjectedToolCall[] = []

        if (typeof content === 'string') {
          if (content.trim()) {
            textParts.push(content)
            appendProjectedPart(orderedParts, { type: 'text', text: content })
          }
        } else if (Array.isArray(content)) {
          for (const rawBlock of content) {
            const block = asRecord(rawBlock)
            if (!block) continue
            if (block.type === 'text' && typeof block.text === 'string' && block.text) {
              textParts.push(block.text)
              appendProjectedPart(orderedParts, { type: 'text', text: block.text })
            } else if (block.type === 'thinking') {
              const thought = asString(block.thinking) ?? asString(block.text)
              if (thought) {
                reasoningParts.push(thought)
                appendProjectedPart(orderedParts, { type: 'reasoning', text: thought })
              }
            } else if (block.type === 'tool_use') {
              const callId = asString(block.id) ?? nextId()
              const call: HerdrProjectedToolCall = {
                id: callId,
                name: asString(block.name) ?? 'tool',
                status: 'running',
                argsPreview: truncatePreview(block.input, MAX_ARGS_PREVIEW_CHARS)
              }
              toolCalls.push(call)
              toolCallsById.set(callId, call)
              appendProjectedPart(orderedParts, { type: 'tool-call', toolCallId: callId })
            }
          }
        }

        const text = textParts.join('\n').trim()
        const reasoning = reasoningParts.join('\n').trim()
        if (text || reasoning || toolCalls.length > 0) {
          messages.push({
            id: nextId(recordId),
            role: 'assistant',
            text,
            ...(reasoning ? { reasoning } : {}),
            ...(toolCalls.length > 0 ? { toolCalls } : {}),
            ...(orderedParts.length > 0 ? { parts: orderedParts } : {}),
            timestamp
          })
        }
        continue
      }

      if (recordType === 'system') {
        const text = extractTextFromContent(messageObj?.content ?? parsed.content).trim()
        if (text) {
          messages.push({ id: nextId(recordId), role: 'system', text, timestamp })
        }
      }
      continue
    }

    if (provider === 'codex') {
      if (parsed.type !== 'response_item') continue
      const payload = asRecord(parsed.payload)
      if (!payload) continue
      const payloadType = asString(payload.type)
      const recordId = asString(payload.id) ?? asString(parsed.id)

      if (payloadType === 'reasoning') {
        const summary = Array.isArray(payload.summary)
          ? payload.summary
              .map((entry) => asString(asRecord(entry)?.text))
              .filter(Boolean)
              .join('\n')
          : asString(payload.text)
        if (summary) pendingReasoning.push(summary)
        continue
      }

      if (payloadType === 'message') {
        const roleRaw = asString(payload.role) ?? asString(parsed.role)
        const text = extractTextFromContent(payload.content).trim()
        if (!text) continue
        if (roleRaw === 'user') {
          messages.push({ id: nextId(recordId), role: 'user', text, timestamp })
        } else if (roleRaw === 'assistant') {
          const reasoning = pendingReasoning.length > 0 ? pendingReasoning.join('\n') : undefined
          pendingReasoning = []
          const orderedParts: HerdrProjectedMessagePart[] = []
          if (reasoning) {
            appendProjectedPart(orderedParts, { type: 'reasoning', text: reasoning })
          }
          appendProjectedPart(orderedParts, { type: 'text', text })
          messages.push({
            id: nextId(recordId),
            role: 'assistant',
            text,
            ...(reasoning ? { reasoning } : {}),
            ...(orderedParts.length > 0 ? { parts: orderedParts } : {}),
            timestamp
          })
        } else if (roleRaw === 'system') {
          messages.push({ id: nextId(recordId), role: 'system', text, timestamp })
        }
        continue
      }

      if (
        payloadType === 'function_call' ||
        payloadType === 'custom_tool_call' ||
        payloadType === 'local_shell_call'
      ) {
        const callId = asString(payload.call_id) ?? asString(payload.id) ?? nextId()
        const name =
          asString(payload.name) ?? (payloadType === 'local_shell_call' ? 'shell' : 'tool')
        const rawArgs = payload.arguments ?? payload.input ?? payload.action
        const call: HerdrProjectedToolCall = {
          id: callId,
          name,
          status: 'running',
          argsPreview: truncatePreview(rawArgs, MAX_ARGS_PREVIEW_CHARS)
        }
        pushOrAttachToolCall(call, timestamp, recordId)
        continue
      }

      if (payloadType === 'function_call_output' || payloadType === 'custom_tool_call_output') {
        const callId = asString(payload.call_id) ?? asString(payload.id) ?? ''
        const isError =
          payload.is_error === true ||
          (typeof payload.status === 'string' && payload.status === 'failed')
        applyToolResult(callId, payload.output ?? payload.result, isError, timestamp)
      }
      continue
    }

    // Pi & Oh-My-Pi (`type === 'message'`)
    if (parsed.type !== 'message') continue
    const messageObj = asRecord(parsed.message)
    if (!messageObj) continue
    const role = asString(messageObj.role)
    const msgTimestamp = parseTimestampMs(messageObj.timestamp) ?? timestamp
    const recordId = asString(parsed.id) ?? asString(messageObj.id)

    if (role === 'user') {
      const text = extractTextFromContent(messageObj.content).trim()
      if (text) {
        messages.push({ id: nextId(recordId), role: 'user', text, timestamp: msgTimestamp })
      }
      continue
    }

    if (role === 'assistant') {
      const content = messageObj.content
      const textParts: string[] = []
      const reasoningParts: string[] = [...pendingReasoning]
      const orderedParts: HerdrProjectedMessagePart[] = []
      for (const thought of pendingReasoning) {
        appendProjectedPart(orderedParts, { type: 'reasoning', text: thought })
      }
      pendingReasoning = []
      const toolCalls: HerdrProjectedToolCall[] = []

      if (typeof content === 'string') {
        if (content.trim()) {
          textParts.push(content)
          appendProjectedPart(orderedParts, { type: 'text', text: content })
        }
      } else if (Array.isArray(content)) {
        for (const rawBlock of content) {
          const block = asRecord(rawBlock)
          if (!block) continue
          if (block.type === 'text' && typeof block.text === 'string' && block.text) {
            textParts.push(block.text)
            appendProjectedPart(orderedParts, { type: 'text', text: block.text })
          } else if (block.type === 'thinking') {
            const thought = asString(block.thinking) ?? asString(block.text)
            if (thought) {
              reasoningParts.push(thought)
              appendProjectedPart(orderedParts, { type: 'reasoning', text: thought })
            }
          } else if (block.type === 'toolCall' || block.type === 'tool_use') {
            const callId = asString(block.id) ?? nextId()
            const call: HerdrProjectedToolCall = {
              id: callId,
              name: asString(block.name) ?? 'tool',
              status: 'running',
              argsPreview: truncatePreview(
                block.arguments ?? block.input ?? block.args,
                MAX_ARGS_PREVIEW_CHARS
              )
            }
            toolCalls.push(call)
            toolCallsById.set(callId, call)
            appendProjectedPart(orderedParts, { type: 'tool-call', toolCallId: callId })
          }
        }
      }

      const text = textParts.join('\n').trim()
      const reasoning = reasoningParts.join('\n').trim()
      if (text || reasoning || toolCalls.length > 0) {
        messages.push({
          id: nextId(recordId),
          role: 'assistant',
          text,
          ...(reasoning ? { reasoning } : {}),
          ...(toolCalls.length > 0 ? { toolCalls } : {}),
          ...(orderedParts.length > 0 ? { parts: orderedParts } : {}),
          timestamp: msgTimestamp
        })
      }
      continue
    }

    if (role === 'toolResult' || role === 'tool') {
      const callId =
        asString(messageObj.toolCallId) ??
        asString(messageObj.tool_call_id) ??
        asString(messageObj.callId) ??
        ''
      const toolName = asString(messageObj.toolName) ?? asString(messageObj.name) ?? 'tool'
      const output = extractTextFromContent(messageObj.content) || messageObj.content
      const isError = messageObj.isError === true || messageObj.is_error === true
      applyToolResult(callId, output, isError, msgTimestamp, toolName)
      continue
    }

    if (role === 'system') {
      const text = extractTextFromContent(messageObj.content).trim()
      if (text) {
        messages.push({ id: nextId(recordId), role: 'system', text, timestamp: msgTimestamp })
      }
    }
  }

  const sliced = messages.length > limit ? messages.slice(messages.length - limit) : messages
  return {
    messages: sliced,
    truncated: Boolean(options.tailTruncated) || messages.length > limit
  }
}

export interface HerdrProjectionWatchSubscription {
  limit: number
  onUpdate: (conversation: HerdrProjectedConversation) => void
}

interface AddressWatchState {
  filePath: string | null
  fsWatcher: FSWatcher | null
  debounceTimer: ReturnType<typeof setTimeout> | null
  refreshing: boolean
  pendingRefresh: boolean
  subscribers: Map<string | number, HerdrProjectionWatchSubscription>
}

export interface HerdrNativeSessionProjectorOptions {
  getSession: (address: string) => HerdrSessionView | null
  roots?: NativeSessionDiscoveryRoots
  debounceMs?: number
  maxTailBytes?: number
  watchFile?: (filePath: string, listener: () => void) => FSWatcher
  now?: () => number
}

/**
 * Dual-source structured content projector for `herdr-core` sessions.
 * Correlates local coding-agent sessions (Claude Code, Codex, Pi, OMP) to their
 * native JSONL logs using bounded tail reads (<= 256 KiB) with zero screen-scraping.
 */
export class HerdrNativeSessionProjector implements HerdrContentProjector {
  readonly id = 'native-session-jsonl'

  private readonly getSession: (address: string) => HerdrSessionView | null
  private readonly roots?: NativeSessionDiscoveryRoots
  private readonly debounceMs: number
  private readonly maxTailBytes: number
  private readonly watchFileFn: (filePath: string, listener: () => void) => FSWatcher
  private readonly now: () => number
  private readonly watches = new Map<string, AddressWatchState>()
  private disposed = false

  constructor(options: HerdrNativeSessionProjectorOptions) {
    this.getSession = options.getSession
    this.roots = options.roots
    this.debounceMs = options.debounceMs ?? HERDR_PROJECTION_WATCH_DEBOUNCE_MS
    this.maxTailBytes = options.maxTailBytes ?? HERDR_PROJECTION_MAX_TAIL_BYTES
    this.watchFileFn =
      options.watchFile ??
      ((target, listener) => nodeFsWatch(target, { persistent: false }, listener))
    this.now = options.now ?? (() => Date.now())
  }

  get watchedAddressCount(): number {
    return this.watches.size
  }

  /**
   * Projects a single `HerdrSessionView` into structured messages (read-only).
   */
  async projectSessionView(
    session: HerdrSessionView,
    limit = HERDR_PROJECTION_DEFAULT_LIMIT
  ): Promise<HerdrProjectedConversation> {
    const provider = detectProjectedProvider(session)
    const unavailable = (): HerdrProjectedConversation => ({
      address: session.address,
      provider,
      nativeSessionId: null,
      filePath: null,
      available: false,
      messages: [],
      truncated: false,
      updatedAt: this.now()
    })

    // Remote machine JSONL files are not on local disk; degrade gracefully.
    if (session.machine !== null || !provider) {
      return unavailable()
    }

    const rawCwd = session.foregroundCwd || session.cwd
    if (!rawCwd) return unavailable()

    const canonicalCwd = await realpath(rawCwd).catch(() => null)
    if (!canonicalCwd) return unavailable()

    const effectiveRoots = this.roots ?? resolveNativeSessionDiscoveryRoots()
    let scanResult
    try {
      scanResult = await scanNativeSessionsForProject(canonicalCwd, { roots: effectiveRoots })
    } catch {
      return unavailable()
    }

    const matching = scanResult.candidates.filter((candidate) => candidate.provider === provider)
    const best = pickClosestCandidate(matching, session)
    if (!best) return unavailable()

    const filePath = await findNativeSessionFile(provider, best.nativeSessionId, canonicalCwd, {
      roots: effectiveRoots
    }).catch(() => null)
    if (!filePath) return unavailable()

    const tail = await readBoundedJsonlTail(filePath, this.maxTailBytes)
    if (!tail) return unavailable()

    const parsed = parseNativeSessionJsonlLines(provider, tail.lines, {
      limit,
      tailTruncated: tail.tailTruncated
    })

    return {
      address: session.address,
      provider,
      nativeSessionId: best.nativeSessionId,
      filePath,
      available: true,
      messages: parsed.messages,
      truncated: parsed.truncated,
      updatedAt: Math.max(tail.mtimeMs, this.now())
    }
  }

  async projectAddress(
    address: string,
    limit = HERDR_PROJECTION_DEFAULT_LIMIT
  ): Promise<HerdrProjectedConversation> {
    const trimmed = address.trim()
    const session = trimmed ? this.getSession(trimmed) : null
    if (!session) {
      return {
        address: trimmed,
        provider: null,
        nativeSessionId: null,
        filePath: null,
        available: false,
        messages: [],
        truncated: false,
        updatedAt: this.now()
      }
    }
    return await this.projectSessionView(session, clampLimit(limit))
  }

  /**
   * Starts watching an address for a specific owner, returning the initial projection
   * and pushing debounced updates while watched.
   */
  async watch(
    address: string,
    ownerKey: string | number,
    options: {
      limit?: number
      onUpdate: (conversation: HerdrProjectedConversation) => void
    }
  ): Promise<HerdrProjectedConversation> {
    const trimmed = address.trim()
    const limit = clampLimit(options.limit)
    if (this.disposed || !trimmed) {
      return {
        address: trimmed,
        provider: null,
        nativeSessionId: null,
        filePath: null,
        available: false,
        messages: [],
        truncated: false,
        updatedAt: this.now()
      }
    }

    let state = this.watches.get(trimmed)
    if (!state) {
      state = {
        filePath: null,
        fsWatcher: null,
        debounceTimer: null,
        refreshing: false,
        pendingRefresh: false,
        subscribers: new Map()
      }
      this.watches.set(trimmed, state)
    }

    state.subscribers.set(ownerKey, {
      limit,
      onUpdate: options.onUpdate
    })

    const initial = await this.projectAddress(trimmed, limit)
    if (this.disposed || !state.subscribers.has(ownerKey)) {
      return initial
    }

    if (initial.filePath) {
      this.ensureFileWatcher(trimmed, state, initial.filePath)
    }

    return initial
  }

  unwatch(address: string, ownerKey: string | number): void {
    const trimmed = address.trim()
    const state = this.watches.get(trimmed)
    if (!state) return
    state.subscribers.delete(ownerKey)
    if (state.subscribers.size === 0) {
      this.teardownWatchState(trimmed, state)
    }
  }

  unwatchOwner(ownerKey: string | number): void {
    for (const [address, state] of [...this.watches.entries()]) {
      if (state.subscribers.delete(ownerKey) && state.subscribers.size === 0) {
        this.teardownWatchState(address, state)
      }
    }
  }

  /**
   * `HerdrContentProjector` hook: triggered by `HerdrRuntimeStore` session upserts
   * so watched addresses pick up newly created JSONL logs or session removal.
   */
  projectSession(payload: HerdrSessionUpsertPayload): void {
    if (this.disposed) return
    const state = this.watches.get(payload.address)
    if (!state || state.subscribers.size === 0) return

    if (payload.kind === 'removed') {
      this.closeFsWatcher(state)
      const empty: HerdrProjectedConversation = {
        address: payload.address,
        provider: null,
        nativeSessionId: null,
        filePath: null,
        available: false,
        messages: [],
        truncated: false,
        updatedAt: this.now()
      }
      for (const subscriber of state.subscribers.values()) {
        subscriber.onUpdate(empty)
      }
      return
    }

    if (
      payload.kind === 'status' ||
      payload.kind === 'turn' ||
      payload.kind === 'sync' ||
      payload.kind === 'restarted' ||
      payload.kind === 'finished'
    ) {
      this.scheduleRefresh(payload.address, state)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const [address, state] of [...this.watches.entries()]) {
      this.teardownWatchState(address, state)
    }
    this.watches.clear()
  }

  private ensureFileWatcher(address: string, state: AddressWatchState, filePath: string): void {
    if (this.disposed || (state.filePath === filePath && state.fsWatcher)) return
    this.closeFsWatcher(state)
    state.filePath = filePath
    try {
      const watcher = this.watchFileFn(filePath, () => {
        if (this.disposed || this.watches.get(address) !== state) return
        this.scheduleRefresh(address, state)
      })
      watcher.on?.('error', () => {
        if (state.fsWatcher === watcher) {
          this.closeFsWatcher(state)
        }
      })
      state.fsWatcher = watcher
    } catch {
      state.fsWatcher = null
    }
  }

  private scheduleRefresh(address: string, state: AddressWatchState): void {
    if (this.disposed || this.watches.get(address) !== state) return
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer)
    }
    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = null
      void this.runRefresh(address, state)
    }, this.debounceMs)
  }

  private async runRefresh(address: string, state: AddressWatchState): Promise<void> {
    if (this.disposed || this.watches.get(address) !== state || state.subscribers.size === 0) {
      return
    }
    if (state.refreshing) {
      state.pendingRefresh = true
      return
    }

    state.refreshing = true
    try {
      const maxLimit = Math.max(
        HERDR_PROJECTION_DEFAULT_LIMIT,
        ...[...state.subscribers.values()].map((sub) => sub.limit)
      )
      const projected = await this.projectAddress(address, maxLimit)
      if (this.disposed || this.watches.get(address) !== state || state.subscribers.size === 0) {
        return
      }

      if (projected.filePath) {
        this.ensureFileWatcher(address, state, projected.filePath)
      }

      for (const subscriber of [...state.subscribers.values()]) {
        const sliced: HerdrProjectedConversation =
          projected.messages.length > subscriber.limit
            ? {
                ...projected,
                messages: projected.messages.slice(projected.messages.length - subscriber.limit),
                truncated: true
              }
            : projected
        subscriber.onUpdate(sliced)
      }
    } finally {
      state.refreshing = false
      if (state.pendingRefresh && !this.disposed && this.watches.get(address) === state) {
        state.pendingRefresh = false
        this.scheduleRefresh(address, state)
      }
    }
  }

  private closeFsWatcher(state: AddressWatchState): void {
    if (state.fsWatcher) {
      try {
        state.fsWatcher.close()
      } catch {
        // Ignore watcher close errors.
      }
      state.fsWatcher = null
    }
    state.filePath = null
  }

  private teardownWatchState(address: string, state: AddressWatchState): void {
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer)
      state.debounceTimer = null
    }
    this.closeFsWatcher(state)
    state.subscribers.clear()
    this.watches.delete(address)
  }
}
