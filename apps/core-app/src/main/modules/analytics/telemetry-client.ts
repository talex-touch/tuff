import { randomUUID } from 'node:crypto'
import { getConfig, saveConfig } from '../storage'

const TELEMETRY_CLIENT_CONFIG = 'telemetry-client.json'
let cachedClientId: string | null = null

export function getOrCreateTelemetryClientId(): string {
  if (cachedClientId) return cachedClientId

  try {
    const config = getConfig(TELEMETRY_CLIENT_CONFIG) as { clientId?: unknown }
    const existing = typeof config?.clientId === 'string' ? config.clientId.trim() : ''
    if (existing) {
      cachedClientId = existing
      return cachedClientId
    }
  } catch {
    // ignore read errors
  }

  const next = randomUUID()
  try {
    saveConfig(TELEMETRY_CLIENT_CONFIG, JSON.stringify({ clientId: next }), undefined, true)
  } catch {
    // ignore write errors
  }

  cachedClientId = next
  return cachedClientId
}
