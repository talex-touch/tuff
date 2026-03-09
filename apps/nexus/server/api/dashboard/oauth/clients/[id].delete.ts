import { createError, getQuery, getRouterParam } from 'h3'
import { revokeOauthClient } from '../../../../utils/oauthClientStore'
import { requireOauthManager, resolveOauthOwnerScope } from '../../../../utils/oauthAccess'

export default defineEventHandler(async (event) => {
  const manager = await requireOauthManager(event)
  const query = getQuery(event)
  const scope = resolveOauthOwnerScope(manager, { scope: String(query.scope || '') })
  const id = String(getRouterParam(event, 'id') || '').trim()

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'id is required.',
    })
  }

  const revoked = await revokeOauthClient(event, {
    id,
    ownerScope: scope,
    ownerUserId: scope === 'nexus' ? manager.userId : undefined,
    ownerTeamId: scope === 'team' ? manager.teamId || undefined : undefined,
  })

  if (!revoked) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Oauth client not found.',
    })
  }

  return {
    success: true,
  }
})
