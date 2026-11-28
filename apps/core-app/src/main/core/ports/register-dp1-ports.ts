import { StorageList } from '@talex-touch/utils'
import {
  describeIntelligenceWriteRegression,
  reportIntelligenceWriteRegression
} from '../../modules/ai/intelligence-config-write-probe'
import { searchIndexWriter } from '../../modules/box-tool/search-engine/search-index-writer'
import { registerDatabaseWalSearchIndexWriterPort } from '../../modules/database/database-ports'
import { registerStorageBeforeRendererSaveObserver } from '../../modules/storage/storage-ports'

const INTELLIGENCE_WRITE_PROBE_OBSERVER_ID = 'intelligence-config-write-probe'

let activeDisposers: Array<() => void> = []

/**
 * Composition-root wiring for DP1 (Persistence) ports.
 *
 * Binds higher-layer runtime collaborators (DP4 search-index writer WAL quiescence
 * coordination and DP6 intelligence config write regression probe) into DP1's
 * inversion-of-control ports. Calling this repeatedly is idempotent: each call
 * replaces the previous slot/observer entry in place without creating duplicates.
 */
export function registerDp1Ports(): () => void {
  const disposers = [
    registerDatabaseWalSearchIndexWriterPort({
      getStatus: () => searchIndexWriter.getStatus(),
      withPausedAdmission: (reason, operation, timeoutMs) =>
        searchIndexWriter.withPausedAdmission(reason, operation, timeoutMs)
    }),
    registerStorageBeforeRendererSaveObserver(
      StorageList.IntelligenceConfig,
      INTELLIGENCE_WRITE_PROBE_OBSERVER_ID,
      (event) => {
        const regression = describeIntelligenceWriteRegression(
          event.previousDocument,
          event.incomingPayload,
          {
            clientVersion: event.clientVersion,
            serverVersion: event.serverVersion
          }
        )
        if (regression) {
          reportIntelligenceWriteRegression(regression)
        }
      }
    )
  ]
  activeDisposers = disposers

  return () => {
    if (activeDisposers !== disposers) return
    activeDisposers = []
    for (const dispose of disposers) {
      dispose()
    }
  }
}
