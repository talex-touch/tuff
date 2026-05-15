export interface CreditBalance {
  quota: number
  used: number
  remaining: number
}

export interface CreditSummary {
  month: string
  user: CreditBalance
  team: CreditBalance
}

interface RawCreditBalance {
  quota?: unknown
  used?: unknown
}

interface RawCreditSummary {
  month?: unknown
  user?: RawCreditBalance | null
  team?: RawCreditBalance | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeCreditAmount(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value ?? 0)
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0
}

function normalizeCreditBalance(value: unknown): CreditBalance {
  const source = isRecord(value) ? value : {}
  const quota = normalizeCreditAmount(source.quota)
  const used = normalizeCreditAmount(source.used)
  return {
    quota,
    used,
    remaining: Math.max(0, quota - used)
  }
}

export function normalizeCreditSummary(value: unknown): CreditSummary {
  const source = isRecord(value) ? (value as RawCreditSummary) : {}
  return {
    month: typeof source.month === 'string' ? source.month : '',
    user: normalizeCreditBalance(source.user),
    team: normalizeCreditBalance(source.team)
  }
}
