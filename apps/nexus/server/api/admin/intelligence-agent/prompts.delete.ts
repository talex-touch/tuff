import type { IntelligencePromptRegistryDeletePayload } from '@talex-touch/tuff-intelligence'
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
  return { ok: true }
})
