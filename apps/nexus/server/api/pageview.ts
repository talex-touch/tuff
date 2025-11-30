import { readCloudflareBindings } from '../utils/cloudflare'

const startAt = Date.now()
let fallbackCount = 0

export default defineEventHandler(async (event) => {
  const bindings = readCloudflareBindings(event)

  if (bindings?.DB) {
    try {
      await bindings.DB.prepare(`
        CREATE TABLE IF NOT EXISTS metrics (
          key TEXT PRIMARY KEY,
          value INTEGER NOT NULL
        );
      `).run()

      const existing = await bindings.DB.prepare(
        'SELECT value FROM metrics WHERE key = ?1',
      ).bind('pageviews').first<{ value: number }>()

      const nextValue = (existing?.value ?? 0) + 1

      await bindings.DB.prepare(`
        INSERT INTO metrics (key, value)
        VALUES (?1, ?2)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value;
      `).bind('pageviews', nextValue).run()

      return {
        pageview: nextValue,
        startAt,
        source: 'd1',
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
    source: 'memory',
  }
})
