import type { ITuffTransport } from '../../transport'
import type { IStorageChannel } from './base-storage'
import { initStorageChannel, initStorageTransport } from './base-storage'
import { initStorageSubscription } from './storage-subscription'

export interface RendererStorageBootstrapOptions {
  /**
   * Retired channel argument retained for source compatibility.
   * Runtime storage ignores it and uses transport only.
   */
  legacyChannel?: IStorageChannel | null
}

/**
 * Initialize renderer storage through the typed transport path.
 *
 * Historical TouchChannel arguments are accepted but ignored by runtime storage.
 */
export function initializeRendererStorage(
  transport: ITuffTransport,
  options: RendererStorageBootstrapOptions = {},
): void {
  initStorageTransport(transport)
  initStorageSubscription(undefined, transport)

  if (options.legacyChannel) {
    initStorageChannel(options.legacyChannel)
    initStorageSubscription(options.legacyChannel, transport)
  }
}
