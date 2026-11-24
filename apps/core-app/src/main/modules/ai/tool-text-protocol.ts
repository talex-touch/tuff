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

export function stripTrailingCodeFence(text: string): string {
  const trimmed = text.trimEnd()
  return trimmed.endsWith('```') ? trimmed.slice(0, -3).trimEnd() : trimmed
}

export function parseToolEnvelopeArray(text: string): ParsedToolCall[] | null {
  const trimmed = text.trim()
  const withoutFence = stripTrailingCodeFence(trimmed.replace(/^```(?:json)?\s+/i, '')).trim()
  if (!withoutFence.startsWith('[')) return null
  const value = parseJsonValue(withoutFence)
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

export interface LeadingToolEnvelopeExtraction {
  calls: ParsedToolCall[]
  /** Remaining non-tool text after the last parsed tool envelope, trimmed. */
  rest: string
  /**
   * Present when a leading or subsequent `{"type":"tool"...` envelope could not be parsed as
   * valid JSON (truncated or malformed). Consumers must never leak this into user-visible text.
   */
  malformedTail?: string
}

/**
 * Extracts one or more consecutive leading `{"type":"tool",...}` JSON objects (separated by
 * whitespace, commas, semicolons, or markdown JSON code fences).
 */
export function extractLeadingToolEnvelopes(input: string): LeadingToolEnvelopeExtraction {
  const calls: ParsedToolCall[] = []
  let cursor = input.trim()
  let inFence = false

  while (cursor.length > 0) {
    let step = cursor
    if (calls.length > 0 && (step.startsWith(',') || step.startsWith(';'))) {
      step = step.slice(1).trimStart()
    }

    let openedThisStep = false
    if (!inFence) {
      const fenceOpen = step.match(/^```(?:json)?\s+/i)
      if (fenceOpen) {
        step = step.slice(fenceOpen[0].length).trimStart()
        openedThisStep = true
      }
    }

    if (!step.startsWith('{')) {
      break
    }

    const end = leadingObjectEnd(step)
    const leading = end === -1 ? null : parseJsonObject(step.slice(0, end))
    const tool = leading ? readToolEnvelope(leading) : null
    if (!tool) {
      if (isToolEnvelopeStart(step)) {
        const malformed =
          inFence || openedThisStep ? stripTrailingCodeFence(step).trim() : step.trim()
        return { calls, rest: '', malformedTail: malformed }
      }
      break
    }

    calls.push(tool)
    if (openedThisStep) inFence = true
    cursor = step.slice(end).trimStart()
    if (inFence) {
      const fenceClose = cursor.match(/^```[ \t]*(?:\r?\n|$)/)
      if (fenceClose) {
        cursor = cursor.slice(fenceClose[0].length).trimStart()
        inFence = false
      }
    }
  }

  return { calls, rest: cursor.trim() }
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

  let inCodeFence = false
  let lineStart = 0
  while (lineStart < trimmed.length) {
    const newlineIndex = trimmed.indexOf('\n', lineStart)
    const lineEnd = newlineIndex === -1 ? trimmed.length : newlineIndex
    const lineTrimmed = trimmed.slice(lineStart, lineEnd).trimStart()

    if (
      !inCodeFence &&
      lineStart > 0 &&
      (lineTrimmed.startsWith('{') ||
        lineTrimmed.startsWith('[') ||
        /^```(?:json)?(?:\s|$)/i.test(lineTrimmed))
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

    if (/^```/.test(lineTrimmed)) {
      inCodeFence = !inCodeFence
    }

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
