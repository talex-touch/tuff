import type { H3Event } from 'h3'
import type { ProviderRegistryRecord } from './providerRegistryStore'
import type { SceneRegistryRecord, SceneStrategyBindingRecord } from './sceneRegistryStore'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { getProviderRegistryEntry } from './providerRegistryStore'
import { getSceneRegistryEntry } from './sceneRegistryStore'
import { invokeTencentTextTranslate } from './tencentMachineTranslationProvider'

export type SceneRunStatus = 'planned' | 'completed' | 'failed'
export type SceneRunMode = 'dry_run' | 'execute'
export type SceneRunTraceStatus = 'success' | 'skipped' | 'failed'
export type SceneRunErrorCode =
  | 'SCENE_NOT_FOUND'
  | 'SCENE_DISABLED'
  | 'CAPABILITY_UNSUPPORTED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_ADAPTER_UNAVAILABLE'
  | 'PROVIDER_ADAPTER_FAILED'

export interface SceneRunUsage {
  unit: string
  quantity: number
  billable: boolean
  providerId?: string
  capability?: string
  estimated?: boolean
  pricingRef?: string
  providerUsageRef?: string
}

export interface SceneRunTraceStep {
  phase: 'scene.load' | 'provider.resolve' | 'strategy.select' | 'adapter.dispatch'
  status: SceneRunTraceStatus
  at: string
  message: string
  metadata?: Record<string, string | number | boolean | null>
}

export interface SceneRunCandidate {
  providerId: string
  providerName: string
  vendor: string
  capability: string
  priority: number
  weight: number | null
  bindingId: string
}

export interface SceneRunSelection extends SceneRunCandidate {
  authRef: string | null
  endpoint: string | null
  region: string | null
}

export interface SceneRunFallbackTrailItem {
  providerId: string
  capability: string
  status: 'candidate' | 'selected' | 'rejected' | 'failed'
  reason?: string
}

export interface SceneRunResult {
  runId: string
  sceneId: string
  status: SceneRunStatus
  mode: SceneRunMode
  strategyMode: SceneRegistryRecord['strategyMode']
  requestedCapabilities: string[]
  selected: SceneRunSelection[]
  candidates: SceneRunCandidate[]
  fallbackTrail: SceneRunFallbackTrailItem[]
  trace: SceneRunTraceStep[]
  usage: SceneRunUsage[]
  output: unknown
  error?: {
    code: SceneRunErrorCode
    message: string
  }
}

export interface SceneRunInput {
  input?: unknown
  capability?: unknown
  providerId?: unknown
  dryRun?: unknown
}

export interface SceneAdapterContext {
  event: H3Event
  runId: string
  scene: SceneRegistryRecord
  provider: ProviderRegistryRecord
  capability: string
  input: unknown
}

export interface SceneAdapterResult {
  output: unknown
  usage?: SceneRunUsage[]
  providerRequestId?: string
  latencyMs?: number
}

export type SceneCapabilityAdapter = (context: SceneAdapterContext) => Promise<SceneAdapterResult>

const sceneCapabilityAdapters = new Map<string, SceneCapabilityAdapter>()

const tencentTextTranslateAdapter: SceneCapabilityAdapter = async ({ event, provider, input }) => {
  const result = await invokeTencentTextTranslate(event, provider, input as { text?: unknown, sourceLang?: unknown, targetLang?: unknown, projectId?: unknown })
  return {
    output: {
      translatedText: result.translatedText,
    },
    providerRequestId: result.providerRequestId,
    latencyMs: result.latencyMs,
    usage: [
      {
        ...result.usage,
        providerId: provider.id,
        capability: 'text.translate',
      },
    ],
  }
}

function registerDefaultSceneCapabilityAdapters() {
  registerSceneCapabilityAdapter('tencent-cloud:text.translate', tencentTextTranslateAdapter)
}

registerDefaultSceneCapabilityAdapters()

export function registerSceneCapabilityAdapter(key: string, adapter: SceneCapabilityAdapter): () => void {
  const normalizedKey = normalizeAdapterKey(key)
  sceneCapabilityAdapters.set(normalizedKey, adapter)
  return () => {
    if (sceneCapabilityAdapters.get(normalizedKey) === adapter)
      sceneCapabilityAdapters.delete(normalizedKey)
  }
}

export function clearSceneCapabilityAdaptersForTest() {
  sceneCapabilityAdapters.clear()
}

export function resetSceneCapabilityAdaptersForTest() {
  sceneCapabilityAdapters.clear()
  registerDefaultSceneCapabilityAdapters()
}

function nowIso() {
  return new Date().toISOString()
}

function addTrace(
  trace: SceneRunTraceStep[],
  phase: SceneRunTraceStep['phase'],
  status: SceneRunTraceStatus,
  message: string,
  metadata?: SceneRunTraceStep['metadata'],
) {
  trace.push({
    phase,
    status,
    at: nowIso(),
    message,
    metadata,
  })
}

function normalizeAdapterKey(key: string) {
  return key.trim().toLowerCase()
}

function resolveAdapter(provider: ProviderRegistryRecord, capability: string): SceneCapabilityAdapter | null {
  const keys = [
    `${provider.vendor}:${capability}`,
    `${provider.vendor}:*`,
    `*:${capability}`,
  ].map(normalizeAdapterKey)

  for (const key of keys) {
    const adapter = sceneCapabilityAdapters.get(key)
    if (adapter)
      return adapter
  }

  return null
}

function readOptionalString(value: unknown, maxLength = 160): string | null {
  if (typeof value !== 'string')
    return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength)
    return null
  return trimmed
}

function readDryRun(value: unknown) {
  return value === true || value === 'true'
}

function resolveRequestedCapabilities(scene: SceneRegistryRecord, request: SceneRunInput): string[] {
  const requestedCapability = readOptionalString(request.capability, 120)
  if (requestedCapability)
    return [requestedCapability]

  if (scene.requiredCapabilities.length > 0)
    return scene.requiredCapabilities

  return [...new Set(scene.bindings.map(binding => binding.capability))]
}

function providerHasCapability(provider: ProviderRegistryRecord, capability: string) {
  return provider.capabilities.some(item => item.capability === capability)
}

function compareCandidates(a: SceneRunCandidate, b: SceneRunCandidate) {
  if (a.priority !== b.priority)
    return a.priority - b.priority
  const weightA = a.weight ?? 0
  const weightB = b.weight ?? 0
  if (weightA !== weightB)
    return weightB - weightA
  return a.providerId.localeCompare(b.providerId)
}

async function resolveProvider(
  event: H3Event,
  providerId: string,
  cache: Map<string, ProviderRegistryRecord | null>,
) {
  if (!cache.has(providerId)) {
    cache.set(providerId, await getProviderRegistryEntry(event, providerId))
  }
  return cache.get(providerId) ?? null
}

function createRunError(statusCode: number, code: SceneRunErrorCode, message: string, run?: SceneRunResult): Error {
  return createError({
    statusCode,
    statusMessage: message,
    data: {
      code,
      run,
    },
  })
}

async function resolveCandidatesForCapability(
  event: H3Event,
  scene: SceneRegistryRecord,
  capability: string,
  providerCache: Map<string, ProviderRegistryRecord | null>,
  trace: SceneRunTraceStep[],
  fallbackTrail: SceneRunFallbackTrailItem[],
): Promise<Array<{ candidate: SceneRunCandidate, provider: ProviderRegistryRecord }>> {
  const resolved: Array<{ candidate: SceneRunCandidate, provider: ProviderRegistryRecord }> = []
  const bindings = scene.bindings.filter(binding => binding.capability === capability)

  for (const binding of bindings) {
    const provider = await resolveProvider(event, binding.providerId, providerCache)
    if (!provider) {
      fallbackTrail.push({
        providerId: binding.providerId,
        capability,
        status: 'rejected',
        reason: 'provider_not_found',
      })
      continue
    }

    const rejectReason = resolveBindingRejectReason(binding, provider, capability)
    if (rejectReason) {
      fallbackTrail.push({
        providerId: provider.id,
        capability,
        status: 'rejected',
        reason: rejectReason,
      })
      continue
    }

    const candidate: SceneRunCandidate = {
      providerId: provider.id,
      providerName: provider.displayName,
      vendor: provider.vendor,
      capability,
      priority: binding.priority,
      weight: binding.weight,
      bindingId: binding.id,
    }
    resolved.push({ candidate, provider })
    fallbackTrail.push({
      providerId: provider.id,
      capability,
      status: 'candidate',
    })
  }

  addTrace(trace, 'provider.resolve', resolved.length > 0 ? 'success' : 'failed', `Resolved ${resolved.length} candidate provider(s) for ${capability}.`, {
    capability,
    candidates: resolved.length,
  })

  return resolved.sort((a, b) => compareCandidates(a.candidate, b.candidate))
}

function resolveBindingRejectReason(
  binding: SceneStrategyBindingRecord,
  provider: ProviderRegistryRecord,
  capability: string,
): string | null {
  if (binding.status !== 'enabled')
    return 'binding_disabled'
  if (provider.status !== 'enabled')
    return `provider_${provider.status}`
  if (!providerHasCapability(provider, capability))
    return 'provider_capability_missing'
  return null
}

function toSelection(candidate: SceneRunCandidate, provider: ProviderRegistryRecord): SceneRunSelection {
  return {
    ...candidate,
    authRef: provider.authRef,
    endpoint: provider.endpoint,
    region: provider.region,
  }
}

export async function runSceneOrchestrator(
  event: H3Event,
  sceneId: string,
  request: SceneRunInput = {},
): Promise<SceneRunResult> {
  const runId = `scene_run_${randomUUID()}`
  const trace: SceneRunTraceStep[] = []
  const fallbackTrail: SceneRunFallbackTrailItem[] = []
  const selected: SceneRunSelection[] = []
  const selectedProviders: ProviderRegistryRecord[] = []
  const candidates: SceneRunCandidate[] = []
  const usage: SceneRunUsage[] = []
  const dryRun = readDryRun(request.dryRun)
  const mode: SceneRunMode = dryRun ? 'dry_run' : 'execute'
  const safeSceneId = readOptionalString(sceneId, 180)

  if (!safeSceneId) {
    throw createRunError(400, 'SCENE_NOT_FOUND', 'sceneId is required.')
  }

  const scene = await getSceneRegistryEntry(event, safeSceneId)
  if (!scene) {
    throw createRunError(404, 'SCENE_NOT_FOUND', 'Scene registry entry not found.')
  }

  addTrace(trace, 'scene.load', 'success', 'Loaded scene registry entry.', {
    sceneId: scene.id,
    status: scene.status,
  })

  const requestedCapabilities = resolveRequestedCapabilities(scene, request)
  const baseRun: Omit<SceneRunResult, 'status' | 'output'> = {
    runId,
    sceneId: scene.id,
    mode,
    strategyMode: scene.strategyMode,
    requestedCapabilities,
    selected,
    candidates,
    fallbackTrail,
    trace,
    usage,
  }

  if (scene.status !== 'enabled') {
    const run: SceneRunResult = {
      ...baseRun,
      status: 'failed',
      output: null,
      error: {
        code: 'SCENE_DISABLED',
        message: 'Scene is disabled.',
      },
    }
    addTrace(trace, 'strategy.select', 'failed', 'Scene is disabled.')
    throw createRunError(409, 'SCENE_DISABLED', 'Scene is disabled.', run)
  }

  if (requestedCapabilities.length === 0) {
    const run: SceneRunResult = {
      ...baseRun,
      status: 'failed',
      output: null,
      error: {
        code: 'CAPABILITY_UNSUPPORTED',
        message: 'Scene has no required capability or binding.',
      },
    }
    addTrace(trace, 'strategy.select', 'failed', 'Scene has no required capability or binding.')
    throw createRunError(400, 'CAPABILITY_UNSUPPORTED', 'Scene has no required capability or binding.', run)
  }

  const providerCache = new Map<string, ProviderRegistryRecord | null>()
  const requestedProviderId = readOptionalString(request.providerId, 160)

  for (const capability of requestedCapabilities) {
    const resolvedCandidates = await resolveCandidatesForCapability(event, scene, capability, providerCache, trace, fallbackTrail)
    candidates.push(...resolvedCandidates.map(item => item.candidate))

    const scopedCandidates = requestedProviderId
      ? resolvedCandidates.filter(item => item.provider.id === requestedProviderId)
      : resolvedCandidates

    const picked = scopedCandidates[0]
    if (!picked) {
      const run: SceneRunResult = {
        ...baseRun,
        status: 'failed',
        output: null,
        error: {
          code: 'CAPABILITY_UNSUPPORTED',
          message: `No enabled provider capability is available for ${capability}.`,
        },
      }
      addTrace(trace, 'strategy.select', 'failed', `No enabled provider capability is available for ${capability}.`, {
        capability,
        requestedProviderId,
      })
      throw createRunError(409, 'CAPABILITY_UNSUPPORTED', `No enabled provider capability is available for ${capability}.`, run)
    }

    selected.push(toSelection(picked.candidate, picked.provider))
    selectedProviders.push(picked.provider)
    fallbackTrail.push({
      providerId: picked.provider.id,
      capability,
      status: 'selected',
    })
  }

  addTrace(trace, 'strategy.select', 'success', `Selected ${selected.length} provider capability path(s).`, {
    strategyMode: scene.strategyMode,
    selected: selected.length,
  })

  if (dryRun) {
    addTrace(trace, 'adapter.dispatch', 'skipped', 'Dry run requested; provider adapters were not invoked.')
    return {
      ...baseRun,
      status: 'planned',
      output: null,
    }
  }

  const outputs: Record<string, unknown> = {}
  for (let index = 0; index < selected.length; index += 1) {
    const selection = selected[index]
    const provider = selectedProviders[index]
    if (!selection || !provider) {
      const run: SceneRunResult = {
        ...baseRun,
        status: 'failed',
        output: Object.keys(outputs).length === 0 ? null : outputs,
        error: {
          code: 'PROVIDER_UNAVAILABLE',
          message: 'Selected provider path is incomplete.',
        },
      }
      addTrace(trace, 'adapter.dispatch', 'failed', 'Selected provider path is incomplete.')
      throw createRunError(500, 'PROVIDER_UNAVAILABLE', 'Selected provider path is incomplete.', run)
    }
    const adapter = resolveAdapter(provider, selection.capability)

    if (!adapter) {
      const run: SceneRunResult = {
        ...baseRun,
        status: 'failed',
        output: Object.keys(outputs).length === 0 ? null : outputs,
        error: {
          code: 'PROVIDER_ADAPTER_UNAVAILABLE',
          message: `No provider adapter registered for ${provider.vendor}:${selection.capability}.`,
        },
      }
      addTrace(trace, 'adapter.dispatch', 'failed', `No provider adapter registered for ${provider.vendor}:${selection.capability}.`, {
        providerId: provider.id,
        capability: selection.capability,
      })
      throw createRunError(501, 'PROVIDER_ADAPTER_UNAVAILABLE', `No provider adapter registered for ${provider.vendor}:${selection.capability}.`, run)
    }

    try {
      const result = await adapter({
        event,
        runId,
        scene,
        provider,
        capability: selection.capability,
        input: request.input,
      })
      outputs[selection.capability] = result.output
      usage.push(...(result.usage ?? []))
      addTrace(trace, 'adapter.dispatch', 'success', `Provider adapter completed ${selection.capability}.`, {
        providerId: provider.id,
        capability: selection.capability,
        providerRequestId: result.providerRequestId ?? null,
        latencyMs: result.latencyMs ?? null,
      })
    }
    catch (error) {
      fallbackTrail.push({
        providerId: provider.id,
        capability: selection.capability,
        status: 'failed',
        reason: error instanceof Error ? error.message : 'adapter_failed',
      })
      const run: SceneRunResult = {
        ...baseRun,
        status: 'failed',
        output: Object.keys(outputs).length === 0 ? null : outputs,
        error: {
          code: 'PROVIDER_ADAPTER_FAILED',
          message: error instanceof Error ? error.message : 'Provider adapter failed.',
        },
      }
      addTrace(trace, 'adapter.dispatch', 'failed', `Provider adapter failed ${selection.capability}.`, {
        providerId: provider.id,
        capability: selection.capability,
      })
      throw createRunError(502, 'PROVIDER_ADAPTER_FAILED', run.error?.message ?? 'Provider adapter failed.', run)
    }
  }

  const firstSelection = selected[0]
  return {
    ...baseRun,
    status: 'completed',
    output: selected.length === 1 && firstSelection ? outputs[firstSelection.capability] : outputs,
  }
}
