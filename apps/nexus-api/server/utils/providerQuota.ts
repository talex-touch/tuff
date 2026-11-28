import type { H3Event } from 'h3'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import { getProviderRegistryEntry } from './providerRegistryStore'

export interface ProviderQuotaConfig {
  requestsPerMinute?: number | null
  requestsPerDay?: number | null
  tokensPerDay?: number | null
}

interface QuotaBucket {
  count: number
  expiresAt: number
}

const memoryCounters = new Map<string, QuotaBucket>()

function parsePositiveLimit(value: unknown): number | null {
  if (value == null)
    return null
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0)
    return null
  return Math.floor(num)
}

export function extractProviderQuotaConfig(metadata: Record<string, unknown> | null | undefined): ProviderQuotaConfig {
  const raw = metadata?.quota
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return {}
  const record = raw as Record<string, unknown>
  return {
    requestsPerMinute: parsePositiveLimit(record.requestsPerMinute ?? record.rpm),
    requestsPerDay: parsePositiveLimit(record.requestsPerDay ?? record.rpd),
    tokensPerDay: parsePositiveLimit(record.tokensPerDay ?? record.tpd),
  }
}

async function readCounter(event: H3Event, key: string): Promise<number> {
  const kv = readCloudflareBindings(event)?.TUFF_INTELLIGENCE_RUNTIME
  if (kv) {
    try {
      const val = await kv.get(key)
      return Number.parseInt(val || '0', 10) || 0
    }
    catch {
      // Fallback to isolate memory when KV is unavailable.
    }
  }
  const existing = memoryCounters.get(key)
  if (!existing || existing.expiresAt <= Date.now())
    return 0
  return existing.count
}

async function incrementCounter(event: H3Event, key: string, delta: number, ttlSeconds: number): Promise<number> {
  const kv = readCloudflareBindings(event)?.TUFF_INTELLIGENCE_RUNTIME
  if (kv) {
    try {
      const current = Number.parseInt((await kv.get(key)) || '0', 10) || 0
      const next = current + delta
      await kv.put(key, String(next), { expirationTtl: Math.max(60, ttlSeconds) })
      return next
    }
    catch {
      // Fallback to isolate memory when KV is unavailable.
    }
  }
  const now = Date.now()
  const existing = memoryCounters.get(key)
  const next = existing && existing.expiresAt > now ? existing.count + delta : delta
  memoryCounters.set(key, { count: next, expiresAt: now + ttlSeconds * 1000 })
  return next
}

function minuteBucketKey(providerId: string): string {
  const minute = Math.floor(Date.now() / 60_000)
  return `ai-quota:rpm:${providerId}:${minute}`
}

function dayBucketKey(providerId: string, kind: 'req' | 'tok'): string {
  const day = new Date().toISOString().slice(0, 10)
  return `ai-quota:${kind}:${providerId}:${day}`
}

function createQuotaExceededError(code: 'INTELLIGENCE_PROVIDER_REQUEST_QUOTA_EXCEEDED' | 'INTELLIGENCE_PROVIDER_TOKEN_QUOTA_EXCEEDED', message: string) {
  const error = createError({
    statusCode: 429,
    statusMessage: message,
    data: { code },
  }) as ReturnType<typeof createError> & { code: string }
  error.code = code
  return error
}

/**
 * Checks cohesive quota limits stored directly on `provider_registry.metadata.quota`.
 */
export async function assertIntelligenceProviderQuota(
  event: H3Event,
  providerId: string,
  _channel?: string,
): Promise<void> {
  const db = readCloudflareBindings(event)?.DB
  if (!db)
    return

  const provider = await getProviderRegistryEntry(event, providerId).catch(() => null)
  if (!provider)
    return

  const quota = extractProviderQuotaConfig(provider.metadata)
  if (quota.requestsPerMinute) {
    const used = await readCounter(event, minuteBucketKey(provider.id))
    if (used >= quota.requestsPerMinute) {
      throw createQuotaExceededError(
        'INTELLIGENCE_PROVIDER_REQUEST_QUOTA_EXCEEDED',
        `Provider ${provider.displayName} exceeded its per-minute request quota.`,
      )
    }
  }

  if (quota.requestsPerDay) {
    const used = await readCounter(event, dayBucketKey(provider.id, 'req'))
    if (used >= quota.requestsPerDay) {
      throw createQuotaExceededError(
        'INTELLIGENCE_PROVIDER_REQUEST_QUOTA_EXCEEDED',
        `Provider ${provider.displayName} exceeded its daily request quota.`,
      )
    }
  }

  if (quota.tokensPerDay) {
    const used = await readCounter(event, dayBucketKey(provider.id, 'tok'))
    if (used >= quota.tokensPerDay) {
      throw createQuotaExceededError(
        'INTELLIGENCE_PROVIDER_TOKEN_QUOTA_EXCEEDED',
        `Provider ${provider.displayName} exceeded its daily token quota.`,
      )
    }
  }
}

export async function recordIntelligenceProviderRequest(
  event: H3Event,
  providerId: string,
  _channel?: string,
  tokens = 0,
): Promise<void> {
  const tasks: Array<Promise<unknown>> = [
    incrementCounter(event, minuteBucketKey(providerId), 1, 120),
    incrementCounter(event, dayBucketKey(providerId, 'req'), 1, 86400 + 3600),
  ]
  if (tokens > 0) {
    tasks.push(incrementCounter(event, dayBucketKey(providerId, 'tok'), Math.floor(tokens), 86400 + 3600))
  }
  await Promise.all(tasks)
}

export function clearProviderQuotaMemoryForTest(): void {
  memoryCounters.clear()
}
