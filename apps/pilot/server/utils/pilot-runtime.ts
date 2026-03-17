import type {
  AgentEngineAdapter,
  AgentEnvelope,
  AgentEventType,
  DeepAgentAuditRecord,
} from '@talex-touch/tuff-intelligence'
import type { H3Event } from 'h3'
import type { PilotBuiltinTool, PilotChannelAdapter, PilotChannelTransport } from './pilot-channel'
import {
  AbstractAgentRuntime,
  CapabilityRegistry,
  DecisionDispatcher,
  DeepAgentLangChainEngineAdapter,
  DefaultDecisionAdapter,
} from '@talex-touch/tuff-intelligence'
import { LangGraphLocalServerEngineAdapter } from './pilot-langgraph-engine'
import { createPilotStoreAdapter } from './pilot-store'

const DEFAULT_RESPONSES_MODEL = 'gpt-5.2'
const DEFAULT_TIMEOUT_MS = 90_000
const MIN_TIMEOUT_MS = 3_000
const MAX_TIMEOUT_MS = 10 * 60 * 1000
const DEFAULT_SYSTEM_PROMPT = [
  'You are Tuff Pilot.',
  'Reply with concise, factual answers.',
  'When useful, add short actionable next steps.',
  'If uncertain, state the uncertainty briefly instead of guessing.',
].join('\n')

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
    endpoint?: string
    apiKey?: string
    assistantId?: string
    graphProfile?: string
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
  const retryCount = channel?.adapter === 'legacy' ? 0 : 1

  const deepAgentEngine = new DeepAgentLangChainEngineAdapter({
    baseUrl,
    apiKey,
    model,
    transport: channel?.transport || 'responses',
    retryCount,
    timeoutMs,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
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

  let engine: AgentEngineAdapter = deepAgentEngine
  if (
    orchestrator?.mode === 'langgraph-local'
    && String(orchestrator.assistantId || '').trim()
    && String(orchestrator.endpoint || '').trim()
  ) {
    const langGraphEngine = new LangGraphLocalServerEngineAdapter({
      baseUrl: String(orchestrator.endpoint || '').trim(),
      apiKey: String(orchestrator.apiKey || '').trim(),
      assistantId: String(orchestrator.assistantId || '').trim(),
      graphProfile: String(orchestrator.graphProfile || '').trim() || undefined,
      timeoutMs,
      metadata: {
        source: 'tuff-pilot',
        channelId: channel?.channelId,
        model,
        requestedBuiltinTools: builtinTools,
      },
      onAudit,
    })

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
