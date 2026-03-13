import process from 'node:process'
import { createError } from 'h3'
import { createClient } from 'redis'

const REDIS_CACHE_KEY = '__pilotRedisClient'

type GlobalRedisCache = typeof globalThis & {
  [REDIS_CACHE_KEY]?: ReturnType<typeof createClient>
}

function resolveRedisUrl(): string {
  const redisUrl = String(process.env.PILOT_REDIS_URL || '').trim()
  if (!redisUrl) {
    throw createError({
      statusCode: 500,
      statusMessage: 'PILOT_REDIS_URL is not configured.',
    })
  }
  return redisUrl
}

export function getPilotRedisClient() {
  const globalCache = globalThis as GlobalRedisCache
  if (!globalCache[REDIS_CACHE_KEY]) {
    const client = createClient({
      url: resolveRedisUrl(),
    })
    client.on('error', (error) => {
      console.error('[pilot][redis] client error', error)
    })
    globalCache[REDIS_CACHE_KEY] = client
  }
  return globalCache[REDIS_CACHE_KEY]!
}

async function ensureConnected() {
  const client = getPilotRedisClient()
  if (!client.isOpen) {
    await client.connect()
  }
  return client
}

export async function setPilotRedisValue(key: string, value: string, ttlSeconds: number): Promise<void> {
  const client = await ensureConnected()
  await client.set(key, value, {
    EX: Math.max(1, Math.floor(ttlSeconds)),
  })
}

export async function getPilotRedisValue(key: string): Promise<string> {
  const client = await ensureConnected()
  return String((await client.get(key)) || '')
}

export async function deletePilotRedisValue(key: string): Promise<void> {
  const client = await ensureConnected()
  await client.del(key)
}
