import { requireAdmin } from '../../../../utils/auth'
import { deleteIpBan } from '../../../../utils/intelligenceStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = event.context.params?.id
  if (!id)
    return { ok: false, error: 'Missing id' }

  await deleteIpBan(event, id)
  return { ok: true }
})
