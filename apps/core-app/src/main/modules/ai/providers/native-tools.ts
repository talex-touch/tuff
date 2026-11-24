import type { BaseMessage } from '@langchain/core/messages'
import type {
  IntelligenceChatTool,
  IntelligenceMessage,
  IntelligencePartEvent
} from '@talex-touch/tuff-intelligence'
import { AIMessage, ToolMessage } from '@langchain/core/messages'

/**
 * OpenAI and Anthropic accept function names matching `^[a-zA-Z0-9_-]{1,64}$`; Tuff's tool ids
 * (`file.read`, `desktop.context.activeApp`) carry dots. Dots are the only character outside the
 * accepted set that real ids use, and `__` never occurs in one, so the wire name is the id with
 * `.` written as `__` - reversible without a lookup table that could drift out of step.
 */
const DOT = '.'
const WIRE_DOT = '__'
const WIRE_NAME = /^[a-zA-Z0-9_-]{1,64}$/

export function toWireToolName(toolId: string): string {
  const wire = toolId.split(DOT).join(WIRE_DOT)
  if (!WIRE_NAME.test(wire) || wire.split(WIRE_DOT).join(DOT) !== toolId) {
    throw new Error(`TOOL_NAME_UNSUPPORTED: '${toolId}' cannot be sent as a function name`)
  }
  return wire
}

export function fromWireToolName(wireName: string): string {
  return wireName.split(WIRE_DOT).join(DOT)
}

/** The OpenAI function-tool shape sent on the wire; ChatAnthropic converts the same object. */
export interface LangChainFunctionTool {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export function toLangChainTools(
  tools: IntelligenceChatTool[] | undefined
): LangChainFunctionTool[] {
  return (tools ?? []).map((tool) => ({
    type: 'function' as const,
    function: {
      name: toWireToolName(tool.name),
      description: tool.description,
      parameters: tool.parameters
    }
  }))
}

/**
 * An assistant turn with calls, as a LangChain message. The calls keep the ids the provider issued,
 * which is what pairs each with the `tool` message that answers it.
 */
export function toLangChainAssistantMessage(message: IntelligenceMessage): AIMessage {
  const calls = (message.toolCalls ?? []).map((call) => ({
    id: call.id,
    name: toWireToolName(call.name),
    args: call.arguments,
    type: 'tool_call' as const
  }))
  return calls.length > 0
    ? new AIMessage({ content: message.content, tool_calls: calls })
    : new AIMessage(message.content)
}

/**
 * A tool result, as a LangChain message. A result with no call id answers nothing the model asked,
 * and the API rejects it; failing here names the cause instead of surfacing as an opaque 400.
 */
export function toLangChainToolMessage(message: IntelligenceMessage): BaseMessage {
  if (!message.toolCallId) {
    throw new Error('TOOL_RESULT_UNPAIRED: a tool message must carry the id of the call it answers')
  }
  return new ToolMessage({ content: message.content, tool_call_id: message.toolCallId })
}

/**
 * The arguments a model sent. An empty string is a call with no arguments. Anything that is not a
 * JSON object is a malformed call: it is reported as `{}` so the tool's own schema validation
 * rejects it with a message the model can act on, instead of this layer guessing at the intent.
 */
export function parseToolArguments(raw: string): Record<string, unknown> {
  if (raw.trim() === '') return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(Object.entries(parsed))
    }
    return {}
  } catch {
    return {}
  }
}

/**
 * Accumulates a streamed message's `tool_call_chunks` into settled calls.
 *
 * Providers stream a call as fragments: the first carries the id and name, later ones carry
 * pieces of the JSON arguments, all keyed by `index`. `tool-start` goes out as soon as a call has
 * named itself; `tool-input-end` only from `finish()`, once its arguments are whole - never from a
 * partial fragment.
 */
interface AssembledToolCall {
  id: string
  name: string
  args: string
  sortKey: number
  seq: number
}

export class ToolCallAssembler {
  /** Calls stored in internal slot ids, kept strictly separate from raw stream `index` values. */
  private readonly calls = new Map<number, AssembledToolCall>()
  /** Maps raw stream `index` -> currently bound internal slot id. */
  private readonly slotByRawIndex = new Map<number, number>()
  /** Maps tool call `id` -> internal slot id. */
  private readonly slotByCallId = new Map<string, number>()
  private nextSlot = 0
  private lastSlot: number | undefined

  private allocateSlot(rawIndex: number | undefined): number {
    const slot = this.nextSlot
    this.nextSlot += 1
    this.calls.set(slot, {
      id: '',
      name: '',
      args: '',
      sortKey: rawIndex ?? Number.POSITIVE_INFINITY,
      seq: slot
    })
    return slot
  }

  private resolveSlot(rawIndex: number | undefined, fragmentId: string): number {
    if (fragmentId) {
      const existingById = this.slotByCallId.get(fragmentId)
      if (existingById !== undefined) {
        if (rawIndex !== undefined) {
          this.slotByRawIndex.set(rawIndex, existingById)
          const existingCall = this.calls.get(existingById)
          if (existingCall && existingCall.sortKey === Number.POSITIVE_INFINITY) {
            existingCall.sortKey = rawIndex
          }
        }
        return existingById
      }

      if (rawIndex !== undefined) {
        const boundSlot = this.slotByRawIndex.get(rawIndex)
        const boundCall = boundSlot !== undefined ? this.calls.get(boundSlot) : undefined
        // Attach to an id-less slot already bound to this raw index (e.g. args arrived before id).
        // Otherwise allocate a fresh slot so a reused raw index (such as index: 0 across parallel
        // calls) never clobbers a prior call or collides with a future raw index.
        if (boundSlot !== undefined && boundCall && !boundCall.id) {
          this.slotByCallId.set(fragmentId, boundSlot)
          return boundSlot
        }
        const slot = this.allocateSlot(rawIndex)
        this.slotByRawIndex.set(rawIndex, slot)
        this.slotByCallId.set(fragmentId, slot)
        return slot
      }

      // No raw index: attach to an earlier id-less unindexed slot if present; else allocate.
      if (this.lastSlot !== undefined) {
        const lastCall = this.calls.get(this.lastSlot)
        if (lastCall && !lastCall.id && lastCall.sortKey === Number.POSITIVE_INFINITY) {
          this.slotByCallId.set(fragmentId, this.lastSlot)
          return this.lastSlot
        }
      }
      const slot = this.allocateSlot(undefined)
      this.slotByCallId.set(fragmentId, slot)
      return slot
    }

    if (rawIndex !== undefined) {
      const boundSlot = this.slotByRawIndex.get(rawIndex)
      if (boundSlot !== undefined) return boundSlot
      const slot = this.allocateSlot(rawIndex)
      this.slotByRawIndex.set(rawIndex, slot)
      return slot
    }

    if (this.lastSlot !== undefined) return this.lastSlot
    return this.allocateSlot(undefined)
  }

  /** Feeds one streamed LangChain message chunk; a chunk with no tool-call fragments is ignored. */
  pushMessageChunk(chunk: unknown): IntelligencePartEvent[] {
    if (chunk === null || typeof chunk !== 'object' || !('tool_call_chunks' in chunk)) return []
    const fragments = chunk.tool_call_chunks
    if (!Array.isArray(fragments)) return []

    const events: IntelligencePartEvent[] = []
    for (const fragment of fragments) {
      if (fragment === null || typeof fragment !== 'object') continue
      const fragmentId = 'id' in fragment && typeof fragment.id === 'string' ? fragment.id : ''
      const rawIndex =
        'index' in fragment && typeof fragment.index === 'number' ? fragment.index : undefined
      const slot = this.resolveSlot(rawIndex, fragmentId)
      this.lastSlot = slot
      const call = this.calls.get(slot)!
      const wasStarted = call.id !== '' && call.name !== ''
      if (fragmentId) {
        call.id = fragmentId
      }
      if ('name' in fragment && typeof fragment.name === 'string' && fragment.name) {
        call.name = fragment.name
      }
      if ('args' in fragment && typeof fragment.args === 'string') call.args += fragment.args
      if (!wasStarted && call.id !== '' && call.name !== '') {
        events.push({ kind: 'tool-start', callId: call.id, name: fromWireToolName(call.name) })
      }
    }
    return events
  }

  /** `tool-input-end` for every call, in stream order. A call that never named itself is dropped. */
  finish(): IntelligencePartEvent[] {
    const events: IntelligencePartEvent[] = []
    const ordered = [...this.calls.values()].sort(
      (left, right) => left.sortKey - right.sortKey || left.seq - right.seq
    )
    for (const call of ordered) {
      if (!call.id || !call.name) continue
      events.push({ kind: 'tool-input-end', callId: call.id, input: parseToolArguments(call.args) })
    }
    this.calls.clear()
    this.slotByRawIndex.clear()
    this.slotByCallId.clear()
    this.nextSlot = 0
    this.lastSlot = undefined
    return events
  }
}
