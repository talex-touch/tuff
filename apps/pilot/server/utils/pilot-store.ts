import type { D1Database, R2Bucket } from '@cloudflare/workers-types'
import type { AgentEnvelope, RuntimeStoreAdapter, StoreAdapter } from '@talex-touch/tuff-intelligence'
import type { H3Event } from 'h3'
import process from 'node:process'
import { D1RuntimeStoreAdapter } from '@talex-touch/tuff-intelligence'
import { pruneExpiredPilotHistoryOnce } from './pilot-history'
import { getNodePilotDatabase } from './pilot-node-d1'
import { getNodePilotPostgresDatabase } from './pilot-node-pg-d1'

const PILOT_STORE_METRICS_KEY = '__pilotStoreMetrics'

interface PilotStoreMetrics {
  appendTraceCount: number
}

type PilotEventContext = H3Event['context'] & {
  [PILOT_STORE_METRICS_KEY]?: PilotStoreMetrics
}

export function getPilotDatabase(event: H3Event): D1Database | null {
  const cloudflareDb = (event.context.cloudflare?.env?.DB as D1Database | undefined) ?? null
  if (cloudflareDb) {
    return cloudflareDb
  }

  if (typeof process !== 'undefined' && process.versions?.node) {
    const driver = String(process.env.PILOT_DB_DRIVER || 'sqlite').trim().toLowerCase()
    if (driver === 'postgres' || driver === 'pg') {
      return getNodePilotPostgresDatabase()
    }
    return getNodePilotDatabase()
  }

  return null
}

export function requirePilotDatabase(event: H3Event): D1Database {
  const db = getPilotDatabase(event)
  if (!db) {
    throw new Error('Pilot database is not configured. Set PILOT_DB_FILE for Node deployment, or bind Cloudflare D1 "DB".')
  }
  return db
}

export function getPilotAttachmentBucket(event: H3Event): R2Bucket | null {
  return (
    (event.context.cloudflare?.env?.PILOT_ATTACHMENTS as R2Bucket | undefined)
    ?? (event.context.cloudflare?.env?.R2 as R2Bucket | undefined)
    ?? null
  )
}

export function createPilotStoreAdapter(
  event: H3Event,
  userId: string,
  emitter?: (event: AgentEnvelope) => Promise<void>,
): StoreAdapter {
  const runtime = new D1RuntimeStoreAdapter(requirePilotDatabase(event), userId)
  const runtimeProxy = createRuntimeWithHistoryRetention(runtime, event, userId)
  return {
    runtime: runtimeProxy,
    emit: emitter,
  }
}

export function getPilotStoreMetricsSnapshot(event: H3Event): PilotStoreMetrics {
  return {
    appendTraceCount: getPilotStoreMetrics(event).appendTraceCount,
  }
}

function getPilotStoreMetrics(event: H3Event): PilotStoreMetrics {
  const context = event.context as PilotEventContext
  if (!context[PILOT_STORE_METRICS_KEY]) {
    context[PILOT_STORE_METRICS_KEY] = {
      appendTraceCount: 0,
    }
  }

  return context[PILOT_STORE_METRICS_KEY]!
}

function createRuntimeWithHistoryRetention(
  runtime: RuntimeStoreAdapter,
  event: H3Event,
  userId: string,
): RuntimeStoreAdapter {
  let schemaReady = false

  const ensurePrepared = async () => {
    if (!schemaReady) {
      await runtime.ensureSchema()
      schemaReady = true
    }
    await pruneExpiredPilotHistoryOnce(event, userId)
  }

  return new Proxy(runtime, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof value !== 'function') {
        return value
      }

      if (prop === 'ensureSchema') {
        return async (...args: unknown[]) => {
          const result = await value.apply(target, args)
          schemaReady = true
          await pruneExpiredPilotHistoryOnce(event, userId)
          return result
        }
      }

      if (prop === 'appendTrace') {
        return async (...args: unknown[]) => {
          const metrics = getPilotStoreMetrics(event)
          metrics.appendTraceCount += 1
          await ensurePrepared()
          return value.apply(target, args)
        }
      }

      return async (...args: unknown[]) => {
        await ensurePrepared()
        return value.apply(target, args)
      }
    },
  }) as RuntimeStoreAdapter
}
