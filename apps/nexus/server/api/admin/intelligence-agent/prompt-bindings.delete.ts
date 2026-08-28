import type { IntelligencePromptBindingDeletePayload } from '@talex-touch/tuff-intelligence/light'
import { logAdminAudit } from '../../../utils/adminAuditStore'
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

  await logAdminAudit(event, {
    adminUserId: userId,
    action: 'intelligence.prompt-binding.delete',
    targetType: 'intelligence_prompt_binding',
    targetId: capabilityId,
    targetLabel: providerId ? `${capabilityId}@${providerId}` : `${capabilityId}@*`,
    metadata: {
      // Omitting providerId drops every provider's binding for the capability.
      providerId: providerId ?? null,
      allProviders: !providerId,
    },
  })

  return { ok: true }
})
