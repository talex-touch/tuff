import type { H3Event } from 'h3'
import { clerkClient } from '@clerk/nuxt/server'
import { createError } from 'h3'

export interface AuthContext {
  userId: string
}

export async function requireAuth(event: H3Event): Promise<AuthContext> {
  const authFn = event.context.auth
  if (!authFn)
    throw createError({ statusCode: 500, statusMessage: 'Clerk auth context is unavailable.' })

  let auth: any
  try {
    auth = await authFn()
  }
  catch (error: any) {
    throw createError({ statusCode: 500, statusMessage: error?.message || 'Clerk auth failed.' })
  }

  const userId = auth?.userId

  if (!userId)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  return { userId }
}

export async function requireAdmin(event: H3Event) {
  const { userId } = await requireAuth(event)

  let client: any
  try {
    client = clerkClient(event)
  }
  catch (error: any) {
    throw createError({ statusCode: 500, statusMessage: error?.message || 'Clerk client initialization failed.' })
  }

  let user: any
  try {
    user = await client.users.getUser(userId)
  }
  catch (error: any) {
    const status = typeof error?.status === 'number' ? error.status : undefined
    const statusCode = status === 404 ? 401 : status

    throw createError({
      statusCode: statusCode && statusCode >= 400 && statusCode < 600 ? statusCode : 500,
      statusMessage: error?.message || 'Failed to fetch user info.',
    })
  }

  const role = user.publicMetadata?.role

  if (role !== 'admin')
    throw createError({ statusCode: 403, statusMessage: 'Admin permission required.' })

  return { userId, user }
}
