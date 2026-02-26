import type { IntelligenceProviderSyncPayload, IntelligenceProviderSyncRecord } from '@talex-touch/utils'
import {
  TUFF_INTELLIGENCE_PROVIDER_SYNC_SCHEMA_VERSION,
} from '@talex-touch/utils'
import { requireAuth } from '../../../../utils/auth'
import { listProviders, type IntelligenceProviderRecord } from '../../../../utils/intelligenceStore'

function toSyncRecord(provider: IntelligenceProviderRecord): IntelligenceProviderSyncRecord {
  return {
    id: provider.id,
    type: provider.type,
    name: provider.name,
    enabled: provider.enabled,
    hasApiKey: provider.hasApiKey,
    baseUrl: provider.baseUrl,
    models: Array.isArray(provider.models) ? provider.models : [],
    defaultModel: provider.defaultModel,
    instructions: provider.instructions,
    timeout: provider.timeout,
    priority: provider.priority,
    rateLimit: provider.rateLimit,
    capabilities: provider.capabilities,
    metadata: provider.metadata,
    updatedAt: provider.updatedAt,
  }
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const providers = await listProviders(event, userId)
  const payload: IntelligenceProviderSyncPayload = {
    schemaVersion: TUFF_INTELLIGENCE_PROVIDER_SYNC_SCHEMA_VERSION,
    source: 'nexus',
    exportedAt: new Date().toISOString(),
    providers: providers.map(toSyncRecord),
  }
  return payload
})
