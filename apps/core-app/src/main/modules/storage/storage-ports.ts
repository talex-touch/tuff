export interface StorageBeforeRendererSaveEvent {
  key: string
  previousDocument: unknown
  incomingPayload: unknown
  clientVersion: number | undefined
  serverVersion: number
}

export type StorageBeforeRendererSaveObserver = (event: StorageBeforeRendererSaveEvent) => void

interface RegisteredStorageBeforeRendererSaveObserver {
  id: string
  key: string
  observer: StorageBeforeRendererSaveObserver
}

const beforeRendererSaveObservers = new Map<
  string,
  Map<string, RegisteredStorageBeforeRendererSaveObserver>
>()

/**
 * Registers an idempotent observer invoked right before an accepted renderer save
 * replaces the stored document for `key`. Re-registering the same `(key, id)`
 * replaces the existing observer in place without duplicates.
 */
export function registerStorageBeforeRendererSaveObserver(
  key: string,
  id: string,
  observer: StorageBeforeRendererSaveObserver
): () => void {
  let keyObservers = beforeRendererSaveObservers.get(key)
  if (!keyObservers) {
    keyObservers = new Map()
    beforeRendererSaveObservers.set(key, keyObservers)
  }
  const entry: RegisteredStorageBeforeRendererSaveObserver = { id, key, observer }
  keyObservers.set(id, entry)

  return () => {
    const currentKeyObservers = beforeRendererSaveObservers.get(key)
    if (currentKeyObservers?.get(id) === entry) {
      currentKeyObservers.delete(id)
      if (currentKeyObservers.size === 0) {
        beforeRendererSaveObservers.delete(key)
      }
    }
  }
}

export function hasStorageBeforeRendererSaveObservers(key: string): boolean {
  const keyObservers = beforeRendererSaveObservers.get(key)
  return Boolean(keyObservers && keyObservers.size > 0)
}

export function notifyStorageBeforeRendererSave(
  event: StorageBeforeRendererSaveEvent,
  onObserverError?: (error: unknown, observerId: string) => void
): void {
  const keyObservers = beforeRendererSaveObservers.get(event.key)
  if (!keyObservers || keyObservers.size === 0) return

  for (const entry of Array.from(keyObservers.values())) {
    try {
      entry.observer(event)
    } catch (error) {
      onObserverError?.(error, entry.id)
    }
  }
}

export function clearStoragePortsForTesting(): void {
  beforeRendererSaveObservers.clear()
}
