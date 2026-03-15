import { ensureSubscribePlanSeed } from '../../utils/pilot-compat-seeds'
import { listPilotCompatEntities } from '../../utils/pilot-compat-store'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  await ensureSubscribePlanSeed(event)
  const body = await readBody<Record<string, any>>(event)
  const page = await listPilotCompatEntities(event, 'subscribe.plans', {
    query: body || {},
    defaultPageSize: 20,
  })
  return quotaOk(page)
})
