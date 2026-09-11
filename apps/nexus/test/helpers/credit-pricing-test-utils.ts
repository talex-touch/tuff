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

/** Columns the store is allowed to name. A new one must be taught to the fake. */
const CREDIT_PRICING_COLUMNS = new Set<keyof CreditPricingRow>([
  'capability',
  'unit',
  'credits_per_unit',
  'secondary_unit',
  'secondary_credits_per_unit',
  'min_credits',
  'reserve_multiplier',
  'upstream_cost_usd_per_unit',
  'active',
  'updated_at',
])

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
      const setClause = /SET ([\s\S]*?) WHERE /i.exec(sql)?.[1]
      const whereClause = /WHERE ([\s\S]*)$/i.exec(sql)?.[1]
      if (!setClause || !whereClause)
        throw new Error('MockCreditPricingD1Database: credit_pricing UPDATE shape changed; update the fake.')

      const readColumns = (clause: string, separator: RegExp) =>
        clause.split(separator).map((part) => {
          const column = part.split('=')[0]?.trim() ?? ''
          if (!CREDIT_PRICING_COLUMNS.has(column))
            throw new Error(`MockCreditPricingD1Database: unknown credit_pricing column "${column}"; update the fake.`)
          return column
        })

      // A SET list is comma-separated; a WHERE list joins its conditions with AND.
      const setColumns = readColumns(setClause, /\s*,\s*/)
      const whereColumns = readColumns(whereClause, /\s+AND\s+/i)
      // Bind order mirrors the shipped UPDATEs: every SET value, then every WHERE value.
      const setValues = args.slice(0, setColumns.length)
      const whereValues = args.slice(setColumns.length)
      if (args.length !== setColumns.length + whereColumns.length)
        throw new Error(`MockCreditPricingD1Database: credit_pricing UPDATE bind count changed; update the fake. sql=${sql} args=${args.length} set=${setColumns.join('|')} where=${whereColumns.join('|')}`)

      const capability = String(whereValues[whereColumns.indexOf('capability')] ?? '')
      const row = this.rows.get(capability)
      if (!row)
        return { meta: { changes: 0 } }

      // Compare-and-swap: the row only moves when the columns the WHERE named still
      // hold the values that were read.
      const matches = whereColumns.every((column, index) =>
        String(row[column]) === String(whereValues[index]))
      if (!matches)
        return { meta: { changes: 0 } }

      setColumns.forEach((column, index) => {
        const value = setValues[index]
        if (column === 'capability' || column === 'unit' || column === 'secondary_unit')
          row[column] = value == null ? null : String(value)
        else if (column === 'updated_at')
          row.updated_at = String(value)
        else if (column === 'active')
          row.active = Number(value)
        else
          row[column] = value == null ? null : Number(value)
      })
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
