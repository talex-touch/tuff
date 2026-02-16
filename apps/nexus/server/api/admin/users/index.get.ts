import type { D1Database } from '@cloudflare/workers-types'
import { requireAdmin } from '../../../utils/auth'
import { readCloudflareBindings } from '../../../utils/cloudflare'

const USERS_TABLE = 'auth_users'

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
    conditions.push(`(LOWER(email) LIKE ${emailParam} OR LOWER(name) LIKE ${nameParam})`)
  }

  if (['active', 'disabled', 'merged'].includes(status)) {
    const statusParam = addParam(status)
    conditions.push(`status = ${statusParam}`)
  }

  if (['admin', 'user'].includes(role)) {
    const roleParam = addParam(role)
    conditions.push(`LOWER(role) = ${roleParam}`)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    const countResult = await db.prepare(`
      SELECT COUNT(*) as count FROM ${USERS_TABLE} ${whereClause};
    `).bind(...params).first<{ count: number }>()

    const total = countResult?.count || 0
    const limitParam = `?${params.length + 1}`
    const offsetParam = `?${params.length + 2}`

    const { results } = await db.prepare(`
      SELECT
        id,
        email,
        name,
        image,
        role,
        status,
        email_state,
        email_verified,
        locale,
        disabled_at,
        created_at
      FROM ${USERS_TABLE}
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam};
    `).bind(...params, limit, offset).all<Record<string, any>>()

    const users = (results ?? []).map(row => ({
      id: row.id,
      email: row.email,
      name: row.name ?? null,
      image: row.image ?? null,
      role: row.role ?? 'user',
      status: row.status ?? 'active',
      emailState: row.email_state ?? (row.email_verified ? 'verified' : 'unverified'),
      locale: row.locale ?? null,
      disabledAt: row.disabled_at ?? null,
      createdAt: row.created_at,
    }))

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }
  catch (error: any) {
    console.error('[admin/users] Error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to list users',
    })
  }
})
