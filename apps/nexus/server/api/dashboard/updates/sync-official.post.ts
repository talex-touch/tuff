import { requireAdminOrApiKey } from '../../../utils/auth'
import { syncOfficialUpdates } from '../../../utils/dashboardStore'

export default defineEventHandler(async (event) => {
  await requireAdminOrApiKey(event, ['release:news'])

  const result = await syncOfficialUpdates(event)

  return {
    ok: true,
    ...result,
  }
})
