import type { AgentEnvelope, RuntimeStoreAdapter, StoreAdapter } from '@talex-touch/tuff-intelligence/pilot'
import type { H3Event } from 'h3'
import type { PilotDatabase } from '../types/pilot-db'
import { D1RuntimeStoreAdapter } from '@talex-touch/tuff-intelligence/pilot'
import { pruneExpiredPilotHistoryOnce } from './pilot-history'
import { getNodePilotPostgresDatabase } from './pilot-node-pg-d1'

const PILOT_STORE_METRICS_KEY = '__pilotStoreMetrics'

interface PilotStoreMetrics {
  appendTraceCount: number
}

type PilotEventContext = H3Event['context'] & {
  [PILOT_STORE_METRICS_KEY]?: PilotStoreMetrics
}

export function getPilotDatabase(_event: H3Event): PilotDatabase {
  return getNodePilotPostgresDatabase()
}

export function requirePilotDatabase(event: H3Event): PilotDatabase {
  return getPilotDatabase(event)
}

export function createPilotStoreAdapter(
  event: H3Event,
  userId: string,
  emitter?: (event: AgentEnvelope) => Promise<void>,
): StoreAdapter {
  const runtime = new D1RuntimeStoreAdapter(
    requirePilotDatabase(event) as ConstructorParameters<typeof D1RuntimeStoreAdapter>[0],
    userId,
  )
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
