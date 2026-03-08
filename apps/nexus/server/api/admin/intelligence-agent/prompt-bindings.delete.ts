import type { IntelligencePromptBindingDeletePayload } from '@talex-touch/tuff-intelligence'
import { requireAdmin } from '../../../utils/auth'
import { deletePromptBinding } from '../../../utils/intelligenceStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody<IntelligencePromptBindingDeletePayload>(event)
  const capabilityId = String(body?.capabilityId || '').trim()
  const providerId = String(body?.providerId || '').trim() || undefined

  if (!capabilityId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'capabilityId is required',
    })
  }

  await deletePromptBinding(event, userId, capabilityId, providerId)
  return { ok: true }
})
