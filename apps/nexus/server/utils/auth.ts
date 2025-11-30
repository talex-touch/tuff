import { clerkClient } from '@clerk/nuxt/server'
import type { H3Event } from 'h3'
import { createError } from 'h3'

export interface AuthContext {
  userId: string
}

export async function requireAuth(event: H3Event): Promise<AuthContext> {
  const authFn = event.context.auth
  if (!authFn)
    throw createError({ statusCode: 500, statusMessage: 'Clerk auth context is unavailable.' })

  const auth = await authFn()
  const userId = auth?.userId

  if (!userId)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  return { userId }
}

export async function requireAdmin(event: H3Event) {
  const { userId } = await requireAuth(event)

  const client = clerkClient(event)
  const user = await client.users.getUser(userId)
  const role = user.publicMetadata?.role

  if (role !== 'admin')
    throw createError({ statusCode: 403, statusMessage: 'Admin permission required.' })

  return { userId, user }
}
