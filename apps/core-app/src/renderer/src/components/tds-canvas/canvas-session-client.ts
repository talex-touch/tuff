import type { TdsCanvasSessionData } from '@talex-touch/utils/transport/sdk/domains/tds-capture'
import { isElectronRenderer } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createTdsCanvasSessionSdk } from '@talex-touch/utils/transport/sdk/domains/tds-capture'

export type TdsPersistedCanvasSession = TdsCanvasSessionData

export type LoadPersistedCanvasSessionResult =
  | { status: 'loaded'; session: TdsPersistedCanvasSession }
  | { status: 'missing' }
  | { status: 'error'; error: string }

export interface SavePersistedCanvasSessionResult {
  ok: boolean
  error?: string
  permanent?: boolean
}

const PERMANENT_SAVE_ERROR_PREFIXES = [
  'CANVAS_SESSION_TOO_LARGE',
  'CANVAS_FRAME_SOURCE_TOO_LARGE',
  'CANVAS_HISTORY_BLOB_TOO_LARGE',
  'CANVAS_SESSION_FRAME_LIMIT',
  'CANVAS_SESSION_CONVERSATION_DELETED',
  'INVALID_CONVERSATION_ID',
  'UNSUPPORTED_CANVAS_SESSION_VERSION'
] as const

export function isPermanentCanvasSessionSaveError(error: string | undefined): boolean {
  if (!error) return false
  const normalized = error.trim()
  return PERMANENT_SAVE_ERROR_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}:`)
  )
}

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
 * Loads a persisted TDS Canvas session from main-process storage.
 * Distinguishes a confirmed missing session from transport/storage failures so callers never
 * overwrite saved disk state after a transient or corruption error.
 * Non-Electron renderers remain memory-only (`{ status: 'missing' }`).
 */
export async function loadPersistedCanvasSession(
  conversationId: string
): Promise<LoadPersistedCanvasSessionResult> {
  if (!isElectronRenderer()) {
    return { status: 'missing' }
  }
  const cleanId = conversationId.trim()
  if (!cleanId) {
    return { status: 'error', error: 'INVALID_CONVERSATION_ID' }
  }
  const sdk = resolveCanvasSessionSdk()
  if (!sdk) {
    return { status: 'error', error: 'CANVAS_SESSION_TRANSPORT_UNAVAILABLE' }
  }
  try {
    const response = await sdk.load(cleanId)
    if (!response) {
      return { status: 'error', error: 'CANVAS_SESSION_EMPTY_RESPONSE' }
    }
    if (response.ok !== true) {
      return { status: 'error', error: response.error || 'CANVAS_SESSION_LOAD_FAILED' }
    }
    if (response.session) {
      return { status: 'loaded', session: response.session }
    }
    if (response.error) {
      return { status: 'error', error: response.error }
    }
    return { status: 'missing' }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error && error.message ? error.message : 'CANVAS_SESSION_LOAD_FAILED'
    }
  }
}

/**
 * Persists a TDS Canvas session to bounded main-process storage (never Web Storage).
 * Distinguishes permanent limit/validation errors from transient IPC failures so callers can
 * retry transient failures cleanly and surface recovery guidance on permanent caps.
 */
export async function savePersistedCanvasSession(
  conversationId: string,
  session: TdsPersistedCanvasSession
): Promise<SavePersistedCanvasSessionResult> {
  if (!isElectronRenderer()) {
    return { ok: false, error: 'CANVAS_SESSION_NON_ELECTRON', permanent: true }
  }
  const cleanId = conversationId.trim()
  if (!cleanId) {
    return { ok: false, error: 'INVALID_CONVERSATION_ID', permanent: true }
  }
  const sdk = resolveCanvasSessionSdk()
  if (!sdk) {
    return { ok: false, error: 'CANVAS_SESSION_TRANSPORT_UNAVAILABLE', permanent: false }
  }
  try {
    const response = await sdk.save(cleanId, session)
    if (response && response.ok === true) {
      return { ok: true }
    }
    const error = response?.error || 'CANVAS_SESSION_SAVE_FAILED'
    return {
      ok: false,
      error,
      permanent: isPermanentCanvasSessionSaveError(error)
    }
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : 'CANVAS_SESSION_SAVE_FAILED'
    return {
      ok: false,
      error: message,
      permanent: isPermanentCanvasSessionSaveError(message)
    }
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
