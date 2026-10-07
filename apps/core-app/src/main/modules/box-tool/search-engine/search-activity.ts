import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import { appTaskGate } from '../../../service/app-task-gate'

const foregroundSearches = new Set<string>()
const MAINTENANCE_IDLE_POLL_MS = 100

let lastSearchActivityAt = 0

export function markSearchActivity(at = Date.now()): void {
  lastSearchActivityAt = at
}

export function isSearchRecentlyActive(windowMs = 2000): boolean {
  if (lastSearchActivityAt <= 0) return false
  return Date.now() - lastSearchActivityAt <= Math.max(0, windowMs)
}

export function getLastSearchActivityAt(): number {
  return lastSearchActivityAt
}

export function beginForegroundSearchActivity(sessionId: string): void {
  foregroundSearches.add(sessionId)
  markSearchActivity()
}

export function endForegroundSearchActivity(sessionId: string): void {
  foregroundSearches.delete(sessionId)
}

export function hasActiveForegroundSearches(): boolean {
  return foregroundSearches.size > 0
}

export function isIndexMaintenanceIdle(): boolean {
  return (
    !hasActiveForegroundSearches() &&
    !isSearchRecentlyActive() &&
    !appTaskGate.isActive() &&
    !dbWriteScheduler.hasInteractiveWrites()
  )
}

export async function waitForIndexMaintenanceIdle(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted()
  while (!isIndexMaintenanceIdle()) {
    await new Promise<void>((resolve, reject) => {
      const finish = (): void => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
      }
      const abort = (): void => {
        finish()
        reject(signal?.reason)
      }
      const timer = setTimeout(() => {
        finish()
        resolve()
      }, MAINTENANCE_IDLE_POLL_MS)
      timer.unref?.()
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
    })
    signal?.throwIfAborted()
  }
}
