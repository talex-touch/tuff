import { readBody } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { saveUpdateSettings } from '../../../utils/dashboardStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<{ syncBaseUrl?: string | null }>(event)
  const settings = await saveUpdateSettings(event, { syncBaseUrl: body?.syncBaseUrl })

  return { settings }
})
