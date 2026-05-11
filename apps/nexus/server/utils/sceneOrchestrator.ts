import type { H3Event } from 'h3'
import type { ProviderRegistryRecord } from './providerRegistryStore'
import type { SceneRegistryRecord, SceneStrategyBindingRecord } from './sceneRegistryStore'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { getLatestProviderHealthChecks, type ProviderHealthCheckEntry } from './providerHealthStore'
import { getProviderRegistryEntry } from './providerRegistryStore'
import { recordProviderUsageLedger } from './providerUsageLedgerStore'
import { getSceneRegistryEntry } from './sceneRegistryStore'
import { invokeIntelligenceVisionOcr } from './intelligenceVisionOcrProvider'
import { invokeTencentImageTranslate, invokeTencentTextTranslate } from './tencentMachineTranslationProvider'
import { convertUsd, getUsdRates } from './exchangeRateService'

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
  originalInput: unknown
  outputs: Readonly<Record<string, unknown>>
}

export interface SceneAdapterResult {
  output: unknown
  usage?: SceneRunUsage[]
  providerRequestId?: string
  latencyMs?: number
}

export type SceneCapabilityAdapter = (context: SceneAdapterContext) => Promise<SceneAdapterResult>

interface ResolvedSceneCandidate {
  candidate: SceneRunCandidate
  provider: ProviderRegistryRecord
  binding: SceneStrategyBindingRecord
}

interface CapabilityExecutionPlan {
  capability: string
  candidates: ResolvedSceneCandidate[]
}

interface SceneRunFailure {
  statusCode: number
  code: SceneRunErrorCode
  message: string
}

const sceneCapabilityAdapters = new Map<string, SceneCapabilityAdapter>()

function normalizeTencentTranslateInput(input: unknown) {
  const record = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {}
  return {
    text: record.text,
    sourceLang: record.sourceLang,
    targetLang: record.targetLang,
    projectId: record.projectId,
  }
}

function normalizeTencentImageTranslateInput(input: unknown) {
  const record = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {}
  return {
    data: record.data,
    imageBase64: record.imageBase64,
    url: record.url,
    imageUrl: record.imageUrl,
    targetLang: record.targetLang,
  }
}

const tencentTextTranslateAdapter: SceneCapabilityAdapter = async ({ event, provider, input }) => {
  const result = await invokeTencentTextTranslate(event, provider, normalizeTencentTranslateInput(input))
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

const tencentImageTranslateAdapter: SceneCapabilityAdapter = async ({ event, provider, input, capability }) => {
  const imageCapability = capability === 'image.translate' ? 'image.translate' : 'image.translate.e2e'
  const result = await invokeTencentImageTranslate(event, provider, normalizeTencentImageTranslateInput(input), imageCapability)
  return {
    output: {
      translatedImageBase64: result.translatedImageBase64,
      sourceLang: result.sourceLang,
      targetLang: result.targetLang,
      sourceText: result.sourceText,
      targetText: result.targetText,
      angle: result.angle,
      transDetails: result.transDetails,
    },
    providerRequestId: result.providerRequestId,
    latencyMs: result.latencyMs,
    usage: [
      {
        ...result.usage,
        providerId: provider.id,
        capability: imageCapability,
      },
    ],
  }
}

const intelligenceVisionOcrAdapter: SceneCapabilityAdapter = async ({ event, provider, input, capability }) => {
  const result = await invokeIntelligenceVisionOcr(event, provider, input)
  return {
    output: result.output,
    providerRequestId: result.providerRequestId,
    latencyMs: result.latencyMs,
    usage: [
      {
        ...result.usage,
        providerId: provider.id,
        capability,
      },
    ],
  }
}

function normalizeFxConvertInput(input: unknown) {
  const record = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {}
  return {
    base: typeof record.base === 'string' ? record.base.trim().toUpperCase() : 'USD',
    target: typeof record.target === 'string' ? record.target.trim().toUpperCase() : '',
    amount: Number(record.amount),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string')
    return null
  const trimmed = value.trim()
  return trimmed || null
}

function stripDataUrlPrefix(value: string): { base64: string, mimeType: string | null } {
  const matched = /^data:([^;,]+);base64,(.+)$/i.exec(value.trim())
  if (!matched)
    return { base64: value.trim(), mimeType: null }

  return {
    base64: matched[2]?.trim() ?? '',
    mimeType: matched[1]?.trim().toLowerCase() ?? null,
  }
}

function readImagePayload(input: Record<string, unknown>): { imageBase64: string | null, imageMimeType: string | null } {
  const mimeType = readString(input.imageMimeType) ?? readString(input.mimeType)
  const rawCandidates = [input.imageBase64, input.data]

  for (const candidate of rawCandidates) {
    const value = readString(candidate)
    if (!value)
      continue

    const parsed = stripDataUrlPrefix(value)
    if (parsed.base64) {
      return {
        imageBase64: parsed.base64,
        imageMimeType: parsed.mimeType ?? mimeType,
      }
    }
  }

  const urlCandidates = [input.url, input.imageUrl]
  for (const candidate of urlCandidates) {
    const value = readString(candidate)
    if (!value?.startsWith('data:image/'))
      continue

    const parsed = stripDataUrlPrefix(value)
    if (parsed.base64) {
      return {
        imageBase64: parsed.base64,
        imageMimeType: parsed.mimeType ?? mimeType,
      }
    }
  }

  return { imageBase64: null, imageMimeType: mimeType }
}

function toIso(value?: number | null): string | null {
  if (!value)
    return null
  return new Date(value).toISOString()
}

const fxRateLatestAdapter: SceneCapabilityAdapter = async ({ event, provider, capability }) => {
  const startedAt = Date.now()
  const { snapshot, source } = await getUsdRates(event)
  const latencyMs = Date.now() - startedAt
  const fetchedAt = toIso(snapshot.fetchedAt) ?? new Date().toISOString()
  const providerUpdatedAt = toIso(snapshot.providerUpdatedAt)
  return {
    output: {
      base: snapshot.baseCurrency,
      asOf: providerUpdatedAt ?? fetchedAt,
      providerUpdatedAt,
      fetchedAt,
      providerNextUpdateAt: toIso(snapshot.providerNextUpdateAt),
      source,
      rates: snapshot.rates,
    },
    providerRequestId: snapshot.id,
    latencyMs,
    usage: [
      {
        unit: 'fx_quote',
        quantity: 1,
        billable: true,
        providerId: provider.id,
        capability,
        estimated: source === 'cache',
      },
    ],
  }
}

const fxConvertAdapter: SceneCapabilityAdapter = async ({ event, provider, input, capability }) => {
  const normalized = normalizeFxConvertInput(input)
  if (normalized.base && normalized.base !== 'USD') {
    throw createError({ statusCode: 400, statusMessage: 'Only USD base is supported.' })
  }
  if (!/^[A-Z]{3}$/.test(normalized.target)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid target currency code.' })
  }
  if (!Number.isFinite(normalized.amount) || normalized.amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid amount.' })
  }

  const startedAt = Date.now()
  const result = await convertUsd(event, {
    target: normalized.target,
    amount: normalized.amount,
  })
  return {
    output: {
      base: 'USD',
      target: normalized.target,
      amount: normalized.amount,
      rate: result.rate,
      converted: result.converted,
      source: result.source,
      updatedAt: result.updatedAt,
      providerUpdatedAt: result.providerUpdatedAt,
      fetchedAt: result.fetchedAt,
      providerNextUpdateAt: result.providerNextUpdateAt,
    },
    providerRequestId: `${normalized.target}:${result.fetchedAt}`,
    latencyMs: Date.now() - startedAt,
    usage: [
      {
        unit: 'fx_quote',
        quantity: 1,
        billable: true,
        providerId: provider.id,
        capability,
        estimated: result.source === 'cache',
      },
    ],
  }
}

function readOutputRecord(outputs: Record<string, unknown>, capability: string): Record<string, unknown> | null {
  const output = outputs[capability]
  return isRecord(output) ? output : null
}

function resolveOcrText(outputs: Record<string, unknown>): string | null {
  const ocrOutput = readOutputRecord(outputs, 'vision.ocr')
  return readString(ocrOutput?.text)
    ?? readString(ocrOutput?.sourceText)
    ?? readString(ocrOutput?.detectedText)
}

function resolveTranslatedText(outputs: Record<string, unknown>): string | null {
  const translateOutput = readOutputRecord(outputs, 'text.translate')
  return readString(translateOutput?.translatedText)
    ?? readString(translateOutput?.targetText)
    ?? readString(translateOutput?.text)
}

function buildCapabilityInput(
  capability: string,
  originalInput: unknown,
  outputs: Record<string, unknown>,
): unknown {
  if (!isRecord(originalInput))
    return originalInput

  if (capability === 'vision.ocr') {
    const { imageBase64, imageMimeType } = readImagePayload(originalInput)
    return {
      ...originalInput,
      source: imageBase64
        ? {
            type: 'data-url',
            dataUrl: `data:${imageMimeType ?? 'image/png'};base64,${imageBase64}`,
          }
        : originalInput.source,
      includeLayout: originalInput.includeLayout ?? true,
      includeKeywords: originalInput.includeKeywords ?? true,
    }
  }

  if (capability === 'text.translate') {
    return {
      ...originalInput,
      text: resolveOcrText(outputs) ?? originalInput.text,
      sourceLang: readOutputRecord(outputs, 'vision.ocr')?.language ?? originalInput.sourceLang,
    }
  }

  if (capability === 'overlay.render') {
    const { imageBase64, imageMimeType } = readImagePayload(originalInput)
    const ocrOutput = readOutputRecord(outputs, 'vision.ocr')
    const sourceText = resolveOcrText(outputs) ?? readString(originalInput.sourceText)
    const targetText = resolveTranslatedText(outputs) ?? readString(originalInput.targetText)
    return {
      ...originalInput,
      imageBase64,
      imageMimeType,
      sourceText,
      targetText,
      blocks: ocrOutput?.blocks,
      ocr: ocrOutput,
      translation: readOutputRecord(outputs, 'text.translate'),
    }
  }

  return {
    ...originalInput,
    previousOutputs: outputs,
  }
}

const localOverlayRenderAdapter: SceneCapabilityAdapter = async ({ input, originalInput, outputs, provider, capability, runId }) => {
  if (!isRecord(input))
    throw createError({ statusCode: 400, statusMessage: 'overlay.render input is invalid.' })

  const targetText = readString(input.targetText)
  if (!targetText)
    throw createError({ statusCode: 400, statusMessage: 'overlay.render requires targetText.' })

  const imageBase64 = readString(input.imageBase64)
  if (!imageBase64)
    throw createError({ statusCode: 400, statusMessage: 'overlay.render requires imageBase64.' })

  const output = {
    translatedImageBase64: imageBase64,
    imageBase64,
    imageMimeType: readString(input.imageMimeType) ?? 'image/png',
    sourceText: readString(input.sourceText) ?? undefined,
    targetText,
    overlay: {
      mode: 'client-render',
      blocks: Array.isArray(input.blocks) ? input.blocks : undefined,
      sourceCapability: 'overlay.render',
    },
    composed: {
      inputCapabilities: Object.keys(outputs),
      originalInputPreserved: Boolean(originalInput),
    },
  }

  return {
    output,
    providerRequestId: `local-overlay:${runId}`,
    latencyMs: 0,
    usage: [
      {
        unit: 'image',
        quantity: 1,
        billable: false,
        providerId: provider.id,
        capability,
        estimated: true,
      },
    ],
  }
}

function registerDefaultSceneCapabilityAdapters() {
  registerSceneCapabilityAdapter('tencent-cloud:text.translate', tencentTextTranslateAdapter)
  registerSceneCapabilityAdapter('tencent-cloud:image.translate', tencentImageTranslateAdapter)
  registerSceneCapabilityAdapter('tencent-cloud:image.translate.e2e', tencentImageTranslateAdapter)
  registerSceneCapabilityAdapter('openai:vision.ocr', intelligenceVisionOcrAdapter)
  registerSceneCapabilityAdapter('deepseek:vision.ocr', intelligenceVisionOcrAdapter)
  registerSceneCapabilityAdapter('custom:vision.ocr', intelligenceVisionOcrAdapter)
  registerSceneCapabilityAdapter('custom:overlay.render', localOverlayRenderAdapter)
  registerSceneCapabilityAdapter('exchange-rate:fx.rate.latest', fxRateLatestAdapter)
  registerSceneCapabilityAdapter('exchange-rate:fx.convert', fxConvertAdapter)
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

function comparePriorityCandidates(a: SceneRunCandidate, b: SceneRunCandidate) {
  if (a.priority !== b.priority)
    return a.priority - b.priority
  const weightA = a.weight ?? 0
  const weightB = b.weight ?? 0
  if (weightA !== weightB)
    return weightB - weightA
  return a.providerId.localeCompare(b.providerId)
}

function readNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readNestedNumber(record: Record<string, unknown> | null | undefined, paths: string[][]): number | null {
  if (!record)
    return null

  for (const path of paths) {
    let current: unknown = record
    for (const part of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        current = undefined
        break
      }
      current = (current as Record<string, unknown>)[part]
    }
    const numeric = readNumber(current)
    if (numeric != null)
      return numeric
  }
  return null
}

function resolveCandidateCost(candidate: ResolvedSceneCandidate): number | null {
  const capability = candidate.provider.capabilities.find(item => item.capability === candidate.candidate.capability)
  return readNestedNumber(candidate.binding.constraints, [
    ['cost'],
    ['estimatedCost'],
    ['unitCost'],
    ['price'],
    ['pricing', 'unitCost'],
    ['pricing', 'estimatedCost'],
  ]) ?? readNestedNumber(capability?.metering, [
    ['cost'],
    ['estimatedCost'],
    ['unitCost'],
    ['price'],
    ['unitPrice'],
    ['pricing', 'unitCost'],
    ['pricing', 'estimatedCost'],
  ]) ?? readNestedNumber(capability?.metadata, [
    ['cost'],
    ['estimatedCost'],
    ['unitCost'],
    ['price'],
    ['pricing', 'unitCost'],
    ['pricing', 'estimatedCost'],
  ])
}

function resolveCandidateLatency(
  candidate: ResolvedSceneCandidate,
  healthByProviderId: Map<string, ProviderHealthCheckEntry>,
): number | null {
  const health = healthByProviderId.get(candidate.provider.id)
  if (health?.status === 'healthy' || health?.status === 'degraded')
    return health.latencyMs

  return readNestedNumber(candidate.binding.constraints, [
    ['latencyMs'],
    ['expectedLatencyMs'],
    ['p50LatencyMs'],
  ]) ?? readNestedNumber(candidate.provider.metadata, [
    ['latencyMs'],
    ['expectedLatencyMs'],
    ['p50LatencyMs'],
  ])
}

function compareNullableNumber(a: number | null, b: number | null) {
  if (a == null && b == null)
    return 0
  if (a == null)
    return 1
  if (b == null)
    return -1
  return a - b
}

function compareStrategyCandidates(
  strategyMode: SceneRegistryRecord['strategyMode'],
  healthByProviderId: Map<string, ProviderHealthCheckEntry>,
  a: ResolvedSceneCandidate,
  b: ResolvedSceneCandidate,
) {
  if (strategyMode === 'least_cost') {
    const costCompare = compareNullableNumber(resolveCandidateCost(a), resolveCandidateCost(b))
    if (costCompare !== 0)
      return costCompare
  }
  else if (strategyMode === 'lowest_latency') {
    const latencyCompare = compareNullableNumber(resolveCandidateLatency(a, healthByProviderId), resolveCandidateLatency(b, healthByProviderId))
    if (latencyCompare !== 0)
      return latencyCompare
  }
  else if (strategyMode === 'balanced') {
    const costCompare = compareNullableNumber(resolveCandidateCost(a), resolveCandidateCost(b))
    const latencyCompare = compareNullableNumber(resolveCandidateLatency(a, healthByProviderId), resolveCandidateLatency(b, healthByProviderId))
    const weightCompare = (b.candidate.weight ?? 0) - (a.candidate.weight ?? 0)
    const balancedCompare = Math.sign(costCompare) + Math.sign(latencyCompare) + Math.sign(weightCompare)
    if (balancedCompare !== 0)
      return balancedCompare
  }

  return comparePriorityCandidates(a.candidate, b.candidate)
}

async function sortCandidatesByStrategy(
  event: H3Event,
  scene: SceneRegistryRecord,
  capability: string,
  candidates: ResolvedSceneCandidate[],
  trace: SceneRunTraceStep[],
): Promise<ResolvedSceneCandidate[]> {
  const healthByProviderId = ['lowest_latency', 'balanced'].includes(scene.strategyMode)
    ? await getLatestProviderHealthChecks(event, {
        providerIds: candidates.map(item => item.provider.id),
        capability,
      })
    : new Map<string, ProviderHealthCheckEntry>()

  const sorted = [...candidates].sort((a, b) => compareStrategyCandidates(scene.strategyMode, healthByProviderId, a, b))
  addTrace(trace, 'strategy.select', 'success', `Applied ${scene.strategyMode} strategy for ${capability}.`, {
    capability,
    strategyMode: scene.strategyMode,
    candidates: sorted.length,
    healthSamples: healthByProviderId.size,
  })
  return sorted
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
): Promise<ResolvedSceneCandidate[]> {
  const resolved: ResolvedSceneCandidate[] = []
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
    resolved.push({ candidate, provider, binding })
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

  return await sortCandidatesByStrategy(event, scene, capability, resolved, trace)
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

function createFailedRun(
  baseRun: Omit<SceneRunResult, 'status' | 'output'>,
  outputs: Record<string, unknown>,
  failure: SceneRunFailure,
): SceneRunResult {
  return {
    ...baseRun,
    status: 'failed',
    output: Object.keys(outputs).length === 0 ? null : outputs,
    error: {
      code: failure.code,
      message: failure.message,
    },
  }
}

async function finalizeSceneRun(event: H3Event, run: SceneRunResult): Promise<SceneRunResult> {
  try {
    await recordProviderUsageLedger(event, run)
  }
  catch (error) {
    console.warn('[sceneOrchestrator] Failed to record provider usage ledger', error)
  }
  return run
}

async function throwRunError(
  event: H3Event,
  statusCode: number,
  code: SceneRunErrorCode,
  message: string,
  run: SceneRunResult,
): Promise<never> {
  await finalizeSceneRun(event, run)
  throw createRunError(statusCode, code, message, run)
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
  const candidates: SceneRunCandidate[] = []
  const capabilityPlans: CapabilityExecutionPlan[] = []
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
    await throwRunError(event, 409, 'SCENE_DISABLED', 'Scene is disabled.', run)
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
    await throwRunError(event, 400, 'CAPABILITY_UNSUPPORTED', 'Scene has no required capability or binding.', run)
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
      await throwRunError(event, 409, 'CAPABILITY_UNSUPPORTED', `No enabled provider capability is available for ${capability}.`, run)
      continue
    }

    if (dryRun) {
      selected.push(toSelection(picked.candidate, picked.provider))
      fallbackTrail.push({
        providerId: picked.provider.id,
        capability,
        status: 'selected',
      })
    }
    capabilityPlans.push({ capability, candidates: scopedCandidates })
  }

  const plannedSelectionCount = capabilityPlans.length
  addTrace(trace, 'strategy.select', 'success', `Selected ${plannedSelectionCount} provider capability path(s).`, {
    strategyMode: scene.strategyMode,
    selected: plannedSelectionCount,
  })

  if (dryRun) {
    addTrace(trace, 'adapter.dispatch', 'skipped', 'Dry run requested; provider adapters were not invoked.')
    return await finalizeSceneRun(event, {
      ...baseRun,
      status: 'planned',
      output: null,
    })
  }

  const outputs: Record<string, unknown> = {}
  for (const plan of capabilityPlans) {
    let completed = false
    let selectedPlan: SceneRunSelection | null = null
    let lastFailure: SceneRunFailure = {
      statusCode: 500,
      code: 'PROVIDER_UNAVAILABLE',
      message: 'Selected provider path is incomplete.',
    }

    for (const { candidate, provider } of plan.candidates) {
      const selection = toSelection(candidate, provider)
      const adapter = resolveAdapter(provider, plan.capability)
      fallbackTrail.push({
        providerId: provider.id,
        capability: plan.capability,
        status: 'selected',
      })

      if (!adapter) {
        const message = `No provider adapter registered for ${provider.vendor}:${plan.capability}.`
        lastFailure = {
          statusCode: 501,
          code: 'PROVIDER_ADAPTER_UNAVAILABLE',
          message,
        }
        fallbackTrail.push({
          providerId: provider.id,
          capability: plan.capability,
          status: 'failed',
          reason: 'provider_adapter_unavailable',
        })
        addTrace(trace, 'adapter.dispatch', 'failed', message, {
          providerId: provider.id,
          capability: plan.capability,
        })
        if (scene.fallback !== 'enabled')
          break
        continue
      }

      try {
        const adapterInput = buildCapabilityInput(plan.capability, request.input, outputs)
        const result = await adapter({
          event,
          runId,
          scene,
          provider,
          capability: plan.capability,
          input: adapterInput,
          originalInput: request.input,
          outputs,
        })
        outputs[plan.capability] = result.output
        usage.push(...(result.usage ?? []))
        addTrace(trace, 'adapter.dispatch', 'success', `Provider adapter completed ${plan.capability}.`, {
          providerId: provider.id,
          capability: plan.capability,
          providerRequestId: result.providerRequestId ?? null,
          latencyMs: result.latencyMs ?? null,
        })
        selectedPlan = selection
        completed = true
        break
      }
      catch (error) {
        const message = error instanceof Error ? error.message : 'Provider adapter failed.'
        lastFailure = {
          statusCode: 502,
          code: 'PROVIDER_ADAPTER_FAILED',
          message,
        }
        fallbackTrail.push({
          providerId: provider.id,
          capability: plan.capability,
          status: 'failed',
          reason: message,
        })
        addTrace(trace, 'adapter.dispatch', 'failed', `Provider adapter failed ${plan.capability}.`, {
          providerId: provider.id,
          capability: plan.capability,
        })
        if (scene.fallback !== 'enabled')
          break
      }
    }

    if (!completed) {
      const run = createFailedRun(baseRun, outputs, lastFailure)
      await throwRunError(event, lastFailure.statusCode, lastFailure.code, lastFailure.message, run)
    }
    if (selectedPlan)
      selected.push(selectedPlan)
  }

  const firstCapability = requestedCapabilities[0]
  return await finalizeSceneRun(event, {
    ...baseRun,
    status: 'completed',
    output: requestedCapabilities.length === 1 && firstCapability ? outputs[firstCapability] : outputs,
  })
}
