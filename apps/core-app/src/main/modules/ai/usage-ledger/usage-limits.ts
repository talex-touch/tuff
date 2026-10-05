/**
 * Global usage limits (audit rebuild parent design §3; usage-limits task C1–C6).
 *
 * One device-local limit set caps every AI call, whoever the caller is (Home turns, CoreBox,
 * plugins, background embedding / OCR / recommendation, local models): requests, tokens and
 * estimated USD cost, per local calendar day and month. It lives in the reserved
 * `intelligence_quotas` row (`IntelligenceQuotaManager.getGlobalLimits`), which is never synced.
 *
 * Enforcement — `UsageLimitGate.admit()` — runs in the SDK after a result-cache miss and before the
 * per-caller quota. It reads the global bucket for the current local day and month (database plus
 * calls not flushed yet, `readGlobalUsage`) and refuses the call once any configured limit is used
 * up (`used >= max`). A refused call is neither audited nor counted.
 *
 * Request limits are exact under concurrency. An admitted request holds an in-flight slot from
 * admission until its audit entry is logged — the moment it joins the pending global usage — or
 * until the call is abandoned, and the decision runs synchronously after the last await, so N
 * concurrent calls with one slot left admit exactly one. A read that raced a release is repeated
 * (the released request may or may not be in the snapshot); a read that keeps racing counts the
 * released requests as still in flight, which can only over-count.
 *
 * Token and cost limits are measured after the fact: calls already in flight can overshoot them,
 * and a pending entry's cost is only known once its batch is priced at flush time (explicit and
 * provider-reported costs aside), up to ~30 s later.
 *
 * Import rule: the SDK imports this module statically, so nothing here may reach `pricing/**`, and
 * the quota manager and the audit logger are resolved lazily — services whose tests mock the SDK
 * import this module for `readUsageLimitInfo` without dragging the database stack in.
 */
import type {
  UsageLimits,
  UsageLimitsStatus
} from '@talex-touch/utils/transport/sdk/domains/intelligence'
import type { UsageDelta } from './global-deltas'
import { createLogger } from '../../../utils/logger'
import { isOuterGovernanceCapability } from './constants'
import {
  dayPeriod,
  localDayKey,
  localMonthKey,
  monthPeriod,
  nextLocalDayStartMs,
  nextLocalMonthStartMs
} from './local-period'

const usageLimitsLog = createLogger('Intelligence').child('UsageLimits')

export type UsageLimitKey = keyof UsageLimits
export type UsageLimitStatusItem = UsageLimitsStatus['items'][number]

/** Shared error code (`INTELLIGENCE_ERROR_CODES`) of a call refused by a global usage limit. */
export const USAGE_LIMIT_REACHED_CODE = 'USAGE_LIMIT_REACHED' as const

/** An item turns `warn` once this share of its limit is used (parent design §3.5). */
export const USAGE_LIMIT_WARN_RATIO = 0.8

interface UsageLimitSpec {
  period: UsageLimitStatusItem['period']
  metric: UsageLimitStatusItem['metric']
}

/** Every limit, in the order status items are reported and ties are broken. */
export const USAGE_LIMIT_KEYS: readonly UsageLimitKey[] = Object.freeze([
  'requestsPerDay',
  'requestsPerMonth',
  'tokensPerDay',
  'tokensPerMonth',
  'costUsdPerDay',
  'costUsdPerMonth'
])

const USAGE_LIMIT_SPECS: Readonly<Record<UsageLimitKey, UsageLimitSpec>> = Object.freeze({
  requestsPerDay: { period: 'day', metric: 'requests' },
  requestsPerMonth: { period: 'month', metric: 'requests' },
  tokensPerDay: { period: 'day', metric: 'tokens' },
  tokensPerMonth: { period: 'month', metric: 'tokens' },
  costUsdPerDay: { period: 'day', metric: 'cost' },
  costUsdPerMonth: { period: 'month', metric: 'cost' }
})

export function isUsageLimitKey(value: unknown): value is UsageLimitKey {
  return typeof value === 'string' && Object.hasOwn(USAGE_LIMIT_SPECS, value)
}

/** No limit set. */
export function emptyUsageLimits(): UsageLimits {
  return {
    requestsPerDay: null,
    requestsPerMonth: null,
    tokensPerDay: null,
    tokensPerMonth: null,
    costUsdPerDay: null,
    costUsdPerMonth: null
  }
}

export function hasAnyUsageLimit(limits: UsageLimits): boolean {
  return USAGE_LIMIT_KEYS.some((key) => limits[key] !== null)
}

function hasRequestLimit(limits: UsageLimits): boolean {
  return limits.requestsPerDay !== null || limits.requestsPerMonth !== null
}

function invalidUsageLimits(field?: string): Error & { code: 'INVALID_REQUEST' } {
  return Object.assign(new Error('INVALID_REQUEST'), {
    code: 'INVALID_REQUEST' as const,
    ...(field === undefined ? {} : { field })
  })
}

function isValidLimitValue(key: UsageLimitKey, value: unknown): value is number {
  if (USAGE_LIMIT_SPECS[key].metric === 'cost') {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
  }
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

/**
 * The full-replace input of `setUsageLimits`. Each key is a positive value or `null`; a missing key
 * is `null` (no limit). Requests and tokens are positive integers, cost a positive USD amount.
 * Anything else — a non-object, an unknown key, `0`, a negative, a fraction of a request — is
 * `INVALID_REQUEST`: with full-replace semantics a misspelt key would otherwise clear a limit.
 */
export function normalizeUsageLimitsInput(input: unknown): UsageLimits {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalidUsageLimits()
  const record = input as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!isUsageLimitKey(key)) throw invalidUsageLimits(key)
  }
  const limits = emptyUsageLimits()
  for (const key of USAGE_LIMIT_KEYS) {
    const value = record[key]
    if (value === undefined || value === null) continue
    if (!isValidLimitValue(key, value)) throw invalidUsageLimits(key)
    limits[key] = value
  }
  return limits
}

// ── The refusal ─────────────────────────────────────────────────────────────────────────────

export interface UsageLimitInfo {
  key: UsageLimitKey
  used: number
  max: number
  /** Local midnight starting the next day / month: when this limit stops binding. */
  resetsAt: number
}

export type UsageLimitError = Error & {
  code: typeof USAGE_LIMIT_REACHED_CODE
  usageLimit: UsageLimitInfo
}

/**
 * The error a refused call ends with (parent design §3.4). Its message must never contain "quota",
 * "credit", "rate limit" or "too many requests": older substring classifiers in main, the renderer
 * and plugins would read it as Nexus credits or a provider 429.
 */
export function createUsageLimitError(capabilityId: string, info: UsageLimitInfo): UsageLimitError {
  const resetsAtIso = new Date(info.resetsAt).toISOString()
  return Object.assign(
    new Error(
      `[${USAGE_LIMIT_REACHED_CODE}:${capabilityId}] Usage limit reached: ${info.key}; resets at ${resetsAtIso}`
    ),
    { code: USAGE_LIMIT_REACHED_CODE, usageLimit: { ...info } }
  )
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isUsageLimitInfo(value: unknown): value is UsageLimitInfo {
  if (!value || typeof value !== 'object') return false
  const info = value as Record<string, unknown>
  return (
    isUsageLimitKey(info.key) &&
    isFiniteNumber(info.used) &&
    isFiniteNumber(info.max) &&
    isFiniteNumber(info.resetsAt)
  )
}

/**
 * The limit a failure was refused for, on the error or down its `cause` chain (the module boundary
 * wraps SDK errors in `toNormalizedIntelligenceError`). Null for every other failure.
 */
export function readUsageLimitInfo(error: unknown): UsageLimitInfo | null {
  let current: unknown = error
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth += 1) {
    const candidate = current as { code?: unknown; usageLimit?: unknown; cause?: unknown }
    if (candidate.code === USAGE_LIMIT_REACHED_CODE && isUsageLimitInfo(candidate.usageLimit)) {
      return { ...candidate.usageLimit }
    }
    current = candidate.cause
  }
  return null
}

export function isUsageLimitError(error: unknown): boolean {
  return readUsageLimitInfo(error) !== null
}

// ── Measuring ───────────────────────────────────────────────────────────────────────────────

function roundUsd(value: number): number {
  return Number.isFinite(value) && value > 0 ? Number(value.toFixed(6)) : 0
}

function measure(metric: UsageLimitSpec['metric'], delta: UsageDelta | undefined): number {
  if (!delta) return 0
  if (metric === 'requests') return delta.requestCount
  if (metric === 'tokens') return delta.totalTokens
  return roundUsd(delta.totalCost)
}

export interface UsageLimitUsage {
  day: UsageDelta | undefined
  month: UsageDelta | undefined
}

/**
 * One status item per configured limit, in key order. `extraRequests` adds requests that are not
 * in `usage` yet (the gate's in-flight admissions). `ratio` is `used / max`; `reached` once
 * `used >= max`, `warn` from {@link USAGE_LIMIT_WARN_RATIO}.
 */
export function evaluateUsageLimits(
  limits: UsageLimits,
  usage: UsageLimitUsage,
  now: number,
  extraRequests: { day: number; month: number } = { day: 0, month: 0 }
): UsageLimitStatusItem[] {
  const items: UsageLimitStatusItem[] = []
  for (const key of USAGE_LIMIT_KEYS) {
    const max = limits[key]
    if (max === null) continue
    const { period, metric } = USAGE_LIMIT_SPECS[key]
    const used =
      measure(metric, usage[period]) + (metric === 'requests' ? extraRequests[period] : 0)
    const ratio = used / max
    items.push({
      key,
      period,
      metric,
      max,
      used,
      ratio,
      // The epsilon keeps a summed cost at exactly 80% from reading as 79.999…%.
      state: used >= max ? 'reached' : ratio + 1e-9 >= USAGE_LIMIT_WARN_RATIO ? 'warn' : 'ok',
      resetsAt: period === 'day' ? nextLocalDayStartMs(now) : nextLocalMonthStartMs(now)
    })
  }
  return items
}

/**
 * The binding limit among the reached ones: the one that resets last — the call stays refused
 * until then — with key order breaking ties. Null when none is reached.
 */
export function pickReachedLimit(items: readonly UsageLimitStatusItem[]): UsageLimitInfo | null {
  let picked: UsageLimitStatusItem | null = null
  for (const item of items) {
    if (item.state !== 'reached') continue
    if (!picked || item.resetsAt > picked.resetsAt) picked = item
  }
  return picked
    ? { key: picked.key, used: picked.used, max: picked.max, resetsAt: picked.resetsAt }
    : null
}

// ── Dependencies ────────────────────────────────────────────────────────────────────────────

export interface UsageLimitDependencies {
  /** The stored limits; the quota manager caches them. */
  readLimits: () => Promise<UsageLimits>
  /** Global usage per period, unflushed calls included (`intelligenceAuditLogger.readGlobalUsage`). */
  readGlobalUsage: (periods: readonly string[]) => Promise<Map<string, UsageDelta>>
  now: () => number
}

type QuotaManagerModule = typeof import('../intelligence-quota-manager')
type AuditLoggerModule = typeof import('../intelligence-audit-logger')

let quotaManagerModule: Promise<QuotaManagerModule> | null = null
let auditLoggerModule: Promise<AuditLoggerModule> | null = null

function loadQuotaManager(): Promise<QuotaManagerModule> {
  quotaManagerModule ??= import('../intelligence-quota-manager')
  return quotaManagerModule
}

function loadAuditLogger(): Promise<AuditLoggerModule> {
  auditLoggerModule ??= import('../intelligence-audit-logger')
  return auditLoggerModule
}

const DEFAULT_DEPENDENCIES: UsageLimitDependencies = {
  readLimits: async () => (await loadQuotaManager()).intelligenceQuotaManager.getGlobalLimits(),
  readGlobalUsage: async (periods) =>
    (await loadAuditLogger()).intelligenceAuditLogger.readGlobalUsage(periods),
  now: () => Date.now()
}

function resolveDependencies(
  overrides: Partial<UsageLimitDependencies> = {}
): UsageLimitDependencies {
  return { ...DEFAULT_DEPENDENCIES, ...overrides }
}

function periodsAt(now: number): { day: string; month: string } {
  return { day: dayPeriod(localDayKey(now)), month: monthPeriod(localMonthKey(now)) }
}

/**
 * `limits` for `getUsageInsights` (parent design §3.5): settled usage — database plus calls not
 * flushed yet — against each configured limit. Requests still in flight are not in it.
 */
export async function buildUsageLimitsStatus(
  now: number = Date.now(),
  overrides: Partial<UsageLimitDependencies> = {}
): Promise<UsageLimitsStatus> {
  const deps = resolveDependencies(overrides)
  const limits = await deps.readLimits()
  if (!hasAnyUsageLimit(limits)) return { limits, items: [] }
  const periods = periodsAt(now)
  const usage = await deps.readGlobalUsage([periods.day, periods.month])
  return {
    limits,
    items: evaluateUsageLimits(
      limits,
      { day: usage.get(periods.day), month: usage.get(periods.month) },
      now
    )
  }
}

// ── The gate ────────────────────────────────────────────────────────────────────────────────

/** A request's in-flight slot. `release()` is idempotent; only the first call frees the slot. */
export interface UsageAdmission {
  release: () => void
}

/** Nothing held: no request limit applied, or the call never got as far as a slot. */
export const NO_USAGE_ADMISSION: UsageAdmission = Object.freeze({ release: () => undefined })

export interface UsageAdmissionRequest {
  capabilityId: string
  /** Checked before a slot is taken; an aborted call gets {@link NO_USAGE_ADMISSION}. */
  signal?: AbortSignal
}

/** Thrown when limits are configured but the usage they bind against cannot be read. */
export type UsageVerificationUnavailableError = Error & {
  code: 'QUOTA_CHECK_UNAVAILABLE'
  cause: unknown
}

/** Reads repeated when a release raced them; past this the raced releases count as in flight. */
const MAX_CONSISTENT_READ_ATTEMPTS = 4
const LIMITS_READ_WARN_INTERVAL_MS = 60_000

export class UsageLimitGate {
  private readonly deps: UsageLimitDependencies
  /** In-flight request slots per period (`day:…` / `month:…`). */
  private readonly inflight = new Map<string, number>()
  /** Bumped by every release, so a read can tell it raced one. */
  private releaseEpoch = 0
  private lastLimitsReadWarnAt = Number.NEGATIVE_INFINITY

  constructor(overrides: Partial<UsageLimitDependencies> = {}) {
    this.deps = resolveDependencies(overrides)
  }

  /**
   * Admits one call or throws its {@link UsageLimitError}. Resolves to the slot the call holds
   * until it is logged or abandoned ({@link NO_USAGE_ADMISSION} when no request limit applies).
   *
   * - Limits that cannot be read are treated as unset — nothing says a limit exists — and logged.
   * - Usage that cannot be read while a limit is set fails closed (`QUOTA_CHECK_UNAVAILABLE`), like
   *   the per-caller quota.
   * - Outer `agent.run` / `workflow.execute` calls are refused once a limit is reached but take no
   *   slot: they never count toward the global bucket; their inner model calls do.
   */
  async admit(request: UsageAdmissionRequest): Promise<UsageAdmission> {
    const limits = await this.readLimits()
    if (!limits || !hasAnyUsageLimit(limits)) return NO_USAGE_ADMISSION

    const now = this.deps.now()
    const periods = periodsAt(now)
    let usage = new Map<string, UsageDelta>()
    let racedReleases = 0
    for (let attempt = 1; attempt <= MAX_CONSISTENT_READ_ATTEMPTS; attempt += 1) {
      const epoch = this.releaseEpoch
      try {
        usage = await this.deps.readGlobalUsage([periods.day, periods.month])
      } catch (error) {
        throw Object.assign(new Error('Quota verification is unavailable.'), {
          code: 'QUOTA_CHECK_UNAVAILABLE' as const,
          cause: error
        }) satisfies UsageVerificationUnavailableError
      }
      racedReleases = this.releaseEpoch - epoch
      if (racedReleases === 0) break
    }

    // Synchronous from here to the slot: no await between reading the in-flight counts and taking one.
    if (request.signal?.aborted) return NO_USAGE_ADMISSION
    const items = evaluateUsageLimits(
      limits,
      { day: usage.get(periods.day), month: usage.get(periods.month) },
      now,
      {
        day: this.inflightRequests(periods.day) + racedReleases,
        month: this.inflightRequests(periods.month) + racedReleases
      }
    )
    const reached = pickReachedLimit(items)
    if (reached) throw createUsageLimitError(request.capabilityId, reached)
    if (!hasRequestLimit(limits) || isOuterGovernanceCapability(request.capabilityId)) {
      return NO_USAGE_ADMISSION
    }
    return this.takeSlot(periods.day, periods.month)
  }

  /** Requests admitted for `period` and not yet logged or abandoned. */
  inflightRequests(period: string): number {
    return this.inflight.get(period) ?? 0
  }

  private async readLimits(): Promise<UsageLimits | null> {
    try {
      return await this.deps.readLimits()
    } catch (error) {
      const now = Date.now()
      if (now - this.lastLimitsReadWarnAt >= LIMITS_READ_WARN_INTERVAL_MS) {
        this.lastLimitsReadWarnAt = now
        usageLimitsLog.warn('Usage limits could not be read; this call is not limited', {
          error
        })
      }
      return null
    }
  }

  private adjust(period: string, delta: number): void {
    const next = this.inflightRequests(period) + delta
    if (next > 0) this.inflight.set(period, next)
    else this.inflight.delete(period)
  }

  private takeSlot(dayPeriodKey: string, monthPeriodKey: string): UsageAdmission {
    this.adjust(dayPeriodKey, 1)
    this.adjust(monthPeriodKey, 1)
    let released = false
    return {
      release: () => {
        if (released) return
        released = true
        this.adjust(dayPeriodKey, -1)
        this.adjust(monthPeriodKey, -1)
        this.releaseEpoch += 1
      }
    }
  }
}

/** The SDK's gate; one per process, so every call shares the in-flight counts. */
export const usageLimitGate = new UsageLimitGate()

// ── Host-only control plane ─────────────────────────────────────────────────────────────────

/** `getUsageLimits()`: the stored limits, all `null` when none are set. */
export async function getUsageLimits(): Promise<UsageLimits> {
  return (await loadQuotaManager()).intelligenceQuotaManager.getGlobalLimits()
}

/**
 * `setUsageLimits(limits)`: validates, then replaces the whole limit set (`null` or a missing key
 * clears that limit). Resolves to what is stored now.
 */
export async function setUsageLimits(input: unknown): Promise<UsageLimits> {
  const limits = normalizeUsageLimitsInput(input)
  return (await loadQuotaManager()).intelligenceQuotaManager.setGlobalLimits(limits)
}
