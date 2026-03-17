import { requirePilotAdmin } from '../../utils/pilot-admin-auth'
import { getPilotAdminSettings } from '../../utils/pilot-admin-settings'

export default defineEventHandler(async (event) => {
  await requirePilotAdmin(event)
  const settings = await getPilotAdminSettings(event)
  return {
    settings,
  }
})
