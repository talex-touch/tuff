import { requireAdmin } from '../../../utils/auth'
import { getUpdateSettings } from '../../../utils/dashboardStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const settings = await getUpdateSettings(event)
  return { settings }
})
