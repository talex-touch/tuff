import { requireAdmin } from '../../../../utils/auth'
import { unblockIp } from '../../../../utils/ipSecurityStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<{ ip?: unknown }>(event)
  const ip = typeof body?.ip === 'string' ? body.ip : ''
  const success = await unblockIp(event, ip)

  return { success }
})

