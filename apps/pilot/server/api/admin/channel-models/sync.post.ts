import { requirePilotAdmin } from '../../../utils/pilot-admin-auth'
import { syncPilotChannelModels } from '../../../utils/pilot-channel-model-sync'

export default defineEventHandler(async (event) => {
  await requirePilotAdmin(event)
  const result = await syncPilotChannelModels(event)
  return {
    ok: true,
    result,
  }
})
