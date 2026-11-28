import type { D1Database } from '@cloudflare/workers-types'
import { requireAdmin } from '../../../utils/auth'
import { readCloudflareBindings } from '../../../utils/cloudflare'

const ACTIVATION_CODES_TABLE = 'activation_codes'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const bindings = readCloudflareBindings(event)
  const db = bindings?.DB as D1Database | null

  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  const query = getQuery(event)
  const requestedPage = Number(query.page) || 1
  const requestedLimit = Number(query.limit) || 20
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.floor(requestedLimit))) : 20
  const offset = (page - 1) * limit
  const status = typeof query.status === 'string' ? query.status : undefined
  const plan = typeof query.plan === 'string' ? query.plan : undefined
  const search = typeof query.q === 'string' ? query.q.trim() : ''

  try {
    const conditions: string[] = []
    const params: string[] = []

    if (status && ['active', 'exhausted', 'expired', 'revoked'].includes(status)) {
      params.push(status)
      conditions.push(`status = ?${params.length}`)
    }
    if (plan && ['FREE', 'PLUS', 'PRO', 'TEAM', 'ENTERPRISE'].includes(plan)) {
      params.push(plan)
      conditions.push(`plan = ?${params.length}`)
    }
    if (search) {
      params.push(`%${search}%`)
      conditions.push(`code LIKE ?${params.length}`)
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    // Get total count
    const countResult = await db.prepare(`
      SELECT COUNT(*) as count FROM ${ACTIVATION_CODES_TABLE} ${whereClause};
    `).bind(...params).first<{ count: number }>()

    const total = countResult?.count || 0

    // Get codes
    const { results } = await db.prepare(`
      SELECT * FROM ${ACTIVATION_CODES_TABLE}
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT ?${params.length + 1} OFFSET ?${params.length + 2};
    `).bind(...params, limit, offset).all()

    return {
      codes: results || [],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    }
  }
  catch (error: any) {
    console.error('[admin/codes] Error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to list activation codes',
    })
  }
})
