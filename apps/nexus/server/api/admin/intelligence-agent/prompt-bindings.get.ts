import type {
  IntelligencePromptBindingListResponse,
  IntelligencePromptBindingQuery,
} from '@talex-touch/tuff-intelligence'
import { requireAdmin } from '../../../utils/auth'
import { listPromptBindings } from '../../../utils/intelligenceStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const query = getQuery(event)
  const options: IntelligencePromptBindingQuery = {
    capabilityId: String(query.capabilityId || '').trim() || undefined,
  }
  const bindings = await listPromptBindings(event, userId, options)
  const response: IntelligencePromptBindingListResponse = { bindings }
  return response
})
