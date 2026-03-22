import type {
  AgentEngineAdapter,
  AgentEnvelope,
  AgentEventType,
  DeepAgentAuditRecord,
} from '@talex-touch/tuff-intelligence/pilot'
import type { H3Event } from 'h3'
import type { PilotBuiltinTool, PilotChannelAdapter, PilotChannelTransport } from './pilot-channel'
import {
  AbstractAgentRuntime,
  CapabilityRegistry,
  DecisionDispatcher,
  DeepAgentLangChainEngineAdapter,
  DefaultDecisionAdapter,
} from '@talex-touch/tuff-intelligence/pilot'
import { LangGraphLocalServerEngineAdapter } from './pilot-langgraph-engine'
import { createPilotStoreAdapter } from './pilot-store'
import { buildPilotSystemPrompt } from './pilot-system-prompt'

const DEFAULT_RESPONSES_MODEL = 'gpt-5.2'
const DEFAULT_TIMEOUT_MS = 90_000
const MIN_TIMEOUT_MS = 3_000
const MAX_TIMEOUT_MS = 10 * 60 * 1000
export const PILOT_STRICT_MODE_UNAVAILABLE_CODE = 'PILOT_STRICT_MODE_UNAVAILABLE'

class PilotAgentRuntime extends AbstractAgentRuntime {}

function createCapabilityRegistryV1(): CapabilityRegistry {
  const registry = new CapabilityRegistry()

  registry.register({
    id: 'text.chat',
    description: 'Text chat capability for Pilot V1.',
    enabled: true,
    invoke: async input => input,
    annotations: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      streamable: true,
      requiresApproval: false,
    },
  })

  const disabledCapabilities = [
    'file.write',
    'plugin.install',
    'network.request',
    'system.command',
  ]

  for (const id of disabledCapabilities) {
    registry.register({
      id,
      description: `${id} is registered but disabled in Pilot V1.`,
      enabled: false,
      invoke: async () => ({ disabled: true }),
      annotations: {
        destructive: true,
        requiresApproval: true,
      },
    })
  }

  return registry
}

export interface CreatePilotRuntimeOptions {
  event: H3Event
  userId: string
  channel?: {
    channelId: string
    baseUrl: string
    apiKey: string
    model: string
    adapter: PilotChannelAdapter
    transport: PilotChannelTransport
    timeoutMs: number
    builtinTools: PilotBuiltinTool[]
  }
  emit?: (event: AgentEnvelope) => Promise<void>
  onAudit?: (record: DeepAgentAuditRecord) => Promise<void> | void
  orchestrator?: {
    mode?: 'langgraph-local' | 'deepagent'
    reason?: string
    endpoint?: string
    apiKey?: string
    assistantId?: string
    graphProfile?: string
  }
  strictPilotMode?: boolean
  allowDeepAgentFallback?: boolean
  promptContext?: {
    name?: string
    ip?: string
    ua?: string
  }
}

interface PilotStrictModeUnavailableErrorData {
  code: typeof PILOT_STRICT_MODE_UNAVAILABLE_CODE
  reason: string
  orchestratorMode: string
  endpoint?: string
  assistantId?: string
  graphProfile?: string
}

export class PilotStrictModeUnavailableError extends Error {
  readonly code = PILOT_STRICT_MODE_UNAVAILABLE_CODE
  readonly statusCode = 503
  readonly data: PilotStrictModeUnavailableErrorData

  constructor(data: {
    reason: string
    orchestratorMode?: string
    endpoint?: string
    assistantId?: string
    graphProfile?: string
  }) {
    super('Pilot strict mode requires available LangGraph runtime and cannot fallback to DeepAgent.')
    this.name = 'PilotStrictModeUnavailableError'
    this.data = {
      code: PILOT_STRICT_MODE_UNAVAILABLE_CODE,
      reason: String(data.reason || '').trim() || 'strict_mode_unavailable',
      orchestratorMode: String(data.orchestratorMode || '').trim() || 'deepagent',
      endpoint: String(data.endpoint || '').trim() || undefined,
      assistantId: String(data.assistantId || '').trim() || undefined,
      graphProfile: String(data.graphProfile || '').trim() || undefined,
    }
  }
}

function normalizeTimeoutMs(value: unknown): number {
  if (value === null || value === undefined) {
    return DEFAULT_TIMEOUT_MS
  }
  if (typeof value === 'string' && !value.trim()) {
    return DEFAULT_TIMEOUT_MS
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TIMEOUT_MS
  }
  return Math.min(Math.max(Math.floor(parsed), MIN_TIMEOUT_MS), MAX_TIMEOUT_MS)
}

class PilotFallbackEngineAdapter implements AgentEngineAdapter {
  readonly id = 'pilot-fallback-engine'

  constructor(
    private readonly primary: AgentEngineAdapter,
    private readonly fallback: AgentEngineAdapter,
    private readonly onFallback?: (payload: {
      reason: 'primary_error' | 'primary_empty'
      error?: unknown
      primaryEngineId: string
      fallbackEngineId: string
    }) => Promise<void> | void,
  ) {}

  async run(state: Parameters<AgentEngineAdapter['run']>[0]): Promise<unknown> {
    try {
      return await this.primary.run(state)
    }
    catch (error) {
      await this.onFallback?.({
        reason: 'primary_error',
        error,
        primaryEngineId: this.primary.id,
        fallbackEngineId: this.fallback.id,
      })
      return await this.fallback.run(state)
    }
  }

  async* runStream(state: Parameters<AgentEngineAdapter['run']>[0]): AsyncIterable<unknown> {
    let emitted = false
    try {
      const source = typeof this.primary.runStream === 'function'
        ? this.primary.runStream(state)
        : this.singleRunAsStream(this.primary, state)

      for await (const item of source) {
        emitted = true
        yield item
      }
      if (emitted) {
        return
      }
      await this.onFallback?.({
        reason: 'primary_empty',
        primaryEngineId: this.primary.id,
        fallbackEngineId: this.fallback.id,
      })
    }
    catch (error) {
      if (emitted) {
        throw error
      }
      await this.onFallback?.({
        reason: 'primary_error',
        error,
        primaryEngineId: this.primary.id,
        fallbackEngineId: this.fallback.id,
      })
    }

    const fallbackSource = typeof this.fallback.runStream === 'function'
      ? this.fallback.runStream(state)
      : this.singleRunAsStream(this.fallback, state)
    for await (const item of fallbackSource) {
      yield item
    }
  }

  private async* singleRunAsStream(
    engine: AgentEngineAdapter,
    state: Parameters<AgentEngineAdapter['run']>[0],
  ): AsyncIterable<unknown> {
    yield await engine.run(state)
  }
}

export function createPilotRuntime(options: CreatePilotRuntimeOptions) {
  const { event, userId, emit, onAudit, channel, orchestrator } = options
  if (!channel?.baseUrl || !channel.apiKey) {
    throw new Error('Pilot channel is not configured.')
  }
  const strictPilotMode = options.strictPilotMode === true
  const allowDeepAgentFallback = strictPilotMode
    ? false
    : options.allowDeepAgentFallback !== false
  const store = createPilotStoreAdapter(event, userId, emit)
  const capabilityRegistry = createCapabilityRegistryV1()
  const dispatcher = new DecisionDispatcher({
    capabilityRegistry,
  })
  const baseUrl = String(channel.baseUrl || '').trim()
  const apiKey = String(channel.apiKey || '').trim()
  const model = String(channel?.model || '').trim() || DEFAULT_RESPONSES_MODEL
  const timeoutMs = normalizeTimeoutMs(channel?.timeoutMs)
  const builtinTools: PilotBuiltinTool[] = Array.isArray(channel?.builtinTools) && channel.builtinTools.length > 0
    ? channel.builtinTools
    : ['write_todos']
  const engineBuiltinTools = builtinTools
    .filter((tool): tool is Exclude<PilotBuiltinTool, 'websearch'> => tool !== 'websearch')
  if (engineBuiltinTools.length <= 0) {
    engineBuiltinTools.push('write_todos')
  }
  const retryCount = 1
  const systemPrompt = buildPilotSystemPrompt({
    event,
    userId,
    name: options.promptContext?.name,
    ip: options.promptContext?.ip,
    ua: options.promptContext?.ua,
  })

  const deepAgentEngine = new DeepAgentLangChainEngineAdapter({
    baseUrl,
    apiKey,
    model,
    transport: channel?.transport || 'responses',
    retryCount,
    timeoutMs,
    systemPrompt,
    builtinTools: engineBuiltinTools,
    metadata: {
      source: 'tuff-pilot',
      channelId: channel?.channelId,
      channelAdapter: channel?.adapter,
      channelTransport: channel?.transport,
      requestedBuiltinTools: builtinTools,
      websearchEnabled: builtinTools.includes('websearch'),
    },
    onAudit,
  })

  const orchestratorMode = String(orchestrator?.mode || '').trim() || 'deepagent'
  const orchestratorReason = String(orchestrator?.reason || '').trim() || 'orchestrator_mode_not_langgraph'
  const assistantId = String(orchestrator?.assistantId || '').trim()
  const endpoint = String(orchestrator?.endpoint || '').trim()
  const graphProfile = String(orchestrator?.graphProfile || '').trim()
  const langGraphReady = orchestratorMode === 'langgraph-local' && Boolean(assistantId) && Boolean(endpoint)

  if (strictPilotMode && !langGraphReady) {
    throw new PilotStrictModeUnavailableError({
      reason: orchestratorReason || 'strict_mode_graph_runtime_unavailable',
      orchestratorMode,
      endpoint: endpoint || undefined,
      assistantId: assistantId || undefined,
      graphProfile: graphProfile || undefined,
    })
  }

  let engine: AgentEngineAdapter = deepAgentEngine
  if (langGraphReady) {
    const langGraphEngine = new LangGraphLocalServerEngineAdapter({
      baseUrl: endpoint,
      apiKey: String(orchestrator.apiKey || '').trim(),
      assistantId,
      graphProfile: graphProfile || undefined,
      timeoutMs,
      metadata: {
        source: 'tuff-pilot',
        channelId: channel?.channelId,
        model,
        requestedBuiltinTools: builtinTools,
      },
      onAudit,
    })

    if (allowDeepAgentFallback) {
      engine = new PilotFallbackEngineAdapter(
        langGraphEngine,
        deepAgentEngine,
        async (payload) => {
          await onAudit?.({
            type: 'orchestrator.fallback',
            payload: {
              ...payload,
              reason: payload.reason,
              error: payload.error instanceof Error
                ? payload.error.message
                : payload.error
                  ? String(payload.error)
                  : undefined,
            },
          })
        },
      )
    }
    else {
      engine = langGraphEngine
    }
  }

  const decision = new DefaultDecisionAdapter()
  const runtime = new PilotAgentRuntime({
    engine,
    decision,
    dispatcher,
    store,
  })

  return {
    runtime,
    store,
  }
}

export function mapEnvelopeToPilotEvent(envelope: AgentEnvelope): {
  type: AgentEventType | 'run.metrics' | 'done'
  envelope: AgentEnvelope
  timestamp: number
} {
  return {
    type: envelope.type,
    envelope,
    timestamp: Date.now(),
  }
}
