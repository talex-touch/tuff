import type { H3Event } from 'h3'
import type { SceneRunResult } from './sceneOrchestrator'
import { runSceneOrchestrator } from './sceneOrchestrator'

const FX_LATEST_SCENE_ID = 'corebox.fx.latest'
const FX_CONVERT_SCENE_ID = 'corebox.fx.convert'

export interface ExchangeSceneBridgeResult<T> {
  response: T | null
  degradedReason?: string
}

export interface ExchangeLatestSceneResponse {
  base: string
  asOf: string
  providerUpdatedAt: string | null
  fetchedAt: string
  providerNextUpdateAt: string | null
  source: string
  rates: Record<string, number>
  sceneRunId: string
}

export interface ExchangeConvertSceneResponse {
  base: string
  target: string
  amount: number
  rate: number
  converted: number
  source: string
  updatedAt: string
  providerUpdatedAt: string | null
  fetchedAt: string
  providerNextUpdateAt: string | null
  sceneRunId: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNullableString(value: unknown): string | null {
  return value === null ? null : readString(value)
}

function readNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readRates(value: unknown): Record<string, number> | null {
  if (!isRecord(value))
    return null

  const rates: Record<string, number> = {}
  for (const [key, rateValue] of Object.entries(value)) {
    const currency = key.trim().toUpperCase()
    const rate = readNumber(rateValue)
    if (/^[A-Z]{3,5}$/.test(currency) && rate != null)
      rates[currency] = rate
  }

  return Object.keys(rates).length > 0 ? rates : null
}

function resolveSceneDegradedReason(error: unknown): string {
  if (isRecord(error)) {
    const data = isRecord(error.data) ? error.data : null
    const code = readString(data?.code) ?? readString(error.statusMessage) ?? readString(error.message)
    if (code)
      return code
  }

  if (error instanceof Error && error.message)
    return error.message

  return 'scene_unavailable'
}

function parseLatestRun(run: SceneRunResult): ExchangeLatestSceneResponse | null {
  if (run.status !== 'completed' || !isRecord(run.output))
    return null

  const base = readString(run.output.base)
  const asOf = readString(run.output.asOf)
  const providerUpdatedAt = readNullableString(run.output.providerUpdatedAt)
  const fetchedAt = readString(run.output.fetchedAt) ?? asOf
  const providerNextUpdateAt = readNullableString(run.output.providerNextUpdateAt)
  const source = readString(run.output.source)
  const rates = readRates(run.output.rates)

  if (!base || !asOf || !fetchedAt || !source || !rates)
    return null

  return {
    base,
    asOf,
    providerUpdatedAt,
    fetchedAt,
    providerNextUpdateAt,
    source,
    rates,
    sceneRunId: run.runId,
  }
}

function parseConvertRun(run: SceneRunResult): ExchangeConvertSceneResponse | null {
  if (run.status !== 'completed' || !isRecord(run.output))
    return null

  const base = readString(run.output.base)
  const target = readString(run.output.target)
  const amount = readNumber(run.output.amount)
  const rate = readNumber(run.output.rate)
  const converted = readNumber(run.output.converted)
  const source = readString(run.output.source)
  const updatedAt = readString(run.output.updatedAt)
  const providerUpdatedAt = readNullableString(run.output.providerUpdatedAt)
  const fetchedAt = readString(run.output.fetchedAt)
  const providerNextUpdateAt = readNullableString(run.output.providerNextUpdateAt)

  if (!base || !target || amount == null || rate == null || converted == null || !source || !updatedAt || !fetchedAt)
    return null

  return {
    base,
    target,
    amount,
    rate,
    converted,
    source,
    updatedAt,
    providerUpdatedAt,
    fetchedAt,
    providerNextUpdateAt,
    sceneRunId: run.runId,
  }
}

export async function runExchangeLatestScene(event: H3Event): Promise<ExchangeSceneBridgeResult<ExchangeLatestSceneResponse>> {
  try {
    const run = await runSceneOrchestrator(event, FX_LATEST_SCENE_ID, {
      capability: 'fx.rate.latest',
    })
    const response = parseLatestRun(run)
    return response ? { response } : { response: null, degradedReason: 'scene_invalid_output' }
  }
  catch (error) {
    return {
      response: null,
      degradedReason: resolveSceneDegradedReason(error),
    }
  }
}

export async function runExchangeConvertScene(
  event: H3Event,
  input: { base: 'USD', target: string, amount: number },
): Promise<ExchangeSceneBridgeResult<ExchangeConvertSceneResponse>> {
  try {
    const run = await runSceneOrchestrator(event, FX_CONVERT_SCENE_ID, {
      input,
      capability: 'fx.convert',
    })
    const response = parseConvertRun(run)
    return response ? { response } : { response: null, degradedReason: 'scene_invalid_output' }
  }
  catch (error) {
    return {
      response: null,
      degradedReason: resolveSceneDegradedReason(error),
    }
  }
}
