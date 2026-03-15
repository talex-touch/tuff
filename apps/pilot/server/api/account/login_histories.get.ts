import { requirePilotAuth } from '../../utils/auth'
import { ensureAccountHistorySeed } from '../../utils/pilot-compat-seeds'
import { listPilotCompatEntities } from '../../utils/pilot-compat-store'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  await ensureAccountHistorySeed(event)

  const page = await listPilotCompatEntities(event, 'account.login_histories', {
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
