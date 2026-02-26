import type {
  IntelligencePromptRegistryListResponse,
  IntelligencePromptRegistryQuery,
  IntelligencePromptScope,
  IntelligencePromptStatus,
} from '@talex-touch/utils'
import { requireAdmin } from '../../../utils/auth'
import { listPromptRegistry } from '../../../utils/intelligenceStore'

const PROMPT_SCOPES: IntelligencePromptScope[] = ['global', 'capability', 'provider']
const PROMPT_STATUSES: IntelligencePromptStatus[] = ['active', 'deprecated']

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const query = getQuery(event)

  const scopeRaw = String(query.scope || '').trim()
  const statusRaw = String(query.status || '').trim()
  const limitRaw = Number(query.limit)

  const options: IntelligencePromptRegistryQuery = {
    scope: PROMPT_SCOPES.includes(scopeRaw as IntelligencePromptScope)
      ? (scopeRaw as IntelligencePromptScope)
      : undefined,
    capabilityId: String(query.capabilityId || '').trim() || undefined,
    providerId: String(query.providerId || '').trim() || undefined,
    status: PROMPT_STATUSES.includes(statusRaw as IntelligencePromptStatus)
      ? (statusRaw as IntelligencePromptStatus)
      : undefined,
    limit: Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 1000) : undefined,
  }

  const prompts = await listPromptRegistry(event, userId, options)
  const response: IntelligencePromptRegistryListResponse = { prompts }
  return response
})
