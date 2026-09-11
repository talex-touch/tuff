import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { requireDatabase } from './creditsStore'

/**
 * Capability-level credit pricing.
 *
 * Credits are the only unit users are charged in. Provider-native units (tokens,
 * audio seconds, images) are an implementation detail of a capability, so each
 * capability declares *what it sells* and *what that costs* here. Everything that
 * charges credits resolves its price through this table, and the table is the only
 * place a price changes — no capability may hardcode a number in its own module.
 *
 * The seeded defaults reproduce the prices that were already shipped before this
 * table existed (see `DEFAULT_CREDIT_PRICING`), so introducing it is not a price
 * change — with one deliberate exception: `vision.ocr` and `image.translate.e2e`
 * were priced at a tenth of a chat turn while they do several turns' worth of work,
 * and they are the two capabilities whose price is derived rather than inherited
 * (see the seed comment).
 *
 * The anchor is chat: 1,000 credits per 1K tokens, i.e. one credit per token. Every
 * other capability is priced by expressing its upstream workload in that same unit,
 * so a price list reads as "this call costs about as much as N chat replies" and the
 * free allowance (`creditsStore.ts`) can be read in calls. Nothing here is priced in
 * money: `upstreamCostUsdPerUnit` is reconciliation evidence only, it is never
 * charged to a user and never exposed on a user-facing surface, and it stays null
 * wherever Nexus's own upstream rate is not recorded in this repository.
 */

export const CREDIT_PRICING_TABLE = 'credit_pricing'

/** Priced units. The unit is what a user is quoted, not what the provider bills. */
export type CreditPricingUnit = '1k_tokens' | 'audio_second' | 'transcript_unit' | 'image'

export interface CreditPricingRule {
  capability: string
  /** The primary basis a capability is priced on. */
  unit: CreditPricingUnit
  /** Credits charged per `unit`, rounded up to a whole credit at settlement. */
  creditsPerUnit: number
  /**
   * Second basis for capabilities whose price is the maximum of two bases. ASR is
   * the shipped example: a long silence is expensive in billed seconds, while dense
   * speech is expensive in transcript units, and the provider bills whichever is
   * larger.
   */
  secondaryUnit: CreditPricingUnit | null
  secondaryCreditsPerUnit: number | null
  /** Floor charged whenever the capability does any billable work. */
  minCredits: number
  /**
   * How much more than the settled price is reserved before upstream dispatch.
   * A user must be able to afford the hold before the provider is called, otherwise
   * the provider cost is already spent by the time we discover they cannot pay.
   */
  reserveMultiplier: number
  /** Upstream USD cost per priced unit. Margin/reconciliation only, never charged. */
  upstreamCostUsdPerUnit: number | null
  active: boolean
  updatedAt: string
}

/**
 * Fallback for a capability with no row of its own. Priced exactly like chat rather
 * than free, so an unlisted capability can never be served at zero cost by accident.
 */
export const FALLBACK_CREDIT_PRICING: Omit<CreditPricingRule, 'capability' | 'updatedAt'> = {
  unit: '1k_tokens',
  creditsPerUnit: 1000,
  secondaryUnit: null,
  secondaryCreditsPerUnit: null,
  minCredits: 1,
  reserveMultiplier: 1,
  upstreamCostUsdPerUnit: null,
  active: true
}

/** Stamp the current seed writes into `updated_at`. */
const SEEDED_AT = '2026-09-11T00:00:00.000Z'

/**
 * Stamps earlier versions wrote. A row still carrying one has never been edited by an
 * operator — `updateCreditPricing` always stamps a real timestamp — so it is still the
 * shipped default and has to move with the code when a default changes. Without this a
 * price fix would only ever reach databases that had not been seeded yet: seeding is
 * additive per capability, so an existing row keeps its superseded price forever.
 */
const SUPERSEDED_SEED_STAMPS = new Set(['2026-09-10T00:00:00.000Z'])

function rule(
  capability: string,
  unit: CreditPricingUnit,
  creditsPerUnit: number,
  extra: Partial<CreditPricingRule> = {}
): CreditPricingRule {
  return {
    capability,
    unit,
    creditsPerUnit,
    secondaryUnit: null,
    secondaryCreditsPerUnit: null,
    minCredits: 1,
    reserveMultiplier: 1,
    upstreamCostUsdPerUnit: null,
    active: true,
    updatedAt: SEEDED_AT,
    ...extra
  }
}

const CHAT_CAPABILITIES = [
  'text.chat',
  'text.translate',
  'text.summarize',
  'text.rewrite',
  'text.grammar',
  'text.classify',
  'code.generate',
  'code.explain',
  'code.review',
  'code.refactor',
  'code.debug'
]

/**
 * `1k_tokens` at 1,000 credits/1k reproduces the shipped one-credit-per-token chat
 * price exactly; `audio_second` at 4 with a `transcript_unit` secondary of 1
 * reproduces the shipped `max(transcriptUnits, billedSeconds * 4)`, and a 2.5
 * reserve multiplier reproduces the shipped 10-credits-per-second hold — a second of
 * speech is about four tokens, so ASR already sat on the same one-credit-per-token
 * anchor as chat.
 *
 * The two image capabilities do not inherit a price, because before this table they
 * were not billed at all. They are derived from the same anchor by their upstream
 * workload instead: one `vision.ocr` call sends a picture plus a prompt and a
 * completion, and the vision tokenizer bills a 1024×1024 image as 765 tokens at
 * 512-pixel tiling, so ~2,000 credits (about two chat replies); `image.translate.e2e`
 * chains recognition, translation and re-render, so ~4,000 credits. Both were seeded
 * at 10 credits — a hundredth of a chat reply for work that costs several — which is
 * the price bug this table was meant to make visible, not a price to preserve.
 *
 * `image.translate` is the recognize-and-translate sibling of the e2e pipeline (it
 * returns the source and target text without re-rendering the picture), so it sits
 * between OCR and e2e at 3,000. It needs a row of its own for a second reason: the
 * fallback prices in tokens, so a capability that reports `{unit:'image'}` and has no
 * row settles at zero — the exact "served at zero cost by accident" case the fallback
 * exists to prevent.
 */
export const DEFAULT_CREDIT_PRICING: readonly CreditPricingRule[] = [
  ...CHAT_CAPABILITIES.map(capability => rule(capability, '1k_tokens', 1000)),
  rule('vision.ocr', 'image', 2000),
  rule('image.translate', 'image', 3000),
  rule('image.translate.e2e', 'image', 4000),
  rule('audio.transcribe', 'audio_second', 4, {
    secondaryUnit: 'transcript_unit',
    secondaryCreditsPerUnit: 1,
    reserveMultiplier: 2.5
  }),
  rule('audio.stt', 'audio_second', 4, {
    secondaryUnit: 'transcript_unit',
    secondaryCreditsPerUnit: 1,
    reserveMultiplier: 2.5
  })
]

/** How many native units make up one priced unit. */
const NATIVE_UNITS_PER_PRICED_UNIT: Record<CreditPricingUnit, number> = {
  '1k_tokens': 1000,
  audio_second: 1,
  transcript_unit: 1,
  image: 1
}

/** Provider-reported usage, in native units. A missing field means "not reported". */
export interface CreditPricingUsage {
  tokens?: number | null
  seconds?: number | null
  units?: number | null
  images?: number | null
}

function readQuantity(unit: CreditPricingUnit, usage: CreditPricingUsage): number | null {
  const raw
    = unit === '1k_tokens'
      ? usage.tokens
      : unit === 'audio_second'
        ? usage.seconds
        : unit === 'transcript_unit'
          ? usage.units
          : usage.images
  const quantity = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(quantity) || quantity <= 0) return null
  return quantity
}

function basisCredits(
  unit: CreditPricingUnit,
  creditsPerUnit: number,
  usage: CreditPricingUsage
): number | null {
  const quantity = readQuantity(unit, usage)
  if (quantity === null) return null
  return (quantity / NATIVE_UNITS_PER_PRICED_UNIT[unit]) * creditsPerUnit
}

/** Unrounded credit bases the provider's reported usage implies, at most two per rule. */
function rawBases(rule: CreditPricingRule, usage: CreditPricingUsage): number[] {
  const bases: number[] = []
  const primary = basisCredits(rule.unit, rule.creditsPerUnit, usage)
  if (primary !== null) bases.push(primary)
  if (rule.secondaryUnit && rule.secondaryCreditsPerUnit !== null) {
    const secondary = basisCredits(rule.secondaryUnit, rule.secondaryCreditsPerUnit, usage)
    if (secondary !== null) bases.push(secondary)
  }
  return bases
}

/**
 * The credits a settled call costs.
 *
 * Returns 0 only when the provider reported no billable quantity at all — a
 * capability that did work but reports nothing must be treated as a metering bug
 * upstream, not as free, so callers are expected to pass whatever the provider did
 * report rather than defaulting the fields.
 */
export function computeCreditCharge(rule: CreditPricingRule, usage: CreditPricingUsage): number {
  const bases = rawBases(rule, usage)
  if (!bases.length) return 0
  return Math.max(Math.ceil(Math.max(...bases)), rule.minCredits)
}

/**
 * Credits held before dispatch, derived from the same rule that settles the call so
 * a hold can never be cheaper than the charge it is standing in for.
 *
 * The multiplier is applied to the unrounded basis and rounded once: rounding the
 * settled charge first and multiplying afterwards would inflate short holds (a
 * 0.1-second ASR clip would hold 3 credits instead of the 1 the shipped reserve held).
 */
export function computeCreditReservation(
  rule: CreditPricingRule,
  estimate: CreditPricingUsage
): number {
  const multiplier = Number.isFinite(rule.reserveMultiplier) && rule.reserveMultiplier > 0
    ? rule.reserveMultiplier
    : 1
  const bases = rawBases(rule, estimate)
  if (!bases.length) return rule.minCredits
  return Math.max(Math.ceil(Math.max(...bases) * multiplier), rule.minCredits)
}

/** Pure lookup against an explicit rule set. Unknown capabilities take the fallback. */
export function selectCreditPricingRule(
  capability: string,
  rules: readonly CreditPricingRule[]
): CreditPricingRule {
  const normalized = typeof capability === 'string' ? capability.trim() : ''
  const matched = rules.find(item => item.capability === normalized && item.active)
  if (matched) return matched
  return {
    capability: normalized,
    ...FALLBACK_CREDIT_PRICING,
    updatedAt: SEEDED_AT
  }
}

function normalizeRule(row: Record<string, unknown>): CreditPricingRule {
  return {
    capability: String(row.capability ?? ''),
    unit: (row.unit ?? FALLBACK_CREDIT_PRICING.unit) as CreditPricingUnit,
    creditsPerUnit: Number(row.credits_per_unit ?? FALLBACK_CREDIT_PRICING.creditsPerUnit),
    secondaryUnit: (row.secondary_unit as CreditPricingUnit | null) ?? null,
    secondaryCreditsPerUnit:
      row.secondary_credits_per_unit === null || row.secondary_credits_per_unit === undefined
        ? null
        : Number(row.secondary_credits_per_unit),
    minCredits: Number(row.min_credits ?? FALLBACK_CREDIT_PRICING.minCredits),
    reserveMultiplier: Number(
      row.reserve_multiplier ?? FALLBACK_CREDIT_PRICING.reserveMultiplier
    ),
    upstreamCostUsdPerUnit:
      row.upstream_cost_usd_per_unit === null || row.upstream_cost_usd_per_unit === undefined
        ? null
        : Number(row.upstream_cost_usd_per_unit),
    active: row.active === 1 || row.active === true || row.active === '1',
    updatedAt: String(row.updated_at ?? SEEDED_AT)
  }
}

export async function ensureCreditPricingSchema(
  db: D1Database
): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ${CREDIT_PRICING_TABLE} (
        capability TEXT PRIMARY KEY,
        unit TEXT NOT NULL,
        credits_per_unit REAL NOT NULL,
        secondary_unit TEXT,
        secondary_credits_per_unit REAL,
        min_credits INTEGER NOT NULL DEFAULT 1,
        reserve_multiplier REAL NOT NULL DEFAULT 1,
        upstream_cost_usd_per_unit REAL,
        active INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      )`
    )
    .run()
}

/**
 * Reads the effective price list, seeding any capability that has no row yet and moving
 * never-edited rows onto the shipped defaults.
 *
 * Seeding is additive and per capability: an operator who tuned a price keeps that
 * price across deploys, and a newly shipped capability picks up its default without
 * touching the rows around it. The one exception is a row that still carries a
 * superseded seed stamp (see `SUPERSEDED_SEED_STAMPS`): that row is a shipped default
 * nobody has edited, so it follows the default.
 */
export async function listCreditPricing(
  event: H3Event | D1Database
): Promise<CreditPricingRule[]> {
  const db = isDatabase(event) ? event : requireDatabase(event as H3Event)
  await ensureCreditPricingSchema(db)
  const existing = await db.prepare(`SELECT * FROM ${CREDIT_PRICING_TABLE}`).all()
  const rows = (existing?.results ?? []) as Array<Record<string, unknown>>
  const known = new Set(rows.map(row => String(row.capability)))

  const missing = DEFAULT_CREDIT_PRICING.filter(item => !known.has(item.capability))
  if (missing.length) {
    const statements = missing.map(item =>
      db
        .prepare(
          `INSERT OR IGNORE INTO ${CREDIT_PRICING_TABLE}
            (capability, unit, credits_per_unit, secondary_unit, secondary_credits_per_unit,
             min_credits, reserve_multiplier, upstream_cost_usd_per_unit, active, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          item.capability,
          item.unit,
          item.creditsPerUnit,
          item.secondaryUnit,
          item.secondaryCreditsPerUnit,
          item.minCredits,
          item.reserveMultiplier,
          item.upstreamCostUsdPerUnit,
          item.active ? 1 : 0,
          item.updatedAt
        )
    )
    await db.batch(statements)
  }

  const reseeded = await reseedSupersededDefaults(db, rows)
  const stored = missing.length || reseeded
    ? ((await db.prepare(`SELECT * FROM ${CREDIT_PRICING_TABLE}`).all())?.results ?? [])
    : rows
  return (stored as Array<Record<string, unknown>>)
    .map(normalizeRule)
    .sort((a, b) => a.capability.localeCompare(b.capability))
}

/**
 * Writes the shipped default over rows that still carry a superseded seed stamp, and
 * returns whether anything changed so the caller re-reads instead of trusting the
 * snapshot it took before the update. The new stamp is the current one, so a second
 * read converges: this rewrites a row at most once per seed version.
 */
async function reseedSupersededDefaults(
  db: D1Database,
  rows: Array<Record<string, unknown>>
): Promise<boolean> {
  if (!rows.length) return false
  const defaults = new Map(DEFAULT_CREDIT_PRICING.map(item => [item.capability, item]))
  const statements = rows.flatMap((row) => {
    if (!SUPERSEDED_SEED_STAMPS.has(String(row.updated_at ?? ''))) return []
    const item = defaults.get(String(row.capability))
    if (!item) return []
    return [
      db
        .prepare(
          `UPDATE ${CREDIT_PRICING_TABLE}
             SET unit = ?, credits_per_unit = ?, secondary_unit = ?, secondary_credits_per_unit = ?,
                 min_credits = ?, reserve_multiplier = ?, upstream_cost_usd_per_unit = ?, active = ?,
                 updated_at = ?
           WHERE capability = ?`
        )
        .bind(
          item.unit,
          item.creditsPerUnit,
          item.secondaryUnit,
          item.secondaryCreditsPerUnit,
          item.minCredits,
          item.reserveMultiplier,
          item.upstreamCostUsdPerUnit,
          item.active ? 1 : 0,
          item.updatedAt,
          item.capability
        )
    ]
  })
  if (!statements.length) return false
  await db.batch(statements)
  return true
}

function isDatabase(value: unknown): value is D1Database {
  return Boolean(value) && typeof (value as D1Database).prepare === 'function'
}

/** The effective rule for one capability, resolved against the stored price list. */
export async function resolveCreditPricingRule(
  event: H3Event | D1Database,
  capability: string
): Promise<CreditPricingRule> {
  const rules = await listCreditPricing(event)
  return selectCreditPricingRule(capability, rules)
}

/**
 * Operator-facing price change. Only the price fields are writable: the unit basis
 * of a capability is part of its contract and is changed in code, with the
 * reconciliation it implies.
 */
export async function updateCreditPricing(
  event: H3Event | D1Database,
  capability: string,
  patch: {
    creditsPerUnit?: number
    minCredits?: number
    reserveMultiplier?: number
    upstreamCostUsdPerUnit?: number | null
    active?: boolean
  }
): Promise<CreditPricingRule | null> {
  const db = isDatabase(event) ? event : requireDatabase(event as H3Event)
  await ensureCreditPricingSchema(db)
  const current = await db
    .prepare(`SELECT * FROM ${CREDIT_PRICING_TABLE} WHERE capability = ?`)
    .bind(capability)
    .first<Record<string, unknown>>()
  if (!current) return null

  const next = {
    creditsPerUnit: patch.creditsPerUnit ?? Number(current.credits_per_unit),
    minCredits: patch.minCredits ?? Number(current.min_credits),
    reserveMultiplier: patch.reserveMultiplier ?? Number(current.reserve_multiplier),
    upstreamCostUsdPerUnit:
      patch.upstreamCostUsdPerUnit === undefined
        ? (current.upstream_cost_usd_per_unit as number | null)
        : patch.upstreamCostUsdPerUnit,
    active: patch.active ?? (current.active === 1 || current.active === true)
  }

  await db
    .prepare(
      `UPDATE ${CREDIT_PRICING_TABLE}
         SET credits_per_unit = ?, min_credits = ?, reserve_multiplier = ?,
             upstream_cost_usd_per_unit = ?, active = ?, updated_at = ?
       WHERE capability = ?`
    )
    .bind(
      next.creditsPerUnit,
      next.minCredits,
      next.reserveMultiplier,
      next.upstreamCostUsdPerUnit,
      next.active ? 1 : 0,
      new Date().toISOString(),
      capability
    )
    .run()

  return normalizeRule({
    ...current,
    credits_per_unit: next.creditsPerUnit,
    min_credits: next.minCredits,
    reserve_multiplier: next.reserveMultiplier,
    upstream_cost_usd_per_unit: next.upstreamCostUsdPerUnit,
    active: next.active ? 1 : 0
  })
}
