import { readBody } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import { setIpBanEnabled } from '../../../../utils/intelligenceStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = event.context.params?.id
  if (!id)
    return { ok: false, error: 'Missing id' }

  const body = await readBody(event)
  const enabled = Boolean(body?.enabled)
  await setIpBanEnabled(event, id, enabled)
  return { ok: true }
})
