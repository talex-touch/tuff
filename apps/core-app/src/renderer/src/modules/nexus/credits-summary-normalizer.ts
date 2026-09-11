export interface CreditBalance {
  quota: number
  used: number
  remaining: number
}

export interface CreditTeamContext {
  id: string
  name: string
  type: 'personal' | 'organization'
  hasTeamPool: boolean
}

export interface CreditSummary {
  month: string
  user: CreditBalance
  team: CreditBalance
  teamContext: CreditTeamContext | null
}

interface RawCreditBalance {
  quota?: unknown
  used?: unknown
}

interface RawCreditSummary {
  month?: unknown
  user?: RawCreditBalance | null
  team?: RawCreditBalance | null
  teamContext?: unknown
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

function normalizeCreditTeamContext(value: unknown): CreditTeamContext | null {
  if (!isRecord(value)) return null

  const type = value.type === 'organization' ? 'organization' : 'personal'
  return {
    id: typeof value.id === 'string' ? value.id : '',
    name: typeof value.name === 'string' ? value.name : '',
    type,
    hasTeamPool: type === 'organization' && value.hasTeamPool !== false
  }
}

export function normalizeCreditSummary(value: unknown): CreditSummary {
  const source = isRecord(value) ? (value as RawCreditSummary) : {}
  return {
    month: typeof source.month === 'string' ? source.month : '',
    user: normalizeCreditBalance(source.user),
    team: normalizeCreditBalance(source.team),
    teamContext: normalizeCreditTeamContext(source.teamContext)
  }
}

/** One published capability price. `unit` is what the user is quoted in, e.g. 1k_tokens. */
export interface CreditPricingEntry {
  capability: string
  unit: string
  creditsPerUnit: number
  secondaryUnit: string | null
  secondaryCreditsPerUnit: number | null
  minCredits: number
}

export function normalizeCreditPricing(value: unknown): CreditPricingEntry[] {
  const source = isRecord(value) ? value : {}
  const rules = Array.isArray(source.rules) ? source.rules : []
  return rules
    .map((rule) => {
      if (!isRecord(rule) || typeof rule.capability !== 'string' || !rule.capability) return null
      const creditsPerUnit = normalizeCreditAmount(rule.creditsPerUnit)
      if (creditsPerUnit <= 0) return null
      return {
        capability: rule.capability,
        unit: typeof rule.unit === 'string' ? rule.unit : '',
        creditsPerUnit,
        secondaryUnit: typeof rule.secondaryUnit === 'string' ? rule.secondaryUnit : null,
        secondaryCreditsPerUnit:
          rule.secondaryCreditsPerUnit === null || rule.secondaryCreditsPerUnit === undefined
            ? null
            : normalizeCreditAmount(rule.secondaryCreditsPerUnit),
        minCredits: normalizeCreditAmount(rule.minCredits)
      }
    })
    .filter((entry): entry is CreditPricingEntry => Boolean(entry))
}
