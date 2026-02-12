import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'

const DEVICE_ATTEST_TABLE = 'auth_device_attestations'

let deviceAttestSchemaInitialized = false

function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

async function ensureDeviceAttestSchema(db: D1Database) {
  if (deviceAttestSchemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${DEVICE_ATTEST_TABLE} (
      user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      machine_code_hash TEXT NOT NULL,
      fingerprint_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, device_id)
    );
  `).run()

  const columns = await db.prepare(`PRAGMA table_info(${DEVICE_ATTEST_TABLE});`).all<{ name: string }>()
  const hasFingerprintColumn = (columns.results || []).some(column => column.name === 'fingerprint_hash')
  if (!hasFingerprintColumn) {
    await db.prepare(`
      ALTER TABLE ${DEVICE_ATTEST_TABLE}
      ADD COLUMN fingerprint_hash TEXT;
    `).run()
  }

  deviceAttestSchemaInitialized = true
}

export async function upsertDeviceAttestation(
  event: H3Event,
  userId: string,
  deviceId: string,
  machineCodeHash: string,
  fingerprintHash?: string | null,
): Promise<{
    userId: string
    deviceId: string
    machineCodeHash: string
    fingerprintHash: string | null
    updatedAt: string
  }> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureDeviceAttestSchema(db)

  const now = new Date().toISOString()
  await db.prepare(`
    INSERT INTO ${DEVICE_ATTEST_TABLE} (user_id, device_id, machine_code_hash, fingerprint_hash, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(user_id, device_id) DO UPDATE SET
      machine_code_hash = excluded.machine_code_hash,
      fingerprint_hash = COALESCE(excluded.fingerprint_hash, ${DEVICE_ATTEST_TABLE}.fingerprint_hash),
      updated_at = excluded.updated_at
  `).bind(userId, deviceId, machineCodeHash, fingerprintHash ?? null, now, now).run()

  return {
    userId,
    deviceId,
    machineCodeHash,
    fingerprintHash: fingerprintHash ?? null,
    updatedAt: now,
  }
}
