import type { D1Database } from '@cloudflare/workers-types'
import { requireAdmin } from '../../../utils/auth'
import { readCloudflareBindings } from '../../../utils/cloudflare'

const USERS_TABLE = 'auth_users'
const ACTIVATION_LOGS_TABLE = 'activation_logs'

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
  const rawSearch = typeof query.q === 'string'
    ? query.q
    : (typeof query.query === 'string' ? query.query : '')
  const search = rawSearch.trim()
  const status = typeof query.status === 'string' ? query.status.trim().toLowerCase() : ''
  const role = typeof query.role === 'string' ? query.role.trim().toLowerCase() : ''

  const conditions: string[] = []
  const params: Array<string | number> = []

  const addParam = (value: string | number) => {
    params.push(value)
    return `?${params.length}`
  }

  if (search) {
    const term = `%${search.toLowerCase()}%`
    const emailParam = addParam(term)
    const nameParam = addParam(term)
    conditions.push(`(LOWER(u.email) LIKE ${emailParam} OR LOWER(u.name) LIKE ${nameParam})`)
  }

  if (['active', 'disabled', 'merged'].includes(status)) {
    const statusParam = addParam(status)
    conditions.push(`u.status = ${statusParam}`)
  }

  if (['admin', 'user'].includes(role)) {
    const roleParam = addParam(role)
    conditions.push(`LOWER(u.role) = ${roleParam}`)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    const countResult = await db.prepare(`
      SELECT COUNT(*) as count
      FROM ${USERS_TABLE} u
      ${whereClause};
    `).bind(...params).first<{ count: number }>()

    const total = countResult?.count || 0
    const limitParam = `?${params.length + 1}`
    const offsetParam = `?${params.length + 2}`

    const { results } = await db.prepare(`
      SELECT
        u.id as user_id,
        u.email as email,
        u.name as name,
        u.image as image,
        u.role as role,
        u.status as status,
        u.created_at as created_at,
        l.plan as plan,
        l.activated_at as activated_at,
        l.expires_at as expires_at
      FROM ${USERS_TABLE} u
      LEFT JOIN (
        SELECT al.user_id, al.plan, al.activated_at, al.expires_at
        FROM ${ACTIVATION_LOGS_TABLE} al
        INNER JOIN (
          SELECT user_id, MAX(activated_at) as latest_activated
          FROM ${ACTIVATION_LOGS_TABLE}
          GROUP BY user_id
        ) latest
        ON latest.user_id = al.user_id AND latest.latest_activated = al.activated_at
      ) l ON l.user_id = u.id
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam};
    `).bind(...params, limit, offset).all<Record<string, any>>()

    const now = new Date()
    const subscriptions = (results ?? []).map(row => {
      const expiresAt = row.expires_at ?? null
      const activatedAt = row.activated_at ?? null
      const expiresDate = expiresAt ? new Date(expiresAt) : null
      const isActive = !expiresDate || expiresDate > now
      const plan = row.plan && isActive ? row.plan : 'FREE'

      return {
        user: {
          id: row.user_id,
          email: row.email,
          name: row.name ?? null,
          image: row.image ?? null,
          role: row.role ?? 'user',
          status: row.status ?? 'active',
          createdAt: row.created_at,
        },
        subscription: {
          plan,
          activatedAt,
          expiresAt,
          isActive,
        },
      }
    })

    return {
      subscriptions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }
  catch (error: any) {
    console.error('[admin/subscriptions] Error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to list subscriptions',
    })
  }
})
