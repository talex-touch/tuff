import { requirePilotAdmin } from '../../utils/pilot-admin-auth'
import { getPilotAdminSettings } from '../../utils/pilot-admin-settings'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  await requirePilotAdmin(event)
  const settings = await getPilotAdminSettings(event)

  return quotaOk(settings.channels)
})
