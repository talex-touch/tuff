import { getTuffBaseUrl } from '@talex-touch/utils/env'
import { getAuthToken } from '../auth'
import { getNetworkService } from '../network'

export interface NexusSceneRunRequest {
  input?: unknown
  capability?: string
  providerId?: string
  dryRun?: boolean
  timeoutMs?: number
}

export interface NexusSceneRunResult {
  runId: string
  sceneId: string
  status: 'planned' | 'completed' | 'failed'
  mode: 'dry_run' | 'execute'
  output: unknown
  trace?: unknown[]
  usage?: unknown[]
  selected?: unknown[]
  candidates?: unknown[]
  fallbackTrail?: unknown[]
  error?: {
    code?: string
    message?: string
  }
}

interface NexusSceneRunResponse {
  run?: NexusSceneRunResult
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeBearerToken(token: string): string {
  const trimmed = token.trim()
  return trimmed.startsWith('Bearer ') ? trimmed : `Bearer ${trimmed}`
}

function buildSceneRunUrl(sceneId: string): string {
  return new URL(
    `/api/v1/scenes/${encodeURIComponent(sceneId)}/run`,
    `${getTuffBaseUrl()}/`
  ).toString()
}

export async function runNexusScene(
  sceneId: string,
  request: NexusSceneRunRequest
): Promise<NexusSceneRunResult | null> {
  const safeSceneId = sceneId.trim()
  if (!safeSceneId) {
    throw new Error('sceneId is required')
  }

  const token = getAuthToken()
  if (!token) {
    return null
  }

  const response = await getNetworkService().request<NexusSceneRunResponse>({
    method: 'POST',
    url: buildSceneRunUrl(safeSceneId),
    headers: {
      Authorization: normalizeBearerToken(token),
      'Content-Type': 'application/json'
    },
    body: {
      input: request.input,
      capability: request.capability,
      providerId: request.providerId,
      dryRun: request.dryRun
    },
    responseType: 'json',
    timeoutMs: request.timeoutMs ?? 30_000,
    retryPolicy: {
      maxRetries: 0,
      retryOnNetworkError: false,
      retryOnTimeout: false
    },
    cooldownPolicy: {
      key: `nexus-scene:${safeSceneId}`,
      failureThreshold: 2,
      cooldownMs: 15_000,
      autoResetOnSuccess: true
    }
  })

  return response.data?.run ?? null
}

export function extractTranslatedTextFromSceneRun(run: NexusSceneRunResult | null): string | null {
  if (!run || run.status !== 'completed') {
    return null
  }

  const output = run.output
  if (!isRecord(output)) {
    return null
  }

  const translatedText = output.translatedText
  return typeof translatedText === 'string' && translatedText.trim() ? translatedText : null
}

export interface NexusTranslatedImageOutput {
  translatedImageBase64: string
  imageMimeType?: string
  sourceText?: string
  targetText?: string
  overlay?: unknown
}

export function extractTranslatedImageFromSceneRun(
  run: NexusSceneRunResult | null
): NexusTranslatedImageOutput | null {
  if (!run || run.status !== 'completed') {
    return null
  }

  const output = run.output
  if (!isRecord(output)) {
    return null
  }

  const overlayOutput = output['overlay.render']
  const imageOutput = isRecord(overlayOutput) ? overlayOutput : output

  const translatedImageBase64 = imageOutput.translatedImageBase64
  if (typeof translatedImageBase64 !== 'string' || !translatedImageBase64.trim()) {
    return null
  }

  const sourceText = typeof imageOutput.sourceText === 'string' ? imageOutput.sourceText : undefined
  const targetText = typeof imageOutput.targetText === 'string' ? imageOutput.targetText : undefined
  const imageMimeType =
    typeof imageOutput.imageMimeType === 'string' ? imageOutput.imageMimeType : undefined
  return {
    translatedImageBase64: translatedImageBase64.trim(),
    imageMimeType,
    sourceText,
    targetText,
    overlay: imageOutput.overlay
  }
}

export interface NexusFxConvertOutput {
  base: string
  target: string
  amount: number
  rate: number
  converted: number
  source?: string
  updatedAt?: string
  providerUpdatedAt?: string | null
  fetchedAt?: string
  providerNextUpdateAt?: string | null
}

export interface NexusFxRateSnapshotOutput {
  base: string
  rates: Record<string, number>
  source?: string
  asOf?: string
  providerUpdatedAt?: string | null
  fetchedAt?: string
  providerNextUpdateAt?: string | null
}

function readCurrencyCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toUpperCase()
  return /^[A-Z]{3,5}$/.test(normalized) ? normalized : null
}

function readFiniteNumber(value: unknown): number | null {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readOptionalNullableString(value: unknown): string | null | undefined {
  if (value === null) return null
  return readOptionalString(value)
}

export function extractFxConvertFromSceneRun(
  run: NexusSceneRunResult | null
): NexusFxConvertOutput | null {
  if (!run || run.status !== 'completed' || !isRecord(run.output)) {
    return null
  }

  const base = readCurrencyCode(run.output.base)
  const target = readCurrencyCode(run.output.target)
  const amount = readFiniteNumber(run.output.amount)
  const rate = readFiniteNumber(run.output.rate)
  const converted = readFiniteNumber(run.output.converted)
  if (!base || !target || amount === null || rate === null || converted === null) {
    return null
  }

  return {
    base,
    target,
    amount,
    rate,
    converted,
    source: readOptionalString(run.output.source),
    updatedAt: readOptionalString(run.output.updatedAt),
    providerUpdatedAt: readOptionalNullableString(run.output.providerUpdatedAt),
    fetchedAt: readOptionalString(run.output.fetchedAt),
    providerNextUpdateAt: readOptionalNullableString(run.output.providerNextUpdateAt)
  }
}

export function extractFxRateSnapshotFromSceneRun(
  run: NexusSceneRunResult | null
): NexusFxRateSnapshotOutput | null {
  if (!run || run.status !== 'completed' || !isRecord(run.output)) {
    return null
  }

  const base = readCurrencyCode(run.output.base)
  const rawRates = run.output.rates
  if (!base || !isRecord(rawRates)) {
    return null
  }

  const rates: Record<string, number> = {}
  for (const [code, value] of Object.entries(rawRates)) {
    const currency = readCurrencyCode(code)
    const rate = readFiniteNumber(value)
    if (currency && rate !== null) {
      rates[currency] = rate
    }
  }

  if (Object.keys(rates).length === 0) {
    return null
  }

  return {
    base,
    rates,
    source: readOptionalString(run.output.source),
    asOf: readOptionalString(run.output.asOf),
    providerUpdatedAt: readOptionalNullableString(run.output.providerUpdatedAt),
    fetchedAt: readOptionalString(run.output.fetchedAt),
    providerNextUpdateAt: readOptionalNullableString(run.output.providerNextUpdateAt)
  }
}
