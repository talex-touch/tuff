import type { ITuffTransport } from '../../transport'
import type { IStorageChannel } from './base-storage'
import { initStorageChannel, initStorageTransport } from './base-storage'
import { initStorageSubscription } from './storage-subscription'

export interface RendererStorageBootstrapOptions {
  /**
   * Optional legacy channel fallback for hosts that have not completed the
   * transport migration yet. New renderer code should initialize with transport
   * only.
   */
  legacyChannel?: IStorageChannel | null
}

/**
 * Initialize renderer storage through the typed transport path.
 *
 * Legacy TouchChannel registration remains available as an explicit fallback,
 * but storage reads, writes, and update subscriptions prefer TuffTransport.
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
