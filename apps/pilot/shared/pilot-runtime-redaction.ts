export {
  shouldHidePilotClientRuntimeEvent,
  shouldHidePilotClientSystemMessage,
} from '@talex-touch/tuff-intelligence/pilot'

const ROUTING_SENSITIVE_KEYS = new Set([
  'adapter',
  'channelId',
  'channel_id',
  'modelId',
  'model_id',
  'orchestratorAssistantId',
  'orchestrator_assistant_id',
  'orchestratorEndpoint',
  'orchestrator_endpoint',
  'orchestratorGraphProfile',
  'orchestrator_graph_profile',
  'orchestratorMode',
  'orchestrator_mode',
  'orchestratorReason',
  'orchestrator_reason',
  'providerModel',
  'provider_model',
  'providerTargetType',
  'provider_target_type',
  'routeComboId',
  'route_combo_id',
  'scene',
  'selectionReason',
  'selection_reason',
  'selectionSource',
  'selection_source',
  'transport',
])

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function toNonNegativeInteger(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }
  return Math.floor(parsed)
}

export function redactPilotClientErrorDetail(input: unknown): Record<string, unknown> {
  const record = toRecord(input)
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (ROUTING_SENSITIVE_KEYS.has(key)) {
      continue
    }
    next[key] = value
  }
  return next
}

export function redactPilotClientTracePayload(type: unknown, payload: unknown): Record<string, unknown> {
  const normalizedType = normalizeText(type).toLowerCase()
  if (normalizedType === 'error') {
    return redactPilotClientErrorDetail(payload)
  }
  return toRecord(payload)
}

export function buildPilotRedactedRoutingTracePayload(input: {
  intentType?: unknown
  internet?: unknown
  thinking?: unknown
  memoryEnabled?: unknown
  memoryHistoryMessageCount?: unknown
  builtinTools?: unknown
}): Record<string, unknown> {
  const builtinToolsCount = Array.isArray(input.builtinTools)
    ? input.builtinTools.filter(Boolean).length
    : 0

  return {
    redacted: true,
    resolved: true,
    intentType: normalizeText(input.intentType) || 'chat',
    internet: input.internet === true,
    thinking: input.thinking === true,
    memoryEnabled: input.memoryEnabled === true,
    memoryHistoryMessageCount: toNonNegativeInteger(input.memoryHistoryMessageCount),
    builtinToolsCount,
  }
}
