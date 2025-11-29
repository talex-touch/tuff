import { readBody } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { createUpdate } from '../../utils/dashboardStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody(event)

  const update = await createUpdate(event, body)

  return {
    update,
  }
})
