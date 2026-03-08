import type {
  AgentEnvelope,
  AgentEventType,
  DeepAgentAuditRecord,
} from '@talex-touch/tuff-intelligence'
import type { H3Event } from 'h3'
import process from 'node:process'
import {
  AbstractAgentRuntime,
  CapabilityRegistry,
  DecisionDispatcher,
  DeepAgentLangChainEngineAdapter,
  DefaultDecisionAdapter,
} from '@talex-touch/tuff-intelligence'
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

function getPilotRuntimeConfig(event: H3Event): Record<string, unknown> {
  const runtimeConfig = (event.context as { runtimeConfig?: Record<string, unknown> }).runtimeConfig
  return runtimeConfig?.pilot && typeof runtimeConfig.pilot === 'object'
    ? (runtimeConfig.pilot as Record<string, unknown>)
    : {}
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function resolvePilotConfigValue(
  event: H3Event,
  pilotConfig: Record<string, unknown>,
  key: string,
  envKeys: string[],
): string {
  const cloudflareEnv = (event.context.cloudflare as { env?: Record<string, unknown> } | undefined)?.env
  for (const envKey of envKeys) {
    const fromCloudflare = toStringValue(cloudflareEnv?.[envKey])
    if (fromCloudflare) {
      return fromCloudflare
    }
  }

  for (const envKey of envKeys) {
    const fromProcess = toStringValue(process.env[envKey])
    if (fromProcess) {
      return fromProcess
    }
  }

  const fromRuntimeConfig = toStringValue(pilotConfig[key])
  if (fromRuntimeConfig) {
    return fromRuntimeConfig
  }

  return ''
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
  const pilotConfig = getPilotRuntimeConfig(event)
  const baseUrl = resolvePilotConfigValue(event, pilotConfig, 'baseUrl', BASE_URL_ENV_KEYS)
  const apiKey = resolvePilotConfigValue(event, pilotConfig, 'apiKey', API_KEY_ENV_KEYS)

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
