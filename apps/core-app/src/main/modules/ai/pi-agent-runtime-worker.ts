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
}

const parentPort = (
  process as NodeJS.Process & {
    parentPort?: UtilityParentPort
  }
).parentPort

if (!parentPort) {
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
  parentPort.postMessage({ ...message, protocolVersion: PI_RUNTIME_PROTOCOL_VERSION })
}

function addUsage(target: PiRuntimeUsage, delta?: PiRuntimeUsage): boolean {
  if (delta) {
    target.promptTokens += delta.promptTokens || 0
    target.completionTokens += delta.completionTokens || 0
    target.totalTokens += delta.totalTokens || 0
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

function parseBridgeResponse(
  text: string,
  toolNames: Set<string>
):
  | { type: 'final'; text: string }
  | { type: 'tool'; name: string; arguments: Record<string, unknown> } {
  const trimmed = text.trim()
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  try {
    const parsed = JSON.parse(withoutFence) as Record<string, unknown>
    if (parsed.type === 'final' && typeof parsed.text === 'string') {
      return { type: 'final', text: parsed.text }
    }
    const tool =
      parsed.type === 'tool' && typeof parsed.name === 'string'
        ? parsed
        : parsed.type === 'tool' && parsed.tool && typeof parsed.tool === 'object'
          ? (parsed.tool as Record<string, unknown>)
          : null
    if (tool && typeof tool.name === 'string' && toolNames.has(tool.name)) {
      return {
        type: 'tool',
        name: tool.name,
        arguments:
          tool.arguments && typeof tool.arguments === 'object'
            ? (tool.arguments as Record<string, unknown>)
            : {}
      }
    }
  } catch {
    // Plain text is a valid final response.
  }
  return { type: 'final', text }
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

function stableToolCallId(
  runId: string,
  step: number,
  name: string,
  args: Record<string, unknown>
): string {
  return `tool_${createHash('sha256')
    .update(`${runId}:${step}:${name}:${JSON.stringify(canonicalToolArguments(args))}`)
    .digest('hex')
    .slice(0, 32)}`
}

function emitModelResponse(
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

  const directive = parseBridgeResponse(response.text || '', toolNames)
  if (directive.type === 'tool') {
    const toolCall = {
      type: 'toolCall' as const,
      id: stableToolCallId(runId, step, directive.name, directive.arguments),
      name: directive.name,
      arguments: directive.arguments
    }
    const partial = createBaseAssistantMessage(response, [], 'toolUse')
    stream.push({ type: 'start', partial })
    const started = { ...partial, content: [{ ...toolCall, arguments: {} }] }
    stream.push({ type: 'toolcall_start', contentIndex: 0, partial: started })
    stream.push({
      type: 'toolcall_delta',
      contentIndex: 0,
      delta: JSON.stringify(directive.arguments),
      partial: started
    })
    const message = createBaseAssistantMessage(response, [toolCall], 'toolUse')
    stream.push({ type: 'toolcall_end', contentIndex: 0, toolCall, partial: message })
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
      try {
        const response = await requestTool(payload.run.id, toolCallId, tool.id, params, signal)
        if (response.error) {
          active.failure = response.error
          if (response.error.startsWith('APPROVAL_REQUIRED:')) {
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
      } catch (error) {
        active.failure ??= toErrorMessage(error)
        throw error
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

async function startRun(payload: PiRuntimeStartPayload): Promise<void> {
  const runId = payload.run.id
  if (activeRuns.has(runId)) {
    throw new Error(`Run ${runId} is already active`)
  }

  const agent = new Agent({
    initialState: {
      systemPrompt: payload.profile.systemPrompt || 'You are Tuff Pi, a host-governed coordinator.',
      model: BRIDGE_MODEL,
      thinkingLevel: 'medium',
      tools: createTools(payload),
      messages: restoreHistory(payload)
    },
    streamFn: createStreamFn(runId, payload.profile, payload.budget),
    sessionId: payload.run.sessionId,
    toolExecution: 'parallel'
  })
  const active: ActiveRun = {
    agent,
    output: '',
    usage: { ...EMPTY_USAGE },
    cancelled: false,
    modelSteps: 0,
    toolCalls: 0,
    costKnown: true,
    approvalRequired: undefined
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
  })

  const objective =
    payload.request.input === undefined
      ? payload.request.objective
      : `${payload.request.objective}\n\nInput:\n${JSON.stringify(payload.request.input)}`

  try {
    await agent.prompt(objective)
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

parentPort.on('message', (event) => {
  void handleMessage(event.data as PiRuntimeChildMessage).catch((error) => {
    post({ type: 'runtime.error', error: toErrorMessage(error) })
  })
})

post({ type: 'runtime.ready' })
