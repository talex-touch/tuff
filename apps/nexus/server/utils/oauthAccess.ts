import type { H3Event } from 'h3'
import { createError } from 'h3'
import { requireAuth } from './auth'
import { getUserById } from './authStore'
import { isTeamRoleAdminLike, resolveActiveTeamContext } from './teamContext'
import type { OauthOwnerScope } from './oauthClientStore'

export interface OauthManagementContext {
  userId: string
  isNexusAdmin: boolean
  isTeamAdmin: boolean
  teamId: string | null
}

export interface ResolveOauthScopeOptions {
  scope?: string | null
}

export async function requireOauthManager(event: H3Event): Promise<OauthManagementContext> {
  const { userId } = await requireAuth(event)
  const user = await getUserById(event, userId)
  const isNexusAdmin = Boolean(user?.status === 'active' && user.role === 'admin')

  let isTeamAdmin = false
  let teamId: string | null = null
  try {
    const context = await resolveActiveTeamContext(event, userId)
    if (context.team.type === 'organization' && isTeamRoleAdminLike(context.role)) {
      isTeamAdmin = true
      teamId = context.team.id
    }
  }
  catch {
    isTeamAdmin = false
    teamId = null
  }

  if (!isNexusAdmin && !isTeamAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only team admin or nexus admin can manage oauth applications.',
    })
  }

  return {
    userId,
    isNexusAdmin,
    isTeamAdmin,
    teamId,
  }
}

export function resolveOauthOwnerScope(
  context: OauthManagementContext,
  options: ResolveOauthScopeOptions = {},
): OauthOwnerScope {
  const requestedScope = String(options.scope || '').trim().toLowerCase()
  if (requestedScope === 'nexus') {
    if (!context.isNexusAdmin) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Nexus admin permission required for nexus scope.',
      })
    }
    return 'nexus'
  }

  if (requestedScope === 'team') {
    if (!context.isTeamAdmin) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Team admin permission required for team scope.',
      })
    }
    return 'team'
  }

  if (context.isNexusAdmin) {
    return 'nexus'
  }
  return 'team'
}
