import { listUpdates } from '../utils/dashboardStore'

export default defineEventHandler(async (event) => {
  const updates = await listUpdates(event)
  return { updates }
})
