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
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20))
  const offset = (page - 1) * limit
  const status = query.status as string | undefined

  try {
    let whereClause = ''
    const params: any[] = []

    if (status && ['active', 'exhausted', 'expired', 'revoked'].includes(status)) {
      whereClause = 'WHERE status = ?1'
      params.push(status)
    }

    // Get total count
    const countResult = await db.prepare(`
      SELECT COUNT(*) as count FROM ${ACTIVATION_CODES_TABLE} ${whereClause};
    `).bind(...params).first<{ count: number }>()

    const total = countResult?.count || 0

    // Get codes
    const { results } = await db.prepare(`
      SELECT * FROM ${ACTIVATION_CODES_TABLE}
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ?${params.length + 1} OFFSET ?${params.length + 2};
    `).bind(...params, limit, offset).all()

    return {
      codes: results || [],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  } catch (error: any) {
    console.error('[admin/codes] Error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to list activation codes',
    })
  }
})
