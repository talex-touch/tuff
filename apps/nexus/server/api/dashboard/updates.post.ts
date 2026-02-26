import { readBody } from 'h3'
import { requireAdminOrApiKey } from '../../utils/auth'
import { createUpdate } from '../../utils/dashboardStore'

export default defineEventHandler(async (event) => {
  await requireAdminOrApiKey(event, ['release:news'])
  const body = await readBody(event)

  const update = await createUpdate(event, body)

  return {
    update,
  }
})
