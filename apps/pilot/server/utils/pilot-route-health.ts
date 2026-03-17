interface RouteHealthState {
  failCount: number
  openedAt: number
  cooldownUntil: number
  halfOpenBudget: number
}

export interface RouteHealthPolicy {
  failureThreshold: number
  cooldownMs: number
  halfOpenProbeCount: number
}

const ROUTE_HEALTH_MAP = new Map<string, RouteHealthState>()

function nowTs(): number {
  return Date.now()
}

function normalizeNumber(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(Math.max(Math.floor(parsed), min), max)
}

export function buildRouteKey(channelId: string, providerModel: string): string {
  return `${String(channelId || '').trim()}::${String(providerModel || '').trim()}`
}

function getOrCreateState(routeKey: string): RouteHealthState {
  const existing = ROUTE_HEALTH_MAP.get(routeKey)
  if (existing) {
    return existing
  }
  const next: RouteHealthState = {
    failCount: 0,
    openedAt: 0,
    cooldownUntil: 0,
    halfOpenBudget: 0,
  }
  ROUTE_HEALTH_MAP.set(routeKey, next)
  return next
}

export function isRouteHealthy(routeKey: string, policy: RouteHealthPolicy): {
  healthy: boolean
  state: 'closed' | 'open' | 'half-open'
} {
  const state = getOrCreateState(routeKey)
  const now = nowTs()
  if (state.cooldownUntil <= 0) {
    return {
      healthy: true,
      state: 'closed',
    }
  }

  if (now < state.cooldownUntil) {
    return {
      healthy: false,
      state: 'open',
    }
  }

  const probeCount = normalizeNumber(policy.halfOpenProbeCount, 1, 1, 5)
  if (state.halfOpenBudget <= 0) {
    state.halfOpenBudget = probeCount
  }

  if (state.halfOpenBudget > 0) {
    state.halfOpenBudget -= 1
    return {
      healthy: true,
      state: 'half-open',
    }
  }

  return {
    healthy: false,
    state: 'open',
  }
}

export function markRouteSuccess(routeKey: string): void {
  const state = getOrCreateState(routeKey)
  state.failCount = 0
  state.cooldownUntil = 0
  state.openedAt = 0
  state.halfOpenBudget = 0
}

export function markRouteFailure(routeKey: string, policy: RouteHealthPolicy): void {
  const state = getOrCreateState(routeKey)
  state.failCount += 1

  const threshold = normalizeNumber(policy.failureThreshold, 3, 1, 20)
  if (state.failCount < threshold) {
    return
  }

  const now = nowTs()
  const cooldownMs = normalizeNumber(policy.cooldownMs, 60_000, 5_000, 10 * 60 * 1000)
  state.openedAt = now
  state.cooldownUntil = now + cooldownMs
  state.halfOpenBudget = 0
}

export function getRouteHealthSnapshot(): Array<{
  routeKey: string
  failCount: number
  cooldownUntil: number
  openedAt: number
  halfOpenBudget: number
}> {
  return Array.from(ROUTE_HEALTH_MAP.entries()).map(([routeKey, state]) => ({
    routeKey,
    failCount: state.failCount,
    cooldownUntil: state.cooldownUntil,
    openedAt: state.openedAt,
    halfOpenBudget: state.halfOpenBudget,
  }))
}
