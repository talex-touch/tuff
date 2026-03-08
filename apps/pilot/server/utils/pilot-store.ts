import type { D1Database, R2Bucket } from '@cloudflare/workers-types'
import type { AgentEnvelope, StoreAdapter } from '@talex-touch/tuff-intelligence'
import type { H3Event } from 'h3'
import { D1RuntimeStoreAdapter } from '@talex-touch/tuff-intelligence'

export function getPilotDatabase(event: H3Event): D1Database | null {
  return (event.context.cloudflare?.env?.DB as D1Database | undefined) ?? null
}

export function requirePilotDatabase(event: H3Event): D1Database {
  const db = getPilotDatabase(event)
  if (!db) {
    throw new Error('Cloudflare D1 binding "DB" is required for Pilot runtime.')
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
  return {
    runtime,
    emit: emitter,
  }
}
