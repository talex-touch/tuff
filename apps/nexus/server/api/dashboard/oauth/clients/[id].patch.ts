import { createError, getRouterParam, readBody } from 'h3'
import { updateOauthClient } from '../../../../utils/oauthClientStore'
import { requireOauthManager, resolveOauthOwnerScope } from '../../../../utils/oauthAccess'

interface UpdateOauthClientBody {
  scope?: 'team' | 'nexus'
  name?: string
  description?: string
  redirectUris?: string[]
}

export default defineEventHandler(async (event) => {
  const manager = await requireOauthManager(event)
  const body = await readBody<UpdateOauthClientBody>(event)
  const scope = resolveOauthOwnerScope(manager, { scope: body?.scope })
  const id = String(getRouterParam(event, 'id') || '').trim()

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'id is required.',
    })
  }

  const name = String(body?.name || '').trim()
  const redirectUris = Array.isArray(body?.redirectUris)
    ? body.redirectUris.map(item => String(item || '').trim()).filter(Boolean)
    : []

  const application = await updateOauthClient(event, {
    id,
    ownerScope: scope,
    ownerUserId: scope === 'nexus' ? manager.userId : undefined,
    ownerTeamId: scope === 'team' ? manager.teamId || undefined : undefined,
    name,
    description: String(body?.description || '').trim() || null,
    redirectUris,
  })

  if (!application) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Oauth client not found.',
    })
  }

  return {
    application,
  }
})
