import type { H3Event } from 'h3'
import type { ProviderRegistryRecord } from './providerRegistryStore'
import type { SceneRegistryRecord, SceneStrategyBindingRecord } from './sceneRegistryStore'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { toRuntimeCapabilityId, type IntelligenceMessage } from '@talex-touch/tuff-intelligence/light'
import { networkClient } from '@talex-touch/utils/network'
import { getLatestProviderHealthChecks, type ProviderHealthCheckEntry } from './providerHealthStore'
import { completeUploadGovernance, failUploadGovernance, startUploadGovernance } from './uploadGovernance'
import { assertIntelligenceProviderQuota, recordIntelligenceProviderRequest, recordPlatformGovernanceEvent } from './platformGovernanceStore'
import { getProviderRegistryEntry } from './providerRegistryStore'
import { getProviderCredential } from './providerCredentialStore'
import { recordProviderUsageLedger } from './providerUsageLedgerStore'
import { getSceneRegistryEntry } from './sceneRegistryStore'
import { buildSceneAssetGovernanceResourceId, uploadSceneAsset } from './sceneAssetStorage'
import { invokeIntelligenceVisionOcr } from './intelligenceVisionOcrProvider'
import { buildCapabilityMessages } from './tuffIntelligenceCapabilityMessages'
import { buildOpenAiCompatBaseUrls, resolveProviderBaseUrl } from './intelligenceModels'
import { invokeTencentImageTranslate, invokeTencentTextTranslate } from './tencentMachineTranslationProvider'
import { convertUsd, getUsdRates } from './exchangeRateService'
import {
  clearSceneCapabilityAdapterRegistryForTest,
  registerSceneCapabilityAdapterRegistryEntry,
  resolveSceneCapabilityAdapterEntry,
} from './sceneCapabilityAdapterRegistry'

export type { SceneCapabilityAdapterRegistryReadiness as SceneCapabilityAdapterReadiness } from './sceneCapabilityAdapterRegistry'

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
  model?: string
  providerType?: string
  estimated?: boolean
  pricingRef?: string
  providerUsageRef?: string
}

export interface SceneAdapterMergedConfig {
  adapter: Record<string, unknown> | null
  upload: Record<string, unknown> | null
  assets: Record<string, unknown> | null
  constraints: Record<string, unknown> | null
  sources: string[]
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
  adapterConfig: SceneAdapterMergedConfig
}

export interface SceneAdapterAssetUpload {
  id?: string
  outputField?: string
  data?: string | ArrayBuffer | Uint8Array | Buffer
  base64?: string
  dataUrl?: string
  contentType?: string
  fileName?: string
  extension?: string
  resourceType?: string
  replaceOutput?: boolean
  metadata?: Record<string, unknown>
}

export interface SceneAdapterResult {
  output: unknown
  usage?: SceneRunUsage[]
  providerRequestId?: string
  latencyMs?: number
  assets?: SceneAdapterAssetUpload[]
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

const SENSITIVE_CONFIG_KEY_EXACT = new Set([
  'apikey',
  'authtoken',
  'bearertoken',
  'clientsecret',
  'credential',
  'credentials',
  'password',
  'privatekey',
  'refreshtoken',
  'secret',
  'secretkey',
  'sessiontoken',
  'token',
])

const SENSITIVE_CONFIG_KEY_MARKERS = [
  'key',
  'secret',
]

const DEFAULT_SCENE_ASSET_CONTENT_TYPE = 'application/octet-stream'
const DEFAULT_SCENE_ASSET_MAX_BYTES = 12 * 1024 * 1024

const SCENE_ASSET_EXTENSION_BY_MIME: Record<string, string> = {
  'application/json': 'json',
  'application/octet-stream': 'bin',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'text/markdown': 'md',
  'text/plain': 'txt',
}

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
        model: 'tencent-text-translate',
        providerType: provider.vendor,
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
        model: 'tencent-image-translate',
        providerType: provider.vendor,
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
        model: result.model,
        providerType: readOptionalString(provider.metadata?.intelligenceType) ?? provider.vendor,
      },
    ],
  }
}

function readMetadataString(provider: ProviderRegistryRecord, key: string): string | null {
  return readString(provider.metadata?.[key])
}

function readMetadataStringArray(provider: ProviderRegistryRecord, key: string): string[] {
  const value = provider.metadata?.[key]
  return Array.isArray(value)
    ? value.map(item => readString(item)).filter((item): item is string => Boolean(item))
    : []
}

function normalizeIntelligenceScenePayload(capability: string, input: unknown): unknown {
  const record = isRecord(input) ? input : { text: String(input ?? '') }
  if (capability === 'chat.completion') {
    if (Array.isArray(record.messages))
      return record
    const prompt = readString(record.prompt) ?? readString(record.input) ?? readString(record.text)
    return prompt ? { ...record, messages: [{ role: 'user', content: prompt }] } : record
  }
  if (capability === 'content.extract') {
    return {
      ...record,
      tags: Array.isArray(record.tags) ? record.tags : ['summary', 'entities', 'actions'],
    }
  }
  return record
}

function buildSceneIntelligenceMessages(capability: string, input: unknown): IntelligenceMessage[] {
  return buildCapabilityMessages(
    toRuntimeCapabilityId(capability),
    normalizeIntelligenceScenePayload(capability, input),
  )
}

async function resolveProviderApiKey(event: H3Event, provider: ProviderRegistryRecord): Promise<string> {
  if (provider.authType !== 'api_key' || !provider.authRef) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Provider API key credential is missing.',
    })
  }

  const credential = await getProviderCredential(event, provider.authRef)
  if (!credential || !('apiKey' in credential) || !credential.apiKey) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Provider API key credential is missing.',
    })
  }

  return credential.apiKey
}

function extractOpenAiResponsesText(data: unknown): string {
  const record = isRecord(data) ? data : {}
  const outputText = readString(record.output_text)
  if (outputText)
    return outputText

  const output = Array.isArray(record.output) ? record.output : []
  return output
    .flatMap((item) => {
      const content = isRecord(item) && Array.isArray(item.content) ? item.content : []
      return content.map((part) => {
        if (!isRecord(part))
          return ''
        return readString(part.text) ?? readString(part.content) ?? ''
      })
    })
    .filter(Boolean)
    .join('\n')
    .trim()
}

function summarizeProviderErrorData(data: unknown): string {
  if (typeof data === 'string')
    return data.trim().slice(0, 200)

  if (!isRecord(data))
    return ''

  const error = isRecord(data.error) ? data.error : null
  const message = readString(error?.message)
    ?? readString(data.message)
    ?? readString(data.error)
  if (message)
    return message.slice(0, 200)

  return JSON.stringify(data).slice(0, 200)
}

function extractOpenAiResponsesUsage(data: unknown): SceneRunUsage {
  const usage = isRecord(data) && isRecord(data.usage) ? data.usage : {}
  const inputTokens = typeof usage.input_tokens === 'number' ? usage.input_tokens : 0
  const outputTokens = typeof usage.output_tokens === 'number' ? usage.output_tokens : 0
  const totalTokens = typeof usage.total_tokens === 'number' ? usage.total_tokens : inputTokens + outputTokens
  return {
    unit: 'token',
    quantity: totalTokens,
    billable: true,
  }
}

function resolveOpenAiSceneModel(provider: ProviderRegistryRecord, input: unknown): string {
  const record = isRecord(input) ? input : {}
  const model = readString(record.model)
    ?? readMetadataString(provider, 'defaultModel')
    ?? readMetadataStringArray(provider, 'models')[0]
  if (!model) {
    throw createError({
      statusCode: 400,
      statusMessage: 'OpenAI Responses model is missing.',
    })
  }
  return model
}

function buildOpenAiResponsesTextInput(messages: IntelligenceMessage[]): string {
  return messages
    .filter(message => message.role !== 'system')
    .map(message => `${message.role}: ${message.content}`)
    .join('\n')
    .trim()
}

function buildOpenAiResponsesInstructions(messages: IntelligenceMessage[], input: unknown): string | null {
  const explicitInstructions = isRecord(input) ? readString(input.instructions) : null
  const systemInstructions = messages
    .filter(message => message.role === 'system')
    .map(message => message.content)
    .join('\n')
    .trim()
  return explicitInstructions ?? (systemInstructions || null)
}

async function invokeOpenAiResponsesSceneAdapter(
  event: H3Event,
  provider: ProviderRegistryRecord,
  capability: string,
  input: unknown,
): Promise<SceneAdapterResult> {
  const apiKey = await resolveProviderApiKey(event, provider)
  const intelligenceType = readMetadataString(provider, 'intelligenceType') ?? provider.vendor
  const baseUrl = resolveProviderBaseUrl(intelligenceType, provider.endpoint)
  const compatBaseUrl = buildOpenAiCompatBaseUrls(baseUrl)[0] ?? baseUrl.replace(/\/+$/, '')
  const endpoint = `${compatBaseUrl}/responses`
  const normalizedInput = normalizeIntelligenceScenePayload(capability, input)
  const model = resolveOpenAiSceneModel(provider, normalizedInput)
  const messages = buildSceneIntelligenceMessages(capability, normalizedInput)
  const instructions = buildOpenAiResponsesInstructions(messages, normalizedInput)
  const timeoutMs = typeof provider.metadata?.timeout === 'number' ? provider.metadata.timeout : 45000
  const startedAt = Date.now()
  const response = await networkClient.request<Record<string, unknown> | string>({
    method: 'POST',
    url: endpoint,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      model,
      input: buildOpenAiResponsesTextInput(messages),
      store: false,
      ...(instructions ? { instructions } : {}),
    },
    timeoutMs,
    validateStatus: Array.from({ length: 500 }, (_, index) => index + 100),
  })
  if (response.status < 200 || response.status >= 300) {
    const detail = summarizeProviderErrorData(response.data)
    throw createError({
      statusCode: response.status,
      statusMessage: `OpenAI Responses returned ${response.status}: ${detail}`,
    })
  }

  const text = extractOpenAiResponsesText(response.data)
  if (!text) {
    throw createError({
      statusCode: 502,
      statusMessage: 'OpenAI Responses returned empty content.',
    })
  }

  return {
    output: text,
    providerRequestId: readString(isRecord(response.data) ? response.data.id : undefined) ?? `responses:${Date.now()}`,
    latencyMs: Date.now() - startedAt,
    usage: [
      {
        ...extractOpenAiResponsesUsage(response.data),
        providerId: provider.id,
        capability,
        model,
        providerType: intelligenceType,
      },
    ],
  }
}

function extractOpenAiChatContent(data: unknown): string {
  const choices = isRecord(data) && Array.isArray(data.choices) ? data.choices : []
  for (const choice of choices) {
    const message = isRecord(choice) ? choice.message : null
    const content = isRecord(message) ? message.content : null
    const text = readString(content)
    if (text)
      return text
  }
  return ''
}

function extractOpenAiChatUsage(data: unknown): SceneRunUsage {
  const usage = isRecord(data) && isRecord(data.usage) ? data.usage : {}
  const promptTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0
  const completionTokens = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0
  const totalTokens = typeof usage.total_tokens === 'number' ? usage.total_tokens : promptTokens + completionTokens
  return {
    unit: 'token',
    quantity: totalTokens,
    billable: true,
  }
}

async function invokeOpenAiCompatibleSceneAdapter(
  event: H3Event,
  provider: ProviderRegistryRecord,
  capability: string,
  input: unknown,
): Promise<SceneAdapterResult> {
  const apiKey = await resolveProviderApiKey(event, provider)
  const intelligenceType = readMetadataString(provider, 'intelligenceType') ?? provider.vendor
  const baseUrl = resolveProviderBaseUrl(intelligenceType, provider.endpoint)
  const compatBaseUrl = buildOpenAiCompatBaseUrls(baseUrl)[0] ?? baseUrl.replace(/\/+$/, '')
  const endpoint = `${compatBaseUrl}/chat/completions`
  const normalizedInput = normalizeIntelligenceScenePayload(capability, input)
  const model = resolveOpenAiSceneModel(provider, normalizedInput)
  const messages = buildSceneIntelligenceMessages(capability, normalizedInput)
  const timeoutMs = typeof provider.metadata?.timeout === 'number' ? provider.metadata.timeout : 45000
  const startedAt = Date.now()
  const response = await networkClient.request<Record<string, unknown> | string>({
    method: 'POST',
    url: endpoint,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      model,
      messages,
      temperature: 0.2,
    },
    timeoutMs,
    validateStatus: Array.from({ length: 500 }, (_, index) => index + 100),
  })
  if (response.status < 200 || response.status >= 300) {
    const detail = summarizeProviderErrorData(response.data)
    throw createError({
      statusCode: response.status,
      statusMessage: `OpenAI-compatible chat returned ${response.status}: ${detail}`,
    })
  }

  const text = extractOpenAiChatContent(response.data)
  if (!text) {
    throw createError({
      statusCode: 502,
      statusMessage: 'OpenAI-compatible chat returned empty content.',
    })
  }

  return {
    output: text,
    providerRequestId: readString(isRecord(response.data) ? response.data.id : undefined) ?? `chat:${Date.now()}`,
    latencyMs: Date.now() - startedAt,
    usage: [
      {
        ...extractOpenAiChatUsage(response.data),
        providerId: provider.id,
        capability,
        model,
        providerType: intelligenceType,
      },
    ],
  }
}

const intelligenceTextAdapter: SceneCapabilityAdapter = async ({ event, provider, input, capability }) => {
  if (readMetadataString(provider, 'transport') === 'responses') {
    return await invokeOpenAiResponsesSceneAdapter(event, provider, capability, input)
  }

  return await invokeOpenAiCompatibleSceneAdapter(event, provider, capability, input)
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
        model: 'exchange-rate-latest',
        providerType: provider.vendor,
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
        model: 'exchange-rate-convert',
        providerType: provider.vendor,
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
        model: 'local-overlay-render',
        providerType: provider.vendor,
        estimated: true,
      },
    ],
  }
}

function registerDefaultSceneCapabilityAdapters() {
  registerSceneCapabilityAdapter('tencent-cloud:text.translate', tencentTextTranslateAdapter)
  registerSceneCapabilityAdapter('tencent-cloud:image.translate', tencentImageTranslateAdapter)
  registerSceneCapabilityAdapter('tencent-cloud:image.translate.e2e', tencentImageTranslateAdapter)
  registerSceneCapabilityAdapter('openai:chat.completion', intelligenceTextAdapter)
  registerSceneCapabilityAdapter('openai:text.summarize', intelligenceTextAdapter)
  registerSceneCapabilityAdapter('openai:content.extract', intelligenceTextAdapter)
  registerSceneCapabilityAdapter('openai:vision.ocr', intelligenceVisionOcrAdapter)
  registerSceneCapabilityAdapter('deepseek:chat.completion', intelligenceTextAdapter)
  registerSceneCapabilityAdapter('deepseek:text.summarize', intelligenceTextAdapter)
  registerSceneCapabilityAdapter('deepseek:content.extract', intelligenceTextAdapter)
  registerSceneCapabilityAdapter('deepseek:vision.ocr', intelligenceVisionOcrAdapter)
  registerSceneCapabilityAdapter('custom:chat.completion', intelligenceTextAdapter)
  registerSceneCapabilityAdapter('custom:text.summarize', intelligenceTextAdapter)
  registerSceneCapabilityAdapter('custom:content.extract', intelligenceTextAdapter)
  registerSceneCapabilityAdapter('custom:vision.ocr', intelligenceVisionOcrAdapter)
  registerSceneCapabilityAdapter('custom:overlay.render', localOverlayRenderAdapter)
  registerSceneCapabilityAdapter('exchange-rate:fx.rate.latest', fxRateLatestAdapter)
  registerSceneCapabilityAdapter('exchange-rate:fx.convert', fxConvertAdapter)
}

registerDefaultSceneCapabilityAdapters()

export function registerSceneCapabilityAdapter(key: string, adapter: SceneCapabilityAdapter): () => void {
  return registerSceneCapabilityAdapterRegistryEntry(key, adapter)
}

export function clearSceneCapabilityAdaptersForTest() {
  clearSceneCapabilityAdapterRegistryForTest()
}

export function resetSceneCapabilityAdaptersForTest() {
  clearSceneCapabilityAdapterRegistryForTest()
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

function resolveAdapter(provider: ProviderRegistryRecord, capability: string): SceneCapabilityAdapter | null {
  return resolveSceneCapabilityAdapterEntry<SceneCapabilityAdapter>(provider, capability)?.adapter ?? null
}

function readOptionalString(value: unknown, maxLength = 160): string | null {
  if (typeof value !== 'string')
    return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength)
    return null
  return trimmed
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
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

function resolveProviderCapability(provider: ProviderRegistryRecord, capability: string) {
  return provider.capabilities.find(item => item.capability === capability) ?? null
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

function mergeConfigObjects(...records: Array<Record<string, unknown> | null | undefined>): Record<string, unknown> | null {
  const merged: Record<string, unknown> = {}
  for (const record of records) {
    if (!record)
      continue
    for (const [key, value] of Object.entries(record))
      merged[key] = value
  }
  return Object.keys(merged).length ? merged : null
}

function readConfigSection(record: Record<string, unknown> | null | undefined, key: string): Record<string, unknown> | null {
  return readRecord(record?.[key])
}

function hasConfigSection(record: Record<string, unknown> | null | undefined, ...keys: string[]): boolean {
  return Boolean(record && keys.some(key => readConfigSection(record, key)))
}

function resolveSceneAdapterMergedConfig(
  scene: SceneRegistryRecord,
  provider: ProviderRegistryRecord,
  binding: SceneStrategyBindingRecord,
  capabilityName: string,
): SceneAdapterMergedConfig {
  const capability = resolveProviderCapability(provider, capabilityName)
  const adapter = mergeConfigObjects(
    readConfigSection(provider.metadata, 'adapter'),
    readConfigSection(capability?.metadata, 'adapter'),
    readConfigSection(scene.metadata, 'adapter'),
    readConfigSection(binding.metadata, 'adapter'),
  )
  const upload = mergeConfigObjects(
    readConfigSection(provider.metadata, 'upload'),
    readConfigSection(capability?.metadata, 'upload'),
    readConfigSection(scene.metadata, 'upload'),
    readConfigSection(binding.metadata, 'upload'),
  )
  const assets = mergeConfigObjects(
    readConfigSection(provider.metadata, 'assets'),
    readConfigSection(capability?.metadata, 'assets'),
    readConfigSection(scene.metadata, 'assets'),
    readConfigSection(binding.metadata, 'assets'),
  )
  const constraints = mergeConfigObjects(
    capability?.constraints,
    binding.constraints,
  )
  const sources = [
    hasConfigSection(provider.metadata, 'adapter', 'upload', 'assets') ? 'provider.metadata' : null,
    hasConfigSection(capability?.metadata, 'adapter', 'upload', 'assets') ? 'capability.metadata' : null,
    capability?.constraints ? 'capability.constraints' : null,
    hasConfigSection(scene.metadata, 'adapter', 'upload', 'assets') ? 'scene.metadata' : null,
    hasConfigSection(binding.metadata, 'adapter', 'upload', 'assets') ? 'binding.metadata' : null,
    binding.constraints ? 'binding.constraints' : null,
  ].filter((source): source is string => Boolean(source))

  return {
    adapter,
    upload,
    assets,
    constraints,
    sources,
  }
}

function toTraceValue(value: unknown): string | number | boolean | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value
  return null
}

function normalizeConfigKey(value: string): string {
  return value.replace(/[-_\s]/g, '').toLowerCase()
}

function isSensitiveConfigKey(key: string): boolean {
  const normalized = normalizeConfigKey(key)
  if (SENSITIVE_CONFIG_KEY_EXACT.has(normalized))
    return true
  if (normalized.includes('credential') || normalized.includes('password') || normalized.includes('secret'))
    return true
  if (normalized.endsWith('key')) {
    return SENSITIVE_CONFIG_KEY_MARKERS.some(marker => normalized.includes(marker))
      || normalized.includes('api')
      || normalized.includes('auth')
      || normalized.includes('private')
  }
  if (normalized.endsWith('token')) {
    return normalized.startsWith('access')
      || normalized.startsWith('auth')
      || normalized.startsWith('bearer')
      || normalized.startsWith('refresh')
      || normalized.startsWith('session')
  }
  return false
}

function summarizeConfigKeys(record: Record<string, unknown> | null): string | null {
  if (!record)
    return null

  const safeKeys = Object.keys(record)
    .filter(key => !isSensitiveConfigKey(key))
    .sort()

  return safeKeys.length ? safeKeys.join(',') : null
}

function summarizeSceneAdapterConfig(config: SceneAdapterMergedConfig): SceneRunTraceStep['metadata'] {
  return {
    adapterKeys: summarizeConfigKeys(config.adapter),
    uploadKeys: summarizeConfigKeys(config.upload),
    assetKeys: summarizeConfigKeys(config.assets),
    constraintKeys: summarizeConfigKeys(config.constraints),
    storageChannel: toTraceValue(config.upload?.storageChannel),
    storageProvider: toTraceValue(config.upload?.storageProvider),
    assetKind: toTraceValue(config.assets?.kind),
    sources: config.sources.join(',') || null,
  }
}

function buildAdapterTraceMetadata(
  providerId: string,
  capability: string,
  adapterConfig: SceneAdapterMergedConfig,
  extra: SceneRunTraceStep['metadata'] = {},
): SceneRunTraceStep['metadata'] {
  return {
    providerId,
    capability,
    ...summarizeSceneAdapterConfig(adapterConfig),
    ...extra,
  }
}

function readBooleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function sanitizeSceneAssetToken(value: unknown, fallback: string, maxLength = 64): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  const normalized = raw
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
  return normalized || fallback
}

function sanitizeSceneAssetExtension(value: unknown): string | null {
  if (typeof value !== 'string')
    return null
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16)
  return normalized || null
}

function extensionFromFileName(value: unknown): string | null {
  if (typeof value !== 'string')
    return null
  return sanitizeSceneAssetExtension(value.match(/\.([a-z0-9]+)$/i)?.[1])
}

function normalizeSceneAssetContentType(...values: unknown[]): string {
  for (const value of values) {
    const contentType = readOptionalString(value, 120)?.toLowerCase()
    if (contentType)
      return contentType
  }
  return DEFAULT_SCENE_ASSET_CONTENT_TYPE
}

function normalizeSceneAssetExtension(input: {
  extension?: unknown
  fileName?: unknown
  contentType: string
}): string {
  return sanitizeSceneAssetExtension(input.extension)
    ?? extensionFromFileName(input.fileName)
    ?? SCENE_ASSET_EXTENSION_BY_MIME[input.contentType]
    ?? 'bin'
}

function readConfiguredSceneAssetMaxBytes(config: SceneAdapterMergedConfig): number {
  const configured = readNumber(config.assets?.maxBytes) ?? readNumber(config.upload?.maxBytes)
  if (!configured || configured <= 0)
    return DEFAULT_SCENE_ASSET_MAX_BYTES
  return Math.min(Math.round(configured), DEFAULT_SCENE_ASSET_MAX_BYTES)
}

function normalizeBase64Payload(value: string, field: string): Buffer {
  const normalized = value.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  if (!normalized || normalized.length % 4 === 1 || !/^[a-z0-9+/]*={0,2}$/i.test(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Scene asset ${field} is not valid base64.`,
    })
  }
  return Buffer.from(normalized, 'base64')
}

function resolveSceneAssetBuffer(asset: SceneAdapterAssetUpload): { data: Buffer, contentTypeFromDataUrl: string | null } {
  const dataUrl = readOptionalString(asset.dataUrl, 16 * 1024 * 1024)
  if (dataUrl) {
    const parsed = stripDataUrlPrefix(dataUrl)
    return {
      data: normalizeBase64Payload(parsed.base64, asset.outputField ?? asset.id ?? 'dataUrl'),
      contentTypeFromDataUrl: parsed.mimeType,
    }
  }

  const base64 = readOptionalString(asset.base64, 16 * 1024 * 1024)
  if (base64) {
    const parsed = stripDataUrlPrefix(base64)
    return {
      data: normalizeBase64Payload(parsed.base64, asset.outputField ?? asset.id ?? 'base64'),
      contentTypeFromDataUrl: parsed.mimeType,
    }
  }

  if (Buffer.isBuffer(asset.data))
    return { data: asset.data, contentTypeFromDataUrl: null }
  if (asset.data instanceof ArrayBuffer)
    return { data: Buffer.from(asset.data), contentTypeFromDataUrl: null }
  if (asset.data instanceof Uint8Array)
    return { data: Buffer.from(asset.data.buffer, asset.data.byteOffset, asset.data.byteLength), contentTypeFromDataUrl: null }
  if (typeof asset.data === 'string') {
    const parsed = asset.data.startsWith('data:')
      ? stripDataUrlPrefix(asset.data)
      : { base64: asset.data, mimeType: null }
    return {
      data: normalizeBase64Payload(parsed.base64, asset.outputField ?? asset.id ?? 'data'),
      contentTypeFromDataUrl: parsed.mimeType,
    }
  }

  throw createError({
    statusCode: 400,
    statusMessage: 'Scene asset upload requires data, base64, or dataUrl.',
  })
}

function resolveSceneAssetContentTypeHint(asset: SceneAdapterAssetUpload): string | null {
  const candidates = [asset.dataUrl, asset.base64, asset.data]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string')
      continue

    const value = readOptionalString(candidate, 16 * 1024 * 1024)
    if (!value?.startsWith('data:'))
      continue

    return stripDataUrlPrefix(value).mimeType
  }

  return null
}

function resolveSceneAssetUploadContext(input: {
  runId: string
  sceneId: string
  providerId: string
  capability: string
  asset: SceneAdapterAssetUpload
  adapterConfig: SceneAdapterMergedConfig
  contentTypeHint?: string | null
}): {
  assetId: string
  key: string
  resourceType: string
  governanceResourceId: string
  contentType: string
  extension: string
  metadata: Record<string, unknown>
} {
  const asset = input.asset
  const contentType = normalizeSceneAssetContentType(asset.contentType, input.contentTypeHint, input.adapterConfig.assets?.contentType)
  const extension = normalizeSceneAssetExtension({
    extension: asset.extension ?? input.adapterConfig.assets?.extension,
    fileName: asset.fileName ?? input.adapterConfig.assets?.fileName,
    contentType,
  })
  const assetId = sanitizeSceneAssetToken(asset.id ?? asset.outputField ?? input.adapterConfig.assets?.kind, 'asset')
  const capabilityToken = sanitizeSceneAssetToken(input.capability, 'capability')
  const key = `${input.runId}-${capabilityToken}-${assetId}-${randomUUID()}.${extension}`
  const resourceType = readOptionalString(asset.resourceType, 80)
    ?? readOptionalString(input.adapterConfig.assets?.resourceType, 80)
    ?? 'scene-asset'
  const governanceResourceId = buildSceneAssetGovernanceResourceId(key)
  const metadata = {
    surface: 'scene-adapter-upload',
    sceneId: input.sceneId,
    providerId: input.providerId,
    capability: input.capability,
    assetId,
    assetKind: readOptionalString(input.adapterConfig.assets?.kind, 80) ?? assetId,
  }

  return {
    assetId,
    key,
    resourceType,
    governanceResourceId,
    contentType,
    extension,
    metadata,
  }
}

function resolveConfiguredSceneAssetUploads(output: unknown, config: SceneAdapterMergedConfig): SceneAdapterAssetUpload[] {
  const outputField = readOptionalString(config.assets?.outputField, 120)
  if (!outputField || !isRecord(output))
    return []

  const value = output[outputField]
  if (typeof value !== 'string' || !value.trim())
    return []

  return [
    {
      id: readOptionalString(config.assets?.id, 80) ?? readOptionalString(config.assets?.kind, 80) ?? outputField,
      outputField,
      base64: value,
      contentType: readOptionalString(config.assets?.contentType, 120) ?? undefined,
      extension: readOptionalString(config.assets?.extension, 24) ?? undefined,
      fileName: readOptionalString(config.assets?.fileName, 180) ?? undefined,
      resourceType: readOptionalString(config.assets?.resourceType, 80) ?? undefined,
      replaceOutput: readBooleanValue(config.assets?.replaceOutput) ?? true,
    },
  ]
}

function replaceSceneAssetOutput(
  output: unknown,
  reference: Record<string, unknown>,
  asset: SceneAdapterAssetUpload,
): unknown {
  if (!isRecord(output)) {
    return {
      value: output,
      sceneAssets: [reference],
    }
  }

  const existingAssets = Array.isArray(output.sceneAssets) ? output.sceneAssets : []
  const next: Record<string, unknown> = {
    ...output,
    sceneAssets: [...existingAssets, reference],
  }
  if (asset.outputField && asset.replaceOutput !== false)
    next[asset.outputField] = reference
  return next
}

async function uploadSceneAdapterAssets(input: {
  event: H3Event
  runId: string
  sceneId: string
  providerId: string
  capability: string
  output: unknown
  resultAssets?: SceneAdapterAssetUpload[]
  adapterConfig: SceneAdapterMergedConfig
}): Promise<{ output: unknown, uploadedAssets: number }> {
  const assets = [
    ...(input.resultAssets ?? []),
    ...resolveConfiguredSceneAssetUploads(input.output, input.adapterConfig),
  ]
  if (assets.length === 0)
    return { output: input.output, uploadedAssets: 0 }

  const maxBytes = readConfiguredSceneAssetMaxBytes(input.adapterConfig)
  let output = input.output
  let uploadedAssets = 0

  for (const asset of assets) {
    const assetContext = resolveSceneAssetUploadContext({
      runId: input.runId,
      sceneId: input.sceneId,
      providerId: input.providerId,
      capability: input.capability,
      asset,
      adapterConfig: input.adapterConfig,
      contentTypeHint: resolveSceneAssetContentTypeHint(asset),
    })
    const uploadAttempt = await startUploadGovernance(input.event, {
      resourceType: assetContext.resourceType,
      resourceId: assetContext.governanceResourceId,
      contentType: assetContext.contentType,
      extension: assetContext.extension,
      metadata: assetContext.metadata,
    })

    let failureReason: 'scene-asset-preflight-failed' | 'scene-asset-upload-failed' = 'scene-asset-preflight-failed'
    let assetSize: number | null = null

    try {
      const { data, contentTypeFromDataUrl } = resolveSceneAssetBuffer(asset)
      assetSize = data.byteLength
      if (data.byteLength > maxBytes) {
        throw createError({
          statusCode: 413,
          statusMessage: 'Scene asset exceeds configured upload limit.',
        })
      }

      const contentType = normalizeSceneAssetContentType(asset.contentType, contentTypeFromDataUrl, input.adapterConfig.assets?.contentType)
      failureReason = 'scene-asset-upload-failed'
      const stored = await uploadSceneAsset(input.event, assetContext.key, data, contentType, {
        governanceResourceId: assetContext.governanceResourceId,
        resourceType: assetContext.resourceType,
      })
      await completeUploadGovernance(input.event, uploadAttempt, {
        resourceId: assetContext.governanceResourceId,
        contentType: stored.contentType,
        extension: assetContext.extension,
        size: stored.size,
        storageChannel: stored.storageChannel,
        storageProvider: stored.storageProvider,
        metadata: {
          ...assetContext.metadata,
          ...(stored.uploadRetry ?? {}),
        },
      })

      const reference = {
        type: 'scene-asset',
        id: assetContext.assetId,
        key: stored.key,
        url: `/api/v1/scenes/assets/${encodeURIComponent(stored.key)}`,
        contentType: stored.contentType,
        sha256: stored.sha256,
        size: stored.size,
        storageChannel: stored.storageChannel,
        storageProvider: stored.storageProvider,
        resourceType: assetContext.resourceType,
      }
      output = replaceSceneAssetOutput(output, reference, asset)
      uploadedAssets += 1
    }
    catch (error) {
      const preflightFailure = failureReason === 'scene-asset-preflight-failed'
      await failUploadGovernance(input.event, uploadAttempt, error, {
        reason: failureReason,
        metadata: {
          ...assetContext.metadata,
          failureCategory: preflightFailure ? 'payload-validation' : 'storage-upload',
          failureSampleSource: 'live',
          failureCalibrationStatus: 'sampled',
          liveFailureSample: true,
          retryable: preflightFailure ? false : undefined,
          size: assetSize ?? undefined,
        },
      })
      throw error
    }
  }

  return { output, uploadedAssets }
}

function resolveCandidateCost(candidate: ResolvedSceneCandidate): number | null {
  const capability = resolveProviderCapability(candidate.provider, candidate.candidate.capability)
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
  for (const usage of run.usage) {
    const providerId = usage.providerId
    if (!providerId)
      continue
    try {
      await recordPlatformGovernanceUsage(event, providerId, usage)
    }
    catch (error) {
      console.warn('[sceneOrchestrator] Failed to record governance usage', error)
    }
  }
  return run
}

async function recordPlatformGovernanceUsage(
  event: H3Event,
  providerId: string,
  usage: SceneRunUsage,
): Promise<void> {
  await recordPlatformGovernanceEvent(event, {
    scope: 'intelligence',
    action: 'provider.usage',
    resourceType: 'provider',
    resourceId: providerId,
    channel: usage.capability ?? 'unknown',
    unit: usage.unit,
    quantity: usage.quantity,
    metadata: {
      billable: usage.billable,
      estimated: usage.estimated === true,
      model: usage.model ?? null,
      providerType: usage.providerType ?? null,
      pricingRef: usage.pricingRef ?? null,
      providerUsageRef: usage.providerUsageRef ?? null,
    },
  })
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
      const adapterConfig = resolveSceneAdapterMergedConfig(scene, picked.provider, picked.binding, capability)
      addTrace(trace, 'adapter.dispatch', 'skipped', `Dry run selected provider adapter config for ${capability}.`, buildAdapterTraceMetadata(picked.provider.id, capability, adapterConfig))
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

    for (const { candidate, provider, binding } of plan.candidates) {
      const selection = toSelection(candidate, provider)
      const adapter = resolveAdapter(provider, plan.capability)
      const adapterConfig = resolveSceneAdapterMergedConfig(scene, provider, binding, plan.capability)
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
        addTrace(trace, 'adapter.dispatch', 'failed', message, buildAdapterTraceMetadata(provider.id, plan.capability, adapterConfig))
        if (scene.fallback !== 'enabled')
          break
        continue
      }

      try {
        await assertIntelligenceProviderQuota(event, provider.id, plan.capability)
        await recordIntelligenceProviderRequest(event, provider.id, plan.capability)
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
          adapterConfig,
        })
        const assetResult = await uploadSceneAdapterAssets({
          event,
          runId,
          sceneId: scene.id,
          providerId: provider.id,
          capability: plan.capability,
          output: result.output,
          resultAssets: result.assets,
          adapterConfig,
        })
        outputs[plan.capability] = assetResult.output
        usage.push(...(result.usage ?? []))
        addTrace(trace, 'adapter.dispatch', 'success', `Provider adapter completed ${plan.capability}.`, buildAdapterTraceMetadata(provider.id, plan.capability, adapterConfig, {
          providerRequestId: result.providerRequestId ?? null,
          latencyMs: result.latencyMs ?? null,
          uploadedAssets: assetResult.uploadedAssets,
        }))
        selectedPlan = selection
        completed = true
        break
      }
      catch (error) {
        const message = error && typeof error === 'object' && 'statusMessage' in error && typeof error.statusMessage === 'string'
          ? error.statusMessage
          : error instanceof Error ? error.message : 'Provider adapter failed.'
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
        addTrace(trace, 'adapter.dispatch', 'failed', `Provider adapter failed ${plan.capability}.`, buildAdapterTraceMetadata(provider.id, plan.capability, adapterConfig))
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
