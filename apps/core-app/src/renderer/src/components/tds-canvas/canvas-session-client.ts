import type { TdsCanvasSessionData } from '@talex-touch/utils/transport/sdk/domains/tds-capture'
import { isElectronRenderer } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createTdsCanvasSessionSdk } from '@talex-touch/utils/transport/sdk/domains/tds-capture'

function resolveCanvasSessionSdk() {
  if (!isElectronRenderer()) return null
  try {
    const transport = useTuffTransport()
    if (!transport || typeof transport.send !== 'function') {
      return null
    }
    return createTdsCanvasSessionSdk(transport)
  } catch {
    return null
  }
}

/**
 * Loads a persisted TDS Canvas session from main-process storage (owner-only file under userData).
 * Returns `null` cleanly outside Electron or when no persisted session exists.
 */
export async function loadPersistedCanvasSession(
  conversationId: string
): Promise<TdsCanvasSessionData | null> {
  const cleanId = conversationId.trim()
  if (!cleanId) return null
  const sdk = resolveCanvasSessionSdk()
  if (!sdk) return null
  try {
    const response = await sdk.load(cleanId)
    if (!response || response.ok !== true || !response.session) {
      return null
    }
    return response.session
  } catch {
    return null
  }
}

/**
 * Persists a TDS Canvas session to bounded main-process storage (never Web Storage).
 * Returns `false` cleanly outside Electron or on transport/cap errors.
 */
export async function savePersistedCanvasSession(
  conversationId: string,
  session: TdsCanvasSessionData
): Promise<boolean> {
  const cleanId = conversationId.trim()
  if (!cleanId) return false
  const sdk = resolveCanvasSessionSdk()
  if (!sdk) return false
  try {
    const response = await sdk.save(cleanId, session)
    return Boolean(response && response.ok === true)
  } catch {
    return false
  }
}

/**
 * Removes a persisted TDS Canvas session from main-process storage.
 */
export async function deletePersistedCanvasSession(conversationId: string): Promise<boolean> {
  const cleanId = conversationId.trim()
  if (!cleanId) return false
  const sdk = resolveCanvasSessionSdk()
  if (!sdk) return false
  try {
    const response = await sdk.delete(cleanId)
    return Boolean(response && response.ok === true && response.deleted)
  } catch {
    return false
  }
}
