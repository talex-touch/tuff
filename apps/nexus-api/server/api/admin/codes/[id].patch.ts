import type { D1Database } from '@cloudflare/workers-types'
import { createError, defineEventHandler, readBody } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { readCloudflareBindings } from '../../../utils/cloudflare'

const ACTIVATION_CODES_TABLE = 'activation_codes'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = event.context.params?.id
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Code id is required.' })

  const body = await readBody<{ status?: string }>(event)
  const status = body?.status?.trim().toLowerCase()

  if (status !== 'revoked')
    throw createError({ statusCode: 400, statusMessage: 'Invalid status.' })

  const bindings = readCloudflareBindings(event)
  const db = bindings?.DB as D1Database | null

  if (!db)
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })

  const existing = await db.prepare(`
    SELECT id, code, status FROM ${ACTIVATION_CODES_TABLE} WHERE id = ?1;
  `).bind(id).first<{ id: string, code: string, status: string }>()

  if (!existing)
    throw createError({ statusCode: 404, statusMessage: 'Code not found.' })

  await db.prepare(`
    UPDATE ${ACTIVATION_CODES_TABLE}
    SET status = 'revoked'
    WHERE id = ?1;
  `).bind(id).run()

  return {
    code: {
      id,
      status: 'revoked',
    },
  }
})
