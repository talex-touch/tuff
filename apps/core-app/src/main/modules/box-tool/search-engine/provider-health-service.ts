import { getLogger } from '@talex-touch/utils/common/logger'
import type { ExtendedProviderStatus } from './search-core-utils'

const log = getLogger('search-engine')
const REFRACTORY_THRESHOLD = 2
const REFRACTORY_BASE_MS = 30_000
const REFRACTORY_MAX_MS = 5 * 60 * 1000
const HEALTH_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface ProviderHealthSample {
  providerId?: string
  status?: ExtendedProviderStatus
  duration?: number
  resultCount?: number
}

interface ProviderHealth {
  failureCount: number
  timeoutCount: number
  lastSeenAt: number
  blockedUntil?: number
}

/** Owns provider failure backoff independently of search lifecycle. */
export class ProviderHealthService {
  private readonly healthByProvider = new Map<string, ProviderHealth>()

  shouldSkip(providerId: string): boolean {
    const health = this.healthByProvider.get(providerId)
    if (!health?.blockedUntil) return false
    if (Date.now() < health.blockedUntil) return true
    health.blockedUntil = undefined
    health.failureCount = 0
    health.timeoutCount = 0
    return false
  }

  update(samples: ProviderHealthSample[]): void {
    const now = Date.now()
    for (const sample of samples) {
      if (!sample.providerId) continue
      const health = this.healthByProvider.get(sample.providerId) ?? {
        failureCount: 0,
        timeoutCount: 0,
        lastSeenAt: now
      }
      health.lastSeenAt = now
      if (!sample.status || sample.status === 'aborted') {
        this.healthByProvider.set(sample.providerId, health)
        continue
      }
      if (sample.status === 'success') {
        health.failureCount = 0
        health.timeoutCount = 0
        health.blockedUntil = undefined
      } else {
        health.failureCount += 1
        if (sample.status === 'timeout') health.timeoutCount += 1
        if (health.failureCount >= REFRACTORY_THRESHOLD) {
          const cooldownMs = Math.min(
            REFRACTORY_MAX_MS,
            REFRACTORY_BASE_MS * 2 ** (health.failureCount - REFRACTORY_THRESHOLD)
          )
          health.blockedUntil = Math.max(health.blockedUntil ?? 0, now + cooldownMs)
          log.warn(
            `Provider '${sample.providerId}' entering refractory for ${Math.round(cooldownMs / 1000)}s`
          )
        }
      }
      this.healthByProvider.set(sample.providerId, health)
    }
  }

  prune(): void {
    const threshold = Date.now() - HEALTH_TTL_MS
    for (const [providerId, health] of this.healthByProvider) {
      if (health.lastSeenAt < threshold) this.healthByProvider.delete(providerId)
    }
  }
}
