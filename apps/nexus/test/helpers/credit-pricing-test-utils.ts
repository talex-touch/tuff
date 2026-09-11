import type { H3Event } from 'h3'

/**
 * `credit_pricing` rows as D1 stores them. Only the statements
 * `creditPricingStore` actually issues are implemented, so a handler test
 * exercises the real seeding, normalization and update path.
 */
export interface CreditPricingRow {
  capability: string
  unit: string
  credits_per_unit: number
  secondary_unit: string | null
  secondary_credits_per_unit: number | null
  min_credits: number
  reserve_multiplier: number
  upstream_cost_usd_per_unit: number | null
  active: number
  updated_at: string
}

class MockStatement {
  args: unknown[] = []

  constructor(
    private readonly db: MockCreditPricingD1Database,
    readonly sql: string,
  ) {}

  bind(...args: unknown[]) {
    this.args = args
    return this
  }

  async run() {
    return this.db.execute(this.sql, this.args)
  }

  async first<T = unknown>() {
    return this.db.first(this.sql, this.args) as T
  }

  async all<T = unknown>() {
    return { results: this.db.all(this.sql, this.args) as T[] }
  }
}

export class MockCreditPricingD1Database {
  rows = new Map<string, CreditPricingRow>()
  /**
   * Every `UPDATE credit_pricing` the store issued. Convergence is only observable
   * through the rows themselves, so the rewrite count is recorded here: a read that
   * rewrites a row on every call looks identical to one that rewrites it once.
   */
  pricingUpdates = 0

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  async batch(statements: MockStatement[]) {
    return statements.map(statement => this.execute(statement.sql, statement.args))
  }

  execute(sql: string, args: unknown[]) {
    if (/CREATE (TABLE|INDEX)/i.test(sql))
      return { meta: { changes: 0 } }

    if (sql.includes('INSERT OR IGNORE INTO credit_pricing')) {
      const [
        capability,
        unit,
        creditsPerUnit,
        secondaryUnit,
        secondaryCreditsPerUnit,
        minCredits,
        reserveMultiplier,
        upstreamCostUsdPerUnit,
        active,
        updatedAt,
      ] = args
      const key = String(capability)
      if (!this.rows.has(key)) {
        this.rows.set(key, {
          capability: key,
          unit: String(unit),
          credits_per_unit: Number(creditsPerUnit),
          secondary_unit: secondaryUnit == null ? null : String(secondaryUnit),
          secondary_credits_per_unit: secondaryCreditsPerUnit == null ? null : Number(secondaryCreditsPerUnit),
          min_credits: Number(minCredits),
          reserve_multiplier: Number(reserveMultiplier),
          upstream_cost_usd_per_unit: upstreamCostUsdPerUnit == null ? null : Number(upstreamCostUsdPerUnit),
          active: Number(active),
          updated_at: String(updatedAt),
        })
      }
      return { meta: { changes: 1 } }
    }

    if (sql.includes('UPDATE credit_pricing')) {
      this.pricingUpdates += 1
      const isReseed = sql.includes('SET unit = ?')
      // The bind order below mirrors the shipped UPDATEs. A column change must fail loudly
      // here rather than let the fake write shifted values into the wrong columns.
      const isOperatorEdit = sql.includes('SET credits_per_unit = ?, min_credits = ?, reserve_multiplier = ?')
      if (!isReseed && !isOperatorEdit)
        throw new Error('MockCreditPricingD1Database: credit_pricing UPDATE columns changed; update the fake.')

      // Both shapes end their bind list with the capability.
      const row = this.rows.get(String(args[args.length - 1]))
      if (!row)
        return { meta: { changes: 0 } }

      // Re-seed shape: a row still carrying a superseded seed stamp is rewritten to
      // the shipped default, unit included, because nobody has edited it.
      if (isReseed) {
        const [
          unit,
          creditsPerUnit,
          secondaryUnit,
          secondaryCreditsPerUnit,
          minCredits,
          reserveMultiplier,
          upstreamCostUsdPerUnit,
          active,
          updatedAt,
        ] = args
        row.unit = String(unit)
        row.credits_per_unit = Number(creditsPerUnit)
        row.secondary_unit = secondaryUnit == null ? null : String(secondaryUnit)
        row.secondary_credits_per_unit = secondaryCreditsPerUnit == null ? null : Number(secondaryCreditsPerUnit)
        row.min_credits = Number(minCredits)
        row.reserve_multiplier = Number(reserveMultiplier)
        row.upstream_cost_usd_per_unit = upstreamCostUsdPerUnit == null ? null : Number(upstreamCostUsdPerUnit)
        row.active = Number(active)
        row.updated_at = String(updatedAt)
        return { meta: { changes: 1 } }
      }

      // Operator edit: only the price fields move, the unit basis stays put.
      const [creditsPerUnit, minCredits, reserveMultiplier, upstreamCostUsdPerUnit, active, updatedAt] = args

      row.credits_per_unit = Number(creditsPerUnit)
      row.min_credits = Number(minCredits)
      row.reserve_multiplier = Number(reserveMultiplier)
      row.upstream_cost_usd_per_unit = upstreamCostUsdPerUnit == null ? null : Number(upstreamCostUsdPerUnit)
      row.active = Number(active)
      row.updated_at = String(updatedAt)
      return { meta: { changes: 1 } }
    }

    return { meta: { changes: 0 } }
  }

  first(sql: string, args: unknown[]) {
    if (sql.includes('FROM credit_pricing') && sql.includes('WHERE capability = ?'))
      return this.rows.get(String(args[0])) ?? null
    return null
  }

  all(sql: string) {
    if (sql.includes('FROM credit_pricing'))
      return [...this.rows.values()]
    return []
  }
}

/** A route handler reads only its request url and its D1 binding off the event. */
export function makeCreditPricingEvent(db: MockCreditPricingD1Database): H3Event {
  return {
    path: '/api/credits/pricing',
    node: { req: { url: '/api/credits/pricing' } },
    context: {
      params: {},
      cloudflare: {
        env: {
          DB: db,
        },
      },
    },
  } as unknown as H3Event
}

/** Route modules call the Nitro `defineEventHandler` global at import time. */
export function installDefineEventHandlerGlobal() {
  (globalThis as unknown as { defineEventHandler: (handler: unknown) => unknown }).defineEventHandler =
    handler => handler
}
