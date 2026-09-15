import type {
  CatalogVoiceProviderCheckResponse,
  CatalogVoiceProviderRollbackRequest,
  CatalogVoiceProviderRollbackResponse,
  CatalogVoiceProviderStatusResponse,
  CatalogVoiceProviderSyncResponse,
} from './types/catalog'
import { defineEvent } from '../event/builder'

/** Host-only controls for signed catalog delivery. Payload bytes never cross this boundary. */
export const CatalogEvents = {
  voiceProvider: {
    getStatus: defineEvent('catalog')
      .module('voice-provider')
      .event('status')
      .define<void, CatalogVoiceProviderStatusResponse>(),
    checkUpdates: defineEvent('catalog')
      .module('voice-provider')
      .event('check-updates')
      .define<void, CatalogVoiceProviderCheckResponse>(),
    sync: defineEvent('catalog')
      .module('voice-provider')
      .event('sync')
      .define<void, CatalogVoiceProviderSyncResponse>(),
    rollback: defineEvent('catalog')
      .module('voice-provider')
      .event('rollback')
      .define<CatalogVoiceProviderRollbackRequest, CatalogVoiceProviderRollbackResponse>(),
  },
} as const
