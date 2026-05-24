import { readBody } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import { runStorageChannelSmoke } from '../../../../utils/storageChannelSmoke'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody(event)

  return await runStorageChannelSmoke(event, {
    policyId: body?.policyId,
    mode: body?.mode,
    actorId: userId,
  })
})
