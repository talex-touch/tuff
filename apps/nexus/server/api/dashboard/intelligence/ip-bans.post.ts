import { readBody } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { upsertIpBan } from '../../../utils/intelligenceStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody(event)
  const ip = typeof body?.ip === 'string' ? body.ip.trim() : ''
  if (!ip)
    return { ok: false, error: 'Missing ip' }

  const reason = typeof body?.reason === 'string' ? body.reason.trim() : null
  const ban = await upsertIpBan(event, { ip, reason, enabled: true })
  return { ok: true, ban }
})
