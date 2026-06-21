import { createError, readBody } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import { getUserById } from '../../../../utils/authStore'
import { logAdminAudit } from '../../../../utils/adminAuditStore'
import { adjustUserCredits, getCreditSummary, listCreditLedgerByUsers } from '../../../../utils/creditsStore'

export default defineEventHandler(async (event) => {
  const { userId: adminId } = await requireAdmin(event)

  const id = event.context.params?.id
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'User id is required.' })

  const targetUser = await getUserById(event, id)
  if (!targetUser)
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  if (targetUser.status === 'merged')
    throw createError({ statusCode: 400, statusMessage: 'Merged users cannot be updated.' })

  const body = await readBody<{ amount?: number | string; direction?: string; reason?: string }>(event)
  const amount = Math.round(Math.abs(Number(body?.amount ?? 0)))
  if (!Number.isFinite(amount) || amount <= 0)
    throw createError({ statusCode: 400, statusMessage: 'Invalid credit amount.' })

  const direction = String(body?.direction || 'add').trim().toLowerCase()
  if (direction !== 'add' && direction !== 'subtract')
    throw createError({ statusCode: 400, statusMessage: 'Invalid credit direction.' })

  const reason = typeof body?.reason === 'string' && body.reason.trim()
    ? body.reason.trim().slice(0, 120)
    : `admin-${direction === 'add' ? 'credit' : 'debit'}`

  let adjustment
  try {
    adjustment = await adjustUserCredits(event, id, direction === 'add' ? amount : -amount, reason, {
      adminUserId: adminId,
      source: 'admin-user-management',
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to adjust credits.'
    throw createError({ statusCode: 400, statusMessage: message })
  }

  await logAdminAudit(event, {
    adminUserId: adminId,
    action: 'user.credits.adjust',
    targetType: 'user',
    targetId: targetUser.id,
    targetLabel: targetUser.email,
    metadata: {
      delta: adjustment.delta,
      reason: adjustment.reason,
      ledgerId: adjustment.ledgerId,
    },
  })

  const [summary, ledger] = await Promise.all([
    getCreditSummary(event, id),
    listCreditLedgerByUsers(event, [id], { page: 1, limit: 10 }),
  ])

  return {
    adjustment,
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
