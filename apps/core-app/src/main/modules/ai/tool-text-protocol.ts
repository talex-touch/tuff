import type {
  IntelligenceChatPayload,
  IntelligenceMessage,
  IntelligenceMessageToolCall
} from '@talex-touch/tuff-intelligence'

/**
 * The tool protocol for a provider whose wire has no function calling (the local CLIs, Nexus,
 * Ollama): the model is told to answer with one JSON directive, and the Pi worker reads it back.
 * Providers that declare `supportsNativeTools` never see any of this.
 */
export const TOOL_TEXT_PROTOCOL_PROMPT = `You are the model backend for Tuff Pi, a host-governed coordinator.
You receive the complete conversation and an explicit list of tools.
When a tool is required, reply with exactly one JSON object and no markdown:
{"type":"tool","name":"tool.name","arguments":{}}
Call one tool at a time. Use only a listed tool and provide valid arguments.
All string arguments inside the JSON object MUST strictly escape newlines as \\n and double quotes as \\". Never output literal unescaped newlines inside JSON strings.
When you need to write or create files with code or data, prefer using 'file.write' with { "path": "...", "content": "..." } rather than embedding complex multiline scripts inside 'system.exec'.
When no more tools are needed, return the final answer as plain text or {"type":"final","text":"..."}.`

function directiveFor(call: IntelligenceMessageToolCall): string {
  return JSON.stringify({ type: 'tool', name: call.name, arguments: call.arguments })
}

export interface ParsedToolCall {
  name: string
  arguments: Record<string, unknown>
}

/**
 * A tool directive is an envelope: the reply itself (or a trailing standalone tool block) opens
 * with `{"type":"tool"` (or `{"name":"...","type":"tool"`). Shared between `PiModelStreamBuffer`
 * and `parseBridgeResponse` so what is held back during streaming matches what is executed.
 */
export const TOOL_ENVELOPE = /^\{\s*"type"\s*:\s*"tool"/i
const TOOL_ENVELOPE_ALT = /^\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"type"\s*:\s*"tool"/i

export function isToolEnvelopeStart(text: string): boolean {
  return TOOL_ENVELOPE.test(text) || TOOL_ENVELOPE_ALT.test(text)
}

export function repairJsonUnescapedNewlines(jsonStr: string): string {
  let inString = false
  let isEscaped = false
  let result = ''
  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i]
    if (char === '"' && !isEscaped) {
      inString = !inString
      result += char
    } else if (char === '\\' && inString) {
      isEscaped = !isEscaped
      result += char
    } else if ((char === '\n' || char === '\r') && inString) {
      result += char === '\n' ? '\\n' : '\\r'
    } else {
      if (isEscaped) isEscaped = false
      result += char
    }
  }
  return result
}

export function parseJsonValue(text: string): unknown {
  for (const candidate of [text, repairJsonUnescapedNewlines(text)]) {
    try {
      return JSON.parse(candidate)
    } catch {
      // the repaired form is tried next
    }
  }
  return undefined
}

export function parseJsonObject(text: string): Record<string, unknown> | null {
  const value = parseJsonValue(text)
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function readToolEnvelope(parsed: Record<string, unknown>): ParsedToolCall | null {
  const tool =
    parsed.type === 'tool' && typeof parsed.name === 'string'
      ? parsed
      : parsed.type === 'tool' && parsed.tool && typeof parsed.tool === 'object'
        ? (parsed.tool as Record<string, unknown>)
        : null
  if (!tool || typeof tool.name !== 'string') return null
  return {
    name: tool.name,
    arguments:
      tool.arguments && typeof tool.arguments === 'object' && !Array.isArray(tool.arguments)
        ? (tool.arguments as Record<string, unknown>)
        : {}
  }
}

/** Index just past the object that `text` opens with, or -1 when that object never closes. */
export function leadingObjectEnd(text: string): number {
  if (text[0] !== '{') return -1
  let depth = 0
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inString) {
      if (char === '\\') i++
      else if (char === '"') inString = false
    } else if (char === '"') {
      inString = true
    } else if (char === '{') {
      depth++
    } else if (char === '}') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

export interface CodeFenceState {
  readonly char: '`' | '~'
  readonly length: number
}

/**
 * Strips up to three leading ASCII spaces per CommonMark §4.5 fenced code block rules.
 * Returns `null` when indented by four or more spaces or a tab in the leading indentation.
 */
function stripCommonMarkFenceIndent(line: string): string | null {
  const raw = line.replace(/\r$/, '')
  let spaces = 0
  while (spaces < raw.length && spaces < 3 && raw[spaces] === ' ') {
    spaces += 1
  }
  if (spaces < raw.length && (raw[spaces] === ' ' || raw[spaces] === '\t')) {
    return null
  }
  return raw.slice(spaces)
}

/**
 * Parses a CommonMark fenced-code opening line (without trailing newline): at most 3 leading
 * spaces, followed by at least 3 backticks (with no backticks in the info string) or 3+ tildes.
 */
export function parseCodeFenceOpener(
  line: string
): (CodeFenceState & { readonly info: string }) | null {
  const trimmed = stripCommonMarkFenceIndent(line)
  if (trimmed === null || trimmed.length < 3) return null
  const first = trimmed[0]
  if (first !== '`' && first !== '~') return null

  let length = 0
  while (length < trimmed.length && trimmed[length] === first) {
    length += 1
  }
  if (length < 3) return null

  const rest = trimmed.slice(length)
  if (first === '`' && rest.includes('`')) return null
  return { char: first, length, info: rest.trim() }
}

/**
 * Checks whether `line` closes `fence` per CommonMark: at most 3 leading spaces, same fence
 * character, at least as long as the opener, and only optional whitespace after the marker.
 */
export function isCodeFenceCloser(fence: CodeFenceState, line: string): boolean {
  const trimmed = stripCommonMarkFenceIndent(line)
  if (trimmed === null || trimmed.length < fence.length || trimmed[0] !== fence.char) return false
  let length = 0
  while (length < trimmed.length && trimmed[length] === fence.char) {
    length += 1
  }
  if (length < fence.length) return false
  return trimmed.slice(length).trim().length === 0
}

/** Updates CommonMark fenced-code state after consuming one complete line (without newline). */
export function advanceCodeFenceState(
  current: CodeFenceState | null,
  line: string
): CodeFenceState | null {
  if (current === null) {
    const opened = parseCodeFenceOpener(line)
    return opened ? { char: opened.char, length: opened.length } : null
  }
  return isCodeFenceCloser(current, line) ? null : current
}

/** Returns the fence state when `line` opens a bare or `json` fenced block. */
export function isJsonToolFenceOpener(line: string): CodeFenceState | null {
  const opened = parseCodeFenceOpener(line)
  if (!opened) return null
  const info = opened.info.toLowerCase()
  return info === '' || info === 'json' ? { char: opened.char, length: opened.length } : null
}

export function stripTrailingCodeFence(text: string): string {
  const trimmed = text.trimEnd()
  return trimmed.endsWith('```') ? trimmed.slice(0, -3).trimEnd() : trimmed
}

function parseToolEnvelopeArrayRaw(text: string): ParsedToolCall[] | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('[')) return null
  const value = parseJsonValue(trimmed)
  if (!Array.isArray(value) || value.length === 0) return null
  const calls: ParsedToolCall[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const tool = readToolEnvelope(item as Record<string, unknown>)
    if (!tool) return null
    calls.push(tool)
  }
  return calls
}

interface SlicedJsonFence {
  readonly inner: string
  readonly closed: boolean
  readonly restAfterClose: string
}

/**
 * If `text` begins with a bare or `json` fenced block, splits out its inner contents up to the
 * matching CommonMark closing fence (or EOF when unclosed). Returns `null` when `text` does not
 * start with a JSON/bare fence opener.
 */
function sliceLeadingJsonFence(text: string): SlicedJsonFence | null {
  const firstNl = text.indexOf('\n')
  if (firstNl === -1) {
    const inlineMatch = text.match(/^(`{3,}|~{3,})(?:json)?[ \t]+(.+)$/i)
    if (!inlineMatch) return null
    const marker = inlineMatch[1]
    const body = inlineMatch[2].trimEnd()
    if (body.endsWith(marker)) {
      return {
        inner: body.slice(0, -marker.length).trim(),
        closed: true,
        restAfterClose: ''
      }
    }
    return { inner: body.trim(), closed: false, restAfterClose: '' }
  }

  const openerLine = text.slice(0, firstNl)
  const fence = isJsonToolFenceOpener(openerLine)
  if (!fence) return null

  let lineStart = firstNl + 1
  while (lineStart <= text.length) {
    const nextNl = text.indexOf('\n', lineStart)
    const lineEnd = nextNl === -1 ? text.length : nextNl
    const line = text.slice(lineStart, lineEnd)
    if (isCodeFenceCloser(fence, line)) {
      const restStart = nextNl === -1 ? text.length : nextNl + 1
      return {
        inner: text.slice(firstNl + 1, lineStart),
        closed: true,
        restAfterClose: text.slice(restStart).trimStart()
      }
    }
    if (nextNl === -1) break
    lineStart = nextNl + 1
  }

  return {
    inner: text.slice(firstNl + 1),
    closed: false,
    restAfterClose: ''
  }
}

export function parseToolEnvelopeArray(text: string): ParsedToolCall[] | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('[')) return parseToolEnvelopeArrayRaw(trimmed)
  const fenced = sliceLeadingJsonFence(trimmed)
  if (!fenced || fenced.restAfterClose.length > 0) return null
  return parseToolEnvelopeArrayRaw(fenced.inner)
}

export interface LeadingToolEnvelopeExtraction {
  calls: ParsedToolCall[]
  /** Remaining non-tool text after the last parsed tool envelope, trimmed. */
  rest: string
  /**
   * Present when a leading or subsequent `{"type":"tool"...` envelope could not be parsed as
   * valid JSON (truncated or malformed). Consumers must never leak this into user-visible text.
   */
  malformedTail?: string
  /**
   * True when the input began with a JSON/bare fenced block whose contents were mixed (not purely
   * tool envelopes), so callers keep the entire fenced block intact as text.
   */
  rejectedFence?: boolean
}

function extractPlainLeadingToolEnvelopes(input: string): LeadingToolEnvelopeExtraction {
  const calls: ParsedToolCall[] = []
  let cursor = input.trim()

  while (cursor.length > 0) {
    let step = cursor
    if (calls.length > 0 && (step.startsWith(',') || step.startsWith(';'))) {
      step = step.slice(1).trimStart()
    }

    if (!step.startsWith('{')) {
      break
    }

    const end = leadingObjectEnd(step)
    const leading = end === -1 ? null : parseJsonObject(step.slice(0, end))
    const tool = leading ? readToolEnvelope(leading) : null
    if (!tool) {
      if (isToolEnvelopeStart(step)) {
        return { calls, rest: '', malformedTail: step.trim() }
      }
      break
    }

    calls.push(tool)
    cursor = step.slice(end).trimStart()
  }

  return { calls, rest: cursor.trim() }
}

/**
 * Extracts one or more consecutive leading `{"type":"tool",...}` JSON objects (separated by
 * whitespace, commas, semicolons, or markdown JSON code fences). A fenced block is accepted only
 * when its entire contents consist of tool envelopes, so mixed fences stay intact as text.
 */
export function extractLeadingToolEnvelopes(input: string): LeadingToolEnvelopeExtraction {
  const calls: ParsedToolCall[] = []
  let cursor = input.trim()
  let rejectedFence = false

  while (cursor.length > 0) {
    let step = cursor
    if (calls.length > 0 && (step.startsWith(',') || step.startsWith(';'))) {
      step = step.slice(1).trimStart()
    }

    const fenced = sliceLeadingJsonFence(step)
    if (fenced) {
      const arrayCalls = parseToolEnvelopeArrayRaw(fenced.inner)
      if (arrayCalls) {
        calls.push(...arrayCalls)
        cursor = fenced.restAfterClose
        continue
      }
      const plain = extractPlainLeadingToolEnvelopes(fenced.inner)
      if (plain.malformedTail) {
        return {
          calls: [...calls, ...plain.calls],
          rest: '',
          malformedTail: plain.malformedTail
        }
      }
      if (plain.calls.length > 0 && plain.rest === '') {
        calls.push(...plain.calls)
        cursor = fenced.restAfterClose
        continue
      }
      // Mixed or non-tool fenced block: do not accept partial calls or strip its opening fence.
      if (calls.length === 0) rejectedFence = true
      break
    }

    if (!step.startsWith('{')) {
      break
    }

    const end = leadingObjectEnd(step)
    const leading = end === -1 ? null : parseJsonObject(step.slice(0, end))
    const tool = leading ? readToolEnvelope(leading) : null
    if (!tool) {
      if (isToolEnvelopeStart(step)) {
        return { calls, rest: '', malformedTail: step.trim() }
      }
      break
    }

    calls.push(tool)
    cursor = step.slice(end).trimStart()
  }

  return {
    calls,
    rest: cursor.trim(),
    ...(rejectedFence ? { rejectedFence: true } : {})
  }
}

/**
 * Parses a block that consists solely of one or more valid tool envelopes (array or consecutive
 * objects, optionally fenced). Returns null if anything non-tool follows or if `toolNames` is
 * given and any call targets a tool outside it.
 */
export function parsePureToolEnvelopes(
  text: string,
  toolNames?: ReadonlySet<string>
): ParsedToolCall[] | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const arrayCalls = parseToolEnvelopeArray(trimmed)
  if (arrayCalls) {
    return !toolNames || arrayCalls.every((call) => toolNames.has(call.name)) ? arrayCalls : null
  }
  const extracted = extractLeadingToolEnvelopes(trimmed)
  if (extracted.calls.length === 0 || extracted.rest || extracted.malformedTail) return null
  if (toolNames && !extracted.calls.every((call) => toolNames.has(call.name))) return null
  return extracted.calls
}

/**
 * Extracts a standalone trailing tool-call block that starts on its own line (outside an open
 * markdown code fence) after preamble prose, with nothing following the last tool envelope.
 */
export function extractTrailingToolEnvelopes(
  text: string,
  toolNames?: ReadonlySet<string>
): { preamble: string; calls: ParsedToolCall[] } | null {
  const trimmed = text.trimEnd()
  if (!trimmed) return null

  let fenceState: CodeFenceState | null = null
  let lineStart = 0
  while (lineStart < trimmed.length) {
    const newlineIndex = trimmed.indexOf('\n', lineStart)
    const lineEnd = newlineIndex === -1 ? trimmed.length : newlineIndex
    const line = trimmed.slice(lineStart, lineEnd)
    const lineTrimmed = line.trimStart()

    if (
      fenceState === null &&
      lineStart > 0 &&
      (lineTrimmed.startsWith('{') ||
        lineTrimmed.startsWith('[') ||
        isJsonToolFenceOpener(line) !== null)
    ) {
      const tail = trimmed.slice(lineStart).trim()
      const calls = parsePureToolEnvelopes(tail, toolNames)
      if (calls && calls.length > 0) {
        return {
          preamble: trimmed.slice(0, lineStart).trimEnd(),
          calls
        }
      }
    }

    fenceState = advanceCodeFenceState(fenceState, line)

    if (newlineIndex === -1) break
    lineStart = newlineIndex + 1
  }
  return null
}

/**
 * The payload a provider without native tools can take: the structured tool turns become the text
 * the protocol above describes - an assistant call becomes the directive it would have written, a
 * `tool` result becomes a user turn naming the tool - and the tool list rides in a system message.
 * A payload with no tools and no tool turns is returned as it is.
 */
export function foldToolsIntoPrompt(payload: IntelligenceChatPayload): IntelligenceChatPayload {
  const { tools, ...rest } = payload
  const hasToolTurns = payload.messages.some(
    (message) => message.role === 'tool' || (message.toolCalls?.length ?? 0) > 0
  )
  if (tools === undefined && !hasToolTurns) return payload

  const names = new Map<string, string>()
  const turns: IntelligenceMessage[] = payload.messages.map((message) => {
    if (message.role === 'assistant' && message.toolCalls?.length) {
      for (const call of message.toolCalls) names.set(call.id, call.name)
      const { toolCalls, ...plain } = message
      const content = [message.content, ...toolCalls.map(directiveFor)].filter(Boolean).join('\n')
      return { ...plain, content }
    }
    if (message.role === 'tool') {
      const name = message.toolCallId ? names.get(message.toolCallId) : undefined
      return { role: 'user', content: `[Tool result: ${name ?? 'unknown'}]\n${message.content}` }
    }
    return message
  })

  if (!tools?.length) return { ...rest, messages: turns }

  const firstTurn = turns.findIndex((message) => message.role !== 'system')
  const splitAt = firstTurn === -1 ? turns.length : firstTurn
  return {
    ...rest,
    messages: [
      { role: 'system', content: TOOL_TEXT_PROTOCOL_PROMPT },
      ...turns.slice(0, splitAt),
      { role: 'system', content: `Available tools:\n${JSON.stringify(tools)}` },
      ...turns.slice(splitAt)
    ]
  }
}
