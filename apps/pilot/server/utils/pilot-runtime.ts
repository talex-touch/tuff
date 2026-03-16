import type {
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

export function createPilotRuntime(options: CreatePilotRuntimeOptions) {
  const { event, userId, emit, onAudit, channel } = options
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
  const retryCount = channel?.adapter === 'legacy' ? 0 : 1

  const engine = new DeepAgentLangChainEngineAdapter({
    baseUrl,
    apiKey,
    model,
    transport: channel?.transport || 'responses',
    retryCount,
    timeoutMs,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    builtinTools,
    metadata: {
      source: 'tuff-pilot',
      channelId: channel?.channelId,
      channelAdapter: channel?.adapter,
      channelTransport: channel?.transport,
    },
    onAudit,
  })

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
