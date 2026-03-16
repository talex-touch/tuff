import type { PilotAdminSettingsPatch } from '../../../utils/pilot-admin-settings'
import { requirePilotAdmin } from '../../../utils/pilot-admin-auth'
import { updatePilotAdminSettings } from '../../../utils/pilot-admin-settings'

export default defineEventHandler(async (event) => {
  await requirePilotAdmin(event)
  const body = await readBody<PilotAdminSettingsPatch>(event)
  const settings = await updatePilotAdminSettings(event, {
    channels: body?.channels,
    storage: body?.storage,
  })
  return {
    ok: true,
    settings,
  }
})
