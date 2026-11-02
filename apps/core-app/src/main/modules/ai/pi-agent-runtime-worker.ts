import type {
  AgentEvent,
  AgentMessage,
  AgentTool,
  AgentToolResult
} from '@earendil-works/pi-agent-core'
import type {
  Api,
  AssistantMessage,
  AssistantMessageEventStream,
  Context,
  Model,
  SimpleStreamOptions
} from '@earendil-works/pi-ai'
import type {
  PiRuntimeChildMessage,
  PiRuntimeCounters,
  PiRuntimeModelRequest,
  PiRuntimeModelResponse,
  PiRuntimeParentMessage,
  PiRuntimeParentPayload,
  PiRuntimeRunResult,
  PiRuntimeStartPayload,
  PiRuntimeToolResponse,
  PiRuntimeUsage
} from './pi-agent-runtime-protocol'
import { createHash, randomUUID } from 'node:crypto'
import process from 'node:process'
import { Agent } from '@earendil-works/pi-agent-core'
import { createAssistantMessageEventStream, Type } from '@earendil-works/pi-ai'
import { buildObjectivePrompt } from './pi-agent-run-log'
import { PI_RUNTIME_PROTOCOL_VERSION } from './pi-agent-runtime-protocol'

interface UtilityParentPort {
  on: (event: 'message', listener: (event: { data: unknown }) => void) => void
  postMessage: (message: PiRuntimeParentMessage) => void
}

interface PendingResponse<T> {
  resolve: (value: T) => void
  reject: (error: Error) => void
  cleanup?: () => void
}

interface ActiveRun {
  agent: Agent
  output: string
  usage: PiRuntimeUsage
  cancelled: boolean
  modelSteps: number
  toolCalls: number
  costKnown: boolean
  approvalRequired?: string
  failure?: string
  /**
   * The assistant turn a resumed run had already received from the model. The run's next model
   * request is answered from it, once, instead of being sent: the calls the model chose are the
   * ones that continue, and the turn is neither asked for again nor charged for again.
   */
  replay?: AssistantMessage
}

const parentPort = (
  process as NodeJS.Process & {
    parentPort?: UtilityParentPort
  }
).parentPort

if (!parentPort && process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  throw new Error('Pi runtime worker requires an Electron utility parent port')
}

const activeRuns = new Map<string, ActiveRun>()
const pendingModelRequests = new Map<string, PendingResponse<PiRuntimeModelResponse>>()
const pendingToolRequests = new Map<string, PendingResponse<PiRuntimeToolResponse>>()

const EMPTY_USAGE: PiRuntimeUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  cost: 0
}

const BRIDGE_MODEL: Model<Api> = {
  id: 'tuff-provider-bridge',
  name: 'Tuff Provider Bridge',
  api: 'tuff-provider-bridge',
  provider: 'tuff',
  baseUrl: 'tuff://intelligence',
  reasoning: true,
  input: ['text', 'image'],
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0
  },
  contextWindow: 200_000,
  maxTokens: 32_000
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function post(message: PiRuntimeParentPayload): void {
  parentPort?.postMessage({ ...message, protocolVersion: PI_RUNTIME_PROTOCOL_VERSION })
}

function addUsage(target: PiRuntimeUsage, delta?: PiRuntimeUsage): boolean {
  if (delta) {
    target.promptTokens += delta.promptTokens || 0
    target.completionTokens += delta.completionTokens || 0
    target.totalTokens += delta.totalTokens || 0
    if (delta.cacheReadTokens) {
      target.cacheReadTokens = (target.cacheReadTokens ?? 0) + delta.cacheReadTokens
    }
  }
  if (typeof delta?.cost !== 'number' || !Number.isFinite(delta.cost)) {
    target.cost = undefined
    return false
  }
  if (target.cost !== undefined) target.cost += delta.cost
  return true
}

function requestModel(
  payload: PiRuntimeModelRequest,
  signal?: AbortSignal
): Promise<PiRuntimeModelResponse> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Model request aborted'))
      return
    }
    const onAbort = () => {
      pendingModelRequests.delete(payload.requestId)
      reject(new Error('Model request aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    pendingModelRequests.set(payload.requestId, {
      resolve,
      reject,
      cleanup: () => signal?.removeEventListener('abort', onAbort)
    })
    post({ type: 'model.request', payload })
  })
}

function requestTool(
  runId: string,
  toolCallId: string,
  toolId: string,
  input: unknown,
  signal?: AbortSignal
): Promise<PiRuntimeToolResponse> {
  const requestId = randomUUID()
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Tool request aborted'))
      return
    }
    const onAbort = () => {
      pendingToolRequests.delete(requestId)
      reject(new Error('Tool request aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    pendingToolRequests.set(requestId, {
      resolve,
      reject,
      cleanup: () => signal?.removeEventListener('abort', onAbort)
    })
    post({
      type: 'tool.request',
      payload: { requestId, runId, toolCallId, toolId, input }
    })
  })
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

/**
 * A tool directive is an envelope: the reply itself opens with `{"type":"tool"`. The same test
 * `PiModelStreamBuffer` applies while streaming, so what was held back from the bubble is exactly
 * what is read as a tool call here. A reply that merely *mentions* that shape - a quoted prompt, a
 * type definition, a JSON example - is an answer and is delivered as one.
 */
const TOOL_ENVELOPE = /^\{\s*"type"\s*:\s*"tool"/i

function tryParseRelaxedTool(
  withoutFence: string,
  toolNames: Set<string>
): { name: string; arguments: Record<string, unknown> } | null {
  if (!TOOL_ENVELOPE.test(withoutFence)) return null

  const nameMatch = withoutFence.match(/"name"\s*:\s*"([^"]+)"/i)
  const toolName = nameMatch ? nameMatch[1] : undefined
  if (!toolName || !toolNames.has(toolName)) return null

  if (toolName === 'system.exec' || toolName === 'bash') {
    const commandMatch = withoutFence.match(/"command"\s*:\s*"([\s\S]*)/i)
    if (commandMatch) {
      let rawCmd = commandMatch[1].trim()
      rawCmd = rawCmd.replace(/"?\s*\}\s*\}?\s*$/, '')
      if (/^python3\s+-c\s+["']?/i.test(rawCmd)) {
        const script = rawCmd.replace(/^python3\s+-c\s+["']?\s*/i, '')
        rawCmd = `python3 -c ${JSON.stringify(script)}`
      }
      return { name: toolName, arguments: { command: rawCmd } }
    }
  }

  if (toolName === 'file.write') {
    const pathMatch = withoutFence.match(/"path"\s*:\s*"([^"]+)"/i)
    const contentMatch = withoutFence.match(/"content"\s*:\s*"([\s\S]*)/i)
    if (pathMatch) {
      const content = contentMatch ? contentMatch[1].replace(/"?\s*\}\s*\}?\s*$/, '') : ''
      return { name: toolName, arguments: { path: pathMatch[1], content } }
    }
  }

  const argsMatch = withoutFence.match(/"arguments"\s*:\s*\{([\s\S]*)/i)
  if (argsMatch) {
    let content = argsMatch[1].trim()
    if (!content.endsWith('}')) {
      content = content.replace(/\s*\}\s*$/, '')
      content = '{' + content + '}'
    } else {
      content = '{' + content
    }
    try {
      const parsedArgs = JSON.parse(repairJsonUnescapedNewlines(content)) as Record<string, unknown>
      return { name: toolName, arguments: parsedArgs }
    } catch {
      // Fall through
    }
  }

  return null
}

/** What one model reply turned out to be, under the text protocol: one tool call, or the answer. */
export type BridgeResponse =
  | { type: 'final'; text: string }
  | { type: 'tool'; name: string; arguments: Record<string, unknown>; text?: string }
  | { type: 'invalid'; name: string; reason: string }

/** Carries a tool call that could not be read; the tool never runs with it, pi reports the reason back. */
const INVALID_CALL_KEY = '__invalidToolCall'
const INVALID_CALL_NAME = 'invalid_tool_call'

function parseJsonObject(text: string): Record<string, unknown> | null {
  for (const candidate of [text, repairJsonUnescapedNewlines(text)]) {
    try {
      const value: unknown = JSON.parse(candidate)
      return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null
    } catch {
      // the repaired form is tried next
    }
  }
  return null
}

function readToolEnvelope(
  parsed: Record<string, unknown>
): { name: string; arguments: Record<string, unknown> } | null {
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
      tool.arguments && typeof tool.arguments === 'object'
        ? (tool.arguments as Record<string, unknown>)
        : {}
  }
}

/** Index just past the object that `text` opens with, or -1 when that object never closes. */
function leadingObjectEnd(text: string): number {
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

export function parseBridgeResponse(text: string, toolNames: Set<string>): BridgeResponse {
  const trimmed = text.trim()
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  const parsed = parseJsonObject(withoutFence)
  if (parsed) {
    if (parsed.type === 'final' && typeof parsed.text === 'string') {
      return { type: 'final', text: parsed.text }
    }
    // A well-formed envelope is a call even when the name is not one of this run's tools: the agent
    // loop answers an unavailable tool with `Tool <name> not found`, which the model reads and
    // recovers from. Rejecting it here ended the whole run on a reply the loop already handles.
    const tool = readToolEnvelope(parsed)
    if (tool) return { type: 'tool', ...tool }
  }

  if (TOOL_ENVELOPE.test(withoutFence)) {
    const end = leadingObjectEnd(withoutFence)
    const leading = end === -1 ? null : parseJsonObject(withoutFence.slice(0, end))
    const tool = leading ? readToolEnvelope(leading) : null
    if (tool) {
      const rest = withoutFence.slice(end).trim()
      return { type: 'tool', ...tool, ...(rest ? { text: rest } : {}) }
    }
  }

  const relaxedTool = tryParseRelaxedTool(withoutFence, toolNames)
  if (relaxedTool) {
    return {
      type: 'tool',
      name: relaxedTool.name,
      arguments: relaxedTool.arguments
    }
  }

  if (TOOL_ENVELOPE.test(withoutFence)) {
    return {
      type: 'invalid',
      name: withoutFence.match(/"name"\s*:\s*"([^"]+)"/i)?.[1] ?? INVALID_CALL_NAME,
      reason: `The tool call could not be read: a tool call is one JSON object {"type":"tool","name":"<tool>","arguments":{...}} with nothing after it. Re-issue it in that form. The reply was:\n${trimmed.slice(0, 2000)}`
    }
  }

  return { type: 'final', text }
}

type BridgeDirective =
  | { type: 'final'; text: string }
  | {
      type: 'tool'
      calls: Array<{ name: string; arguments: Record<string, unknown> }>
      text?: string
    }

/** The text protocol names one call per reply; native tools can name several. */
function toDirective(parsed: BridgeResponse): BridgeDirective {
  if (parsed.type === 'invalid') {
    return {
      type: 'tool',
      calls: [{ name: parsed.name, arguments: { [INVALID_CALL_KEY]: parsed.reason } }]
    }
  }
  if (parsed.type === 'tool') {
    return {
      type: 'tool',
      calls: [{ name: parsed.name, arguments: parsed.arguments }],
      ...(parsed.text ? { text: parsed.text } : {})
    }
  }
  return parsed
}

function createBaseAssistantMessage(
  response: PiRuntimeModelResponse,
  content: AssistantMessage['content'],
  stopReason: AssistantMessage['stopReason']
): AssistantMessage {
  const usage = response.usage ?? EMPTY_USAGE
  return {
    role: 'assistant',
    content,
    api: 'tuff-provider-bridge',
    provider: response.provider || 'tuff',
    model: response.model || BRIDGE_MODEL.id,
    usage: {
      input: usage.promptTokens,
      output: usage.completionTokens,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: usage.totalTokens,
      cost: {
        input: 0,
        output: usage.cost || 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: usage.cost || 0
      }
    },
    stopReason,
    timestamp: Date.now()
  }
}

function restoreHistory(payload: PiRuntimeStartPayload): AgentMessage[] {
  return payload.history.map((message) => {
    if (message.role === 'user') {
      return {
        role: 'user' as const,
        content: [{ type: 'text' as const, text: message.text }],
        timestamp: message.createdAt
      }
    }
    return {
      ...createBaseAssistantMessage(
        { requestId: 'history', runId: payload.run.id, text: message.text },
        [{ type: 'text', text: message.text }],
        'stop'
      ),
      timestamp: message.createdAt
    }
  })
}

function canonicalToolArguments(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(canonicalToolArguments)
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalToolArguments(nested)])
  )
}

/**
 * An id that is the same every time the same call is made at the same step, so a replayed run finds
 * the result it already persisted. `index` separates two identical calls the model made in one step;
 * the first call at a step keeps the id it always had.
 */
function stableToolCallId(
  runId: string,
  step: number,
  name: string,
  args: Record<string, unknown>,
  index = 0
): string {
  const position = index === 0 ? '' : `:${index}`
  return `tool_${createHash('sha256')
    .update(`${runId}:${step}:${name}:${JSON.stringify(canonicalToolArguments(args))}${position}`)
    .digest('hex')
    .slice(0, 32)}`
}

export function emitModelResponse(
  stream: AssistantMessageEventStream,
  response: PiRuntimeModelResponse,
  toolNames: Set<string>,
  runId: string,
  step: number
): void {
  if (response.error) {
    const error = createBaseAssistantMessage(response, [], 'error')
    error.errorMessage = response.error
    stream.push({ type: 'start', partial: error })
    stream.push({ type: 'error', reason: 'error', error })
    stream.end(error)
    return
  }
  const rawCalls = (response.toolCalls ?? []).filter((call) => toolNames.has(call.name))
  const directive =
    rawCalls.length > 0
      ? { type: 'tool' as const, calls: rawCalls }
      : toDirective(parseBridgeResponse(response.text || '', toolNames))

  if (directive.type === 'tool') {
    const toolCalls = directive.calls.map((call, index) => ({
      type: 'toolCall' as const,
      id: stableToolCallId(runId, step, call.name, call.arguments, index),
      name: call.name,
      arguments: call.arguments
    }))
    const partial = createBaseAssistantMessage(response, [], 'toolUse')
    stream.push({ type: 'start', partial })
    const text = directive.text ?? ''
    const message = createBaseAssistantMessage(
      response,
      text ? [...toolCalls, { type: 'text', text }] : toolCalls,
      'toolUse'
    )
    for (const [contentIndex, toolCall] of toolCalls.entries()) {
      const started = { ...partial, content: [{ ...toolCall, arguments: {} }] }
      stream.push({ type: 'toolcall_start', contentIndex, partial: started })
      stream.push({
        type: 'toolcall_delta',
        contentIndex,
        delta: JSON.stringify(toolCall.arguments),
        partial: started
      })
      stream.push({ type: 'toolcall_end', contentIndex, toolCall, partial: message })
    }
    if (text) {
      const contentIndex = toolCalls.length
      const textPartial = createBaseAssistantMessage(response, [{ type: 'text', text: '' }], 'toolUse')
      stream.push({ type: 'text_start', contentIndex, partial: textPartial })
      stream.push({ type: 'text_delta', contentIndex, delta: text, partial: message })
      stream.push({ type: 'text_end', contentIndex, content: text, partial: message })
    }
    stream.push({ type: 'done', reason: 'toolUse', message })
    stream.end(message)
    return
  }

  const message = createBaseAssistantMessage(
    response,
    [{ type: 'text', text: directive.text }],
    'stop'
  )
  const partial = createBaseAssistantMessage(response, [], 'stop')
  stream.push({ type: 'start', partial })
  const textPartial = createBaseAssistantMessage(response, [{ type: 'text', text: '' }], 'stop')
  stream.push({ type: 'text_start', contentIndex: 0, partial: textPartial })
  if (directive.text) {
    stream.push({
      type: 'text_delta',
      contentIndex: 0,
      delta: directive.text,
      partial: message
    })
  }
  stream.push({ type: 'text_end', contentIndex: 0, content: directive.text, partial: message })
  stream.push({ type: 'done', reason: 'stop', message })
  stream.end(message)
}

/**
 * Plays an assistant message that was received before as the reply to the model request now being
 * made. Nothing here reaches a model: the message is the one that was logged, block for block.
 */
export function emitStoredMessage(
  stream: AssistantMessageEventStream,
  message: AssistantMessage
): void {
  const stopReason = message.stopReason === 'toolUse' ? 'toolUse' : 'stop'
  const empty = { ...message, content: [] as AssistantMessage['content'] }
  stream.push({ type: 'start', partial: empty })
  for (const [contentIndex, block] of message.content.entries()) {
    if (block.type === 'text') {
      stream.push({ type: 'text_start', contentIndex, partial: message })
      stream.push({ type: 'text_end', contentIndex, content: block.text, partial: message })
    } else if (block.type === 'thinking') {
      stream.push({ type: 'thinking_start', contentIndex, partial: message })
      stream.push({ type: 'thinking_end', contentIndex, content: block.thinking, partial: message })
    } else if (block.type === 'toolCall') {
      stream.push({ type: 'toolcall_start', contentIndex, partial: message })
      stream.push({ type: 'toolcall_end', contentIndex, toolCall: block, partial: message })
    }
  }
  stream.push({ type: 'done', reason: stopReason, message })
  stream.end(message)
}

function createStreamFn(
  runId: string,
  profile: PiRuntimeStartPayload['profile'],
  budget: PiRuntimeStartPayload['budget']
) {
  return (
    _model: Model<Api>,
    context: Context,
    options?: SimpleStreamOptions
  ): AssistantMessageEventStream => {
    const stream = createAssistantMessageEventStream()
    const requestId = randomUUID()
    const toolNames = new Set((context.tools ?? []).map((tool) => tool.name))
    const active = activeRuns.get(runId)
    const step = (active?.modelSteps ?? 0) + 1
    if (active) active.modelSteps = step
    const replay = active?.replay
    if (active && replay) {
      // Already received and already charged for: played back, not requested.
      active.replay = undefined
      queueMicrotask(() => emitStoredMessage(stream, replay))
      return stream
    }
    if (step > budget.maxSteps) {
      const error = `Execution budget exceeded: maxSteps=${budget.maxSteps}`
      if (active) active.failure = error
      queueMicrotask(() =>
        emitModelResponse(stream, { requestId, runId, error }, toolNames, runId, step)
      )
      return stream
    }
    void requestModel(
      {
        requestId,
        runId,
        step,
        systemPrompt: context.systemPrompt || '',
        messages: context.messages,
        tools: (context.tools ?? []).map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        })),
        modelPreference: profile.modelPreference
      },
      options?.signal
    )
      .then((response) => {
        const current = activeRuns.get(runId)
        if (current) {
          if (!addUsage(current.usage, response.usage)) current.costKnown = false
          const maxCost = budget.maxCost
          if (typeof maxCost === 'number' && Number.isFinite(maxCost)) {
            const cost = current.usage.cost
            const error =
              !current.costKnown || cost === undefined
                ? `Execution budget cannot be measured: maxCost=${maxCost}`
                : cost > maxCost
                  ? `Execution budget exceeded: maxCost=${maxCost}`
                  : undefined
            if (error) {
              current.failure = error
              emitModelResponse(stream, { requestId, runId, error }, toolNames, runId, step)
              return
            }
          }
        }
        emitModelResponse(stream, response, toolNames, runId, step)
      })
      .catch((error) => {
        const message = toErrorMessage(error)
        const current = activeRuns.get(runId)
        if (current) current.failure = message
        emitModelResponse(stream, { requestId, runId, error: message }, toolNames, runId, step)
      })
    return stream
  }
}

function createTools(payload: PiRuntimeStartPayload): AgentTool[] {
  return payload.tools.map((tool) => ({
    name: tool.id,
    label: tool.name,
    description: tool.description,
    parameters: Type.Unsafe(tool.inputSchema),
    execute: async (
      toolCallId: string,
      params: unknown,
      signal?: AbortSignal
    ): Promise<AgentToolResult<unknown>> => {
      const active = activeRuns.get(payload.run.id)
      if (!active) throw new Error(`Run ${payload.run.id} is not active`)
      active.toolCalls += 1
      const maxToolCalls = payload.budget.maxToolCalls ?? 20
      if (active.toolCalls > maxToolCalls) {
        const error = `Execution budget exceeded: maxToolCalls=${maxToolCalls}`
        active.failure = error
        throw new Error(error)
      }
      // Approval is the one tool error that ends the run: it waits for the user. Any other error -
      // access denied, a missing file, a failing command - is this call's result. It goes back to
      // the model as the tool result and the model decides what to do next; a run that then answers
      // is a run that completed, not one that failed. What does end a run - a budget, a model
      // request that failed, approval - sets `failure` where it happens.
      const response = await requestTool(payload.run.id, toolCallId, tool.id, params, signal)
      if (response.error) {
        if (response.error.startsWith('APPROVAL_REQUIRED:')) {
          active.failure = response.error
          active.approvalRequired = response.error
          active.agent.abort()
        }
        throw new Error(response.error)
      }
      const text =
        typeof response.output === 'string'
          ? response.output
          : JSON.stringify(response.output ?? null)
      return {
        content: [{ type: 'text', text }],
        details: response.output
      }
    }
  }))
}

function serializeEvent(event: AgentEvent): Record<string, unknown> {
  if (event.type === 'message_update') {
    return {
      type: event.type,
      assistantMessageEvent: event.assistantMessageEvent
    }
  }
  if (event.type === 'message_start' || event.type === 'message_end') {
    return { type: event.type, message: event.message }
  }
  if (event.type === 'turn_end') {
    return { type: event.type, message: event.message, toolResults: event.toolResults }
  }
  return { ...event }
}

function messageText(message: AgentMessage | undefined): string {
  if (!message || message.role !== 'assistant') return ''
  return message.content
    .filter((content) => content.type === 'text')
    .map((content) => content.text)
    .join('')
}

/** What the run is first asked, in the words the model sees: the objective, and the input if any. */
function objectivePrompt(payload: PiRuntimeStartPayload): string {
  return buildObjectivePrompt(payload.request.objective, payload.request.input)
}

/** The counters as they stand now: what a record carries so a resumed run can pick them up. */
function countersOf(active: ActiveRun): PiRuntimeCounters {
  return {
    modelSteps: active.modelSteps,
    toolCalls: active.toolCalls,
    usage: { ...active.usage },
    costKnown: active.costKnown
  }
}

/** Whether a message is one the agent writes into a run's log (and a resumed run replays). */
function isLoggedMessage(message: AgentMessage): boolean {
  if (message.role === 'user' || message.role === 'toolResult') return true
  // A turn that errored or was aborted is never resumed from; logging it would only poison the log.
  return message.role === 'assistant' && message.stopReason !== 'error' && message.stopReason !== 'aborted'
}

async function startRun(payload: PiRuntimeStartPayload): Promise<void> {
  const runId = payload.run.id
  if (activeRuns.has(runId)) {
    throw new Error(`Run ${runId} is already active`)
  }

  const history = restoreHistory(payload)
  const resume = payload.resume
  const agent = new Agent({
    initialState: {
      systemPrompt: payload.profile.systemPrompt || 'You are Tuff Pi, a host-governed coordinator.',
      model: BRIDGE_MODEL,
      thinkingLevel: 'medium',
      tools: createTools(payload),
      messages: resume ? [...history, ...(resume.messages as AgentMessage[])] : history
    },
    streamFn: createStreamFn(runId, payload.profile, payload.budget),
    sessionId: payload.run.sessionId,
    toolExecution: 'parallel',
    beforeToolCall: async ({ toolCall }) => {
      const reason = toolCall.arguments[INVALID_CALL_KEY]
      return typeof reason === 'string' ? { block: true, reason } : undefined
    }
  })
  const active: ActiveRun = {
    agent,
    output: '',
    usage: resume ? { ...resume.counters.usage } : { ...EMPTY_USAGE },
    cancelled: false,
    modelSteps: resume?.counters.modelSteps ?? 0,
    toolCalls: resume?.counters.toolCalls ?? 0,
    costKnown: resume?.counters.costKnown ?? true,
    approvalRequired: undefined,
    replay: resume?.replay as AssistantMessage | undefined
  }
  activeRuns.set(runId, active)

  agent.subscribe((event) => {
    if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
      active.output += event.assistantMessageEvent.delta
    }
    post({
      type: 'run.event',
      payload: {
        runId,
        type: event.type,
        payload: serializeEvent(event)
      }
    })
    // Every message of the run is logged as it ends, with the counters as they stand once it has:
    // the main process keeps them, encrypted, so a run that is stopped can be picked up from the
    // last message instead of starting over.
    if (event.type === 'message_end' && isLoggedMessage(event.message)) {
      post({
        type: 'run.record',
        payload: { runId, record: { message: event.message, ...countersOf(active) } }
      })
    }
  })

  try {
    if (resume) await agent.continue()
    else await agent.prompt(objectivePrompt(payload))
    if (active.approvalRequired) {
      post({ type: 'run.failed', runId, error: active.approvalRequired })
      return
    }
    if (active.cancelled) {
      post({ type: 'run.cancelled', runId })
      return
    }
    const lastAssistant = [...agent.state.messages]
      .reverse()
      .find((message) => message.role === 'assistant')
    if (
      lastAssistant?.role === 'assistant' &&
      (lastAssistant.stopReason === 'error' || lastAssistant.errorMessage !== undefined)
    ) {
      post({
        type: 'run.failed',
        runId,
        error: lastAssistant.errorMessage ?? 'Pi agent terminated with a model error'
      })
      return
    }
    if (active.failure) {
      post({ type: 'run.failed', runId, error: active.failure })
      return
    }
    const output = messageText(lastAssistant) || active.output
    const result: PiRuntimeRunResult = {
      runId,
      output,
      usage: active.usage
    }
    post({ type: 'run.completed', payload: result })
  } catch (error) {
    if (active.approvalRequired) {
      post({ type: 'run.failed', runId, error: active.approvalRequired })
      return
    }
    if (active.cancelled) {
      post({ type: 'run.cancelled', runId })
    } else {
      post({ type: 'run.failed', runId, error: toErrorMessage(error) })
    }
  } finally {
    activeRuns.delete(runId)
  }
}

function cancelRun(runId: string): void {
  const active = activeRuns.get(runId)
  if (!active) return
  active.cancelled = true
  active.agent.abort()
}

function settleResponse<T>(
  map: Map<string, PendingResponse<T>>,
  requestId: string,
  value: T,
  error?: string
): void {
  const pending = map.get(requestId)
  if (!pending) return
  map.delete(requestId)
  pending.cleanup?.()
  if (error) pending.reject(new Error(error))
  else pending.resolve(value)
}

async function handleMessage(message: PiRuntimeChildMessage): Promise<void> {
  if (message.protocolVersion !== PI_RUNTIME_PROTOCOL_VERSION) {
    throw new Error(`Unsupported Pi runtime protocol version: ${String(message.protocolVersion)}`)
  }
  switch (message.type) {
    case 'run.start':
      await startRun(message.payload)
      return
    case 'run.cancel':
      cancelRun(message.runId)
      return
    case 'model.response':
      settleResponse(
        pendingModelRequests,
        message.payload.requestId,
        message.payload,
        message.payload.error
      )
      return
    case 'tool.response':
      settleResponse(pendingToolRequests, message.payload.requestId, message.payload)
      return
    case 'runtime.shutdown':
      for (const active of activeRuns.values()) {
        active.cancelled = true
        active.agent.abort()
      }
  }
}

parentPort?.on('message', (event) => {
  void handleMessage(event.data as PiRuntimeChildMessage).catch((error) => {
    post({ type: 'runtime.error', error: toErrorMessage(error) })
  })
})

if (parentPort) {
  post({ type: 'runtime.ready' })
}
