import type {
  AgentEnvelope,
  AgentEventType,
  DeepAgentAuditRecord,
} from '@talex-touch/tuff-intelligence'
import type { H3Event } from 'h3'
import {
  AbstractAgentRuntime,
  CapabilityRegistry,
  DecisionDispatcher,
  DeepAgentLangChainEngineAdapter,
  DefaultDecisionAdapter,
} from '@talex-touch/tuff-intelligence'
import { resolvePilotConfigString } from './pilot-config'
import { createPilotStoreAdapter } from './pilot-store'

const DEFAULT_RESPONSES_MODEL = 'gpt-5.4'
const DEFAULT_SYSTEM_PROMPT = [
  'You are Tuff Pilot, a concise and reliable AI assistant.',
  'Always provide direct, factual answers and show actionable next steps when useful.',
].join('\n')
const BASE_URL_ENV_KEYS = ['NUXT_PILOT_BASE_URL']
const API_KEY_ENV_KEYS = ['NUXT_PILOT_API_KEY']

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
  emit?: (event: AgentEnvelope) => Promise<void>
  onAudit?: (record: DeepAgentAuditRecord) => Promise<void> | void
}

export function createPilotRuntime(options: CreatePilotRuntimeOptions) {
  const { event, userId, emit, onAudit } = options
  const store = createPilotStoreAdapter(event, userId, emit)
  const capabilityRegistry = createCapabilityRegistryV1()
  const dispatcher = new DecisionDispatcher({
    capabilityRegistry,
  })
  const baseUrl = resolvePilotConfigString(event, 'baseUrl', BASE_URL_ENV_KEYS)
  const apiKey = resolvePilotConfigString(event, 'apiKey', API_KEY_ENV_KEYS)

  const engine = new DeepAgentLangChainEngineAdapter({
    baseUrl,
    apiKey,
    model: DEFAULT_RESPONSES_MODEL,
    retryCount: 1,
    timeoutMs: 25_000,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    builtinTools: ['write_todos'],
    metadata: {
      source: 'tuff-pilot',
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
