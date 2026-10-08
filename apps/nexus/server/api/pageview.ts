import { readCloudflareBindings } from '../utils/cloudflare'
import { defineD1Schema, ensureD1Schema } from '../utils/d1Schema'
import { EvidenceSource } from '../utils/evidenceSource'

const METRICS_SCHEMA = defineD1Schema('metrics', {
  statements: [
    `CREATE TABLE IF NOT EXISTS metrics (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    )`,
  ],
})

const startAt = Date.now()
let fallbackCount = 0

export default defineEventHandler(async (event) => {
  const bindings = readCloudflareBindings(event)

  if (bindings?.DB) {
    try {
      await ensureD1Schema(bindings.DB, METRICS_SCHEMA)
      // One atomic increment: the read-then-write it replaces lost counts to concurrent requests.
      const row = await bindings.DB.prepare(`
        INSERT INTO metrics (key, value)
        VALUES (?1, 1)
        ON CONFLICT(key) DO UPDATE SET value = value + 1
        RETURNING value
      `).bind('pageviews').first<{ value: number }>()
      const nextValue = Number(row?.value ?? 0)

      return {
        pageview: nextValue,
        startAt,
        source: EvidenceSource.D1,
      }
    }
    catch (error) {
      console.warn('[api/pageview] D1 fallback', error)
    }
  }

  const value = ++fallbackCount

  return {
    pageview: value,
    startAt,
    source: EvidenceSource.Memory,
  }
})
