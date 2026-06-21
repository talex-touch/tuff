import { createError, getQuery } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import { getUserById } from '../../../../utils/authStore'
import { getCreditSummary, listCreditLedgerByUsers } from '../../../../utils/creditsStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = event.context.params?.id
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'User id is required.' })

  const targetUser = await getUserById(event, id)
  if (!targetUser)
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })

  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10))

  const [summary, ledger] = await Promise.all([
    getCreditSummary(event, id),
    listCreditLedgerByUsers(event, [id], { page, limit }),
  ])

  return {
    user: {
      id: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
      status: targetUser.status,
    },
    summary,
    ledger: {
      entries: ledger.entries,
      pagination: {
        page: ledger.page,
        limit: ledger.pageSize,
        total: ledger.total,
        totalPages: Math.ceil(ledger.total / ledger.pageSize),
      },
    },
  }
})
