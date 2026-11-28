import type { H3Event } from 'h3'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'

interface MemoryBucket {
  count: number
  expiresAt: number
}

const memoryBuckets = new Map<string, MemoryBucket>()

export interface RateLimitOptions {
  key: string
  limit: number
  windowMs: number
}

/**
 * Lightweight fixed-window rate limiter backed by Cloudflare KV (`TUFF_INTELLIGENCE_RUNTIME`)
 * with an isolate-local fallback when KV is unbound (tests / local dev).
 * IP blocking itself belongs to Cloudflare WAF — this guards targeted pre-auth/upload abuse.
 */
export async function enforceRateLimit(event: H3Event, options: RateLimitOptions): Promise<void> {
  const limit = Math.max(1, Math.floor(options.limit))
  const windowMs = Math.max(1000, Math.floor(options.windowMs))
  const now = Date.now()
  const windowBucket = Math.floor(now / windowMs)
  const bucketKey = `rl:${options.key}:${windowBucket}`

  const kv = readCloudflareBindings(event)?.TUFF_INTELLIGENCE_RUNTIME
  if (kv) {
    try {
      const raw = await kv.get(bucketKey)
      const count = (Number.parseInt(raw || '0', 10) || 0) + 1
      if (count > limit) {
        throw createError({
          statusCode: 429,
          statusMessage: 'Too many requests. Please try again later.',
        })
      }
      const ttlSeconds = Math.max(60, Math.ceil(windowMs / 1000) + 5)
      await kv.put(bucketKey, String(count), { expirationTtl: ttlSeconds })
      return
    }
    catch (error: any) {
      if (error?.statusCode === 429)
        throw error
    }
  }

  const existing = memoryBuckets.get(bucketKey)
  if (existing && existing.expiresAt > now) {
    existing.count += 1
    if (existing.count > limit) {
      throw createError({
        statusCode: 429,
        statusMessage: 'Too many requests. Please try again later.',
      })
    }
    return
  }

  memoryBuckets.set(bucketKey, { count: 1, expiresAt: now + windowMs })
  if (memoryBuckets.size > 2000) {
    for (const [k, v] of memoryBuckets.entries()) {
      if (v.expiresAt <= now)
        memoryBuckets.delete(k)
    }
  }
}

export function clearRateLimitMemoryForTest(): void {
  memoryBuckets.clear()
}
