import type { NetworkCooldownPolicy } from './types'

export interface NetworkGuardState {
  key: string
  failureCount: number
  cooldownUntil: number
  lastFailureAt: number
}

export interface NetworkGuardDecision {
  allowed: boolean
  retryAfterMs?: number
}

const DEFAULT_COOLDOWN_POLICY: Required<
  Pick<NetworkCooldownPolicy, 'failureThreshold' | 'cooldownMs' | 'autoResetOnSuccess'>
> = {
  failureThreshold: 1,
  cooldownMs: 3000,
  autoResetOnSuccess: true
}

export class NetworkCooldownError extends Error {
  readonly code = 'NETWORK_COOLDOWN_ACTIVE'

  constructor(
    public readonly key: string,
    public readonly retryAfterMs: number
  ) {
    super(`Network guard cooldown active for key "${key}"`)
    this.name = 'NetworkCooldownError'
  }
}

export class NetworkGuard {
  private readonly states = new Map<string, NetworkGuardState>()

  constructor(private readonly defaultPolicy: NetworkCooldownPolicy = {}) {}

  private resolvePolicy(policy?: NetworkCooldownPolicy) {
    return {
      failureThreshold: Math.max(
        1,
        Math.floor(
          policy?.failureThreshold ??
            this.defaultPolicy.failureThreshold ??
            DEFAULT_COOLDOWN_POLICY.failureThreshold
        )
      ),
      cooldownMs: Math.max(
        0,
        Math.floor(policy?.cooldownMs ?? this.defaultPolicy.cooldownMs ?? DEFAULT_COOLDOWN_POLICY.cooldownMs)
      ),
      autoResetOnSuccess:
        policy?.autoResetOnSuccess ??
        this.defaultPolicy.autoResetOnSuccess ??
        DEFAULT_COOLDOWN_POLICY.autoResetOnSuccess
    }
  }

  private ensureState(key: string): NetworkGuardState {
    const existing = this.states.get(key)
    if (existing) {
      return existing
    }

    const next: NetworkGuardState = {
      key,
      failureCount: 0,
      cooldownUntil: 0,
      lastFailureAt: 0
    }
    this.states.set(key, next)
    return next
  }

  canRequest(key: string): NetworkGuardDecision {
    if (!key) return { allowed: true }

    const state = this.ensureState(key)
    const now = Date.now()
    if (now >= state.cooldownUntil) {
      return { allowed: true }
    }

    return { allowed: false, retryAfterMs: Math.max(0, state.cooldownUntil - now) }
  }

  recordSuccess(key: string, policy?: NetworkCooldownPolicy): void {
    if (!key) return

    const state = this.ensureState(key)
    const resolved = this.resolvePolicy(policy)

    if (resolved.autoResetOnSuccess) {
      state.failureCount = 0
      state.cooldownUntil = 0
    }
  }

  recordFailure(key: string, policy?: NetworkCooldownPolicy): NetworkGuardDecision {
    if (!key) return { allowed: true }

    const state = this.ensureState(key)
    const resolved = this.resolvePolicy(policy)

    state.failureCount += 1
    state.lastFailureAt = Date.now()

    if (state.failureCount >= resolved.failureThreshold) {
      state.cooldownUntil = Date.now() + resolved.cooldownMs
    }

    return this.canRequest(key)
  }

  clear(key?: string): void {
    if (typeof key === 'string' && key.length > 0) {
      this.states.delete(key)
      return
    }
    this.states.clear()
  }

  getState(key: string): NetworkGuardState | undefined {
    return this.states.get(key)
  }

  async run<T>(
    key: string,
    action: () => Promise<T>,
    policy?: NetworkCooldownPolicy
  ): Promise<T> {
    if (!key) {
      return await action()
    }

    const decision = this.canRequest(key)
    if (!decision.allowed) {
      throw new NetworkCooldownError(key, decision.retryAfterMs ?? 0)
    }

    try {
      const result = await action()
      this.recordSuccess(key, policy)
      return result
    } catch (error) {
      this.recordFailure(key, policy)
      throw error
    }
  }
}

export function createNetworkGuard(defaultPolicy?: NetworkCooldownPolicy): NetworkGuard {
  return new NetworkGuard(defaultPolicy)
}
