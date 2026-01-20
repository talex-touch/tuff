import { randomUUID } from 'node:crypto'
import { StorageList } from '@talex-touch/utils'
import { getMainConfig, saveMainConfig } from '../storage'

const TELEMETRY_CLIENT_CONFIG = StorageList.TELEMETRY_CLIENT
let cachedClientId: string | null = null

export function getOrCreateTelemetryClientId(): string {
  if (cachedClientId) return cachedClientId

  try {
    const config = getMainConfig(TELEMETRY_CLIENT_CONFIG) as { clientId?: unknown }
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
    saveMainConfig(TELEMETRY_CLIENT_CONFIG, { clientId: next }, { force: true })
  } catch {
    // ignore write errors
  }

  cachedClientId = next
  return cachedClientId
}
