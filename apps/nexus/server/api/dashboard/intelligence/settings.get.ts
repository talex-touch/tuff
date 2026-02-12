import { requireAdmin } from '../../../utils/auth'
import { getSettings } from '../../../utils/intelligenceStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const settings = await getSettings(event, userId)
  return { settings }
})
