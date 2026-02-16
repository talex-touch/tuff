import { setHeader } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { listAdminAudits, logAdminAudit } from '../../../utils/adminAuditStore'

function escapeCsv(value: string) {
  if (value.includes('"'))
    value = value.replace(/"/g, '""')
  if (/[",\n]/.test(value))
    return `"${value}"`
  return value
}

export default defineEventHandler(async (event) => {
  const { userId: adminId, user } = await requireAdmin(event)

  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(5000, Math.max(1, Number(query.limit) || 5000))
  const search = typeof query.q === 'string'
    ? query.q.trim()
    : (typeof query.query === 'string' ? query.query.trim() : '')
  const action = typeof query.action === 'string' ? query.action.trim() : ''
  const targetType = typeof query.targetType === 'string' ? query.targetType.trim() : ''
  const adminUserId = typeof query.adminUserId === 'string' ? query.adminUserId.trim() : ''

  const { audits } = await listAdminAudits(event, {
    page,
    limit,
    search: search || undefined,
    action: action || undefined,
    targetType: targetType || undefined,
    adminUserId: adminUserId || undefined,
  })

  const headerRow = [
    'created_at',
    'admin_id',
    'admin_name',
    'admin_email',
    'action',
    'target_type',
    'target_id',
    'target_label',
    'ip',
    'user_agent',
    'metadata',
  ]

  const rows = audits.map((audit) => {
    const metadata = audit.metadata ? JSON.stringify(audit.metadata) : ''
    return [
      audit.createdAt,
      audit.adminUserId,
      audit.adminName ?? '',
      audit.adminEmail ?? '',
      audit.action,
      audit.targetType ?? '',
      audit.targetId ?? '',
      audit.targetLabel ?? '',
      audit.ip ?? '',
      audit.userAgent ?? '',
      metadata,
    ].map(value => escapeCsv(String(value)))
  })

  await logAdminAudit(event, {
    adminUserId: adminId,
    action: 'audit.export',
    targetType: 'audit',
    targetId: null,
    targetLabel: user.email ?? adminId,
    metadata: {
      limit,
      page,
      filters: {
        search: search || null,
        action: action || null,
        targetType: targetType || null,
        adminUserId: adminUserId || null,
      },
    },
  })

  const csvBody = ['\ufeff' + headerRow.join(','), ...rows.map(row => row.join(','))].join('\n')
  const fileDate = new Date().toISOString().slice(0, 10)

  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="admin-audits-${fileDate}.csv"`)

  return csvBody
})
