import type { IntelligencePromptRegistryDeletePayload } from '@talex-touch/tuff-intelligence/light'
import { logAdminAudit } from '../../../utils/adminAuditStore'
import { requireAdmin } from '../../../utils/auth'
import { deletePromptRecord } from '../../../utils/intelligenceStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody<IntelligencePromptRegistryDeletePayload>(event)
  const id = String(body?.id || '').trim()
  const version = String(body?.version || '').trim() || undefined

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'id is required',
    })
  }

  await deletePromptRecord(event, userId, id, version)

  await logAdminAudit(event, {
    adminUserId: userId,
    action: 'intelligence.prompt.delete',
    targetType: 'intelligence_prompt',
    targetId: id,
    targetLabel: version ? `${id}@${version}` : `${id}@*`,
    metadata: {
      // Omitting version deletes every version of the prompt, so the trail has
      // to say which of the two happened.
      version: version ?? null,
      allVersions: !version,
    },
  })

  return { ok: true }
})
