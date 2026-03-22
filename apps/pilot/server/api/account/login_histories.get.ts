import { requirePilotAuth } from '../../utils/auth'
import { ensureAccountHistorySeed } from '../../utils/pilot-compat-seeds'
import { listPilotEntities } from '../../utils/pilot-entity-store'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  await ensureAccountHistorySeed(event)

  const page = await listPilotEntities(event, 'account.login_histories', {
    query: getQuery(event),
    defaultPageSize: 20,
  })

  if (auth.isAuthenticated) {
    return quotaOk(page)
  }

  return quotaOk({
    items: [],
    meta: {
      ...page.meta,
      totalItems: 0,
      itemCount: 0,
      totalPages: 0,
    },
  })
})
