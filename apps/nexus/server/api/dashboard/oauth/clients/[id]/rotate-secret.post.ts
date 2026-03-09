import { createError, getRouterParam, readBody } from 'h3'
import { rotateOauthClientSecret } from '../../../../../utils/oauthClientStore'
import { requireOauthManager, resolveOauthOwnerScope } from '../../../../../utils/oauthAccess'

interface RotateOauthClientSecretBody {
  scope?: 'team' | 'nexus'
}

export default defineEventHandler(async (event) => {
  const manager = await requireOauthManager(event)
  const body = await readBody<RotateOauthClientSecretBody>(event).catch(
    (): RotateOauthClientSecretBody => ({}),
  )
  const scope = resolveOauthOwnerScope(manager, { scope: body?.scope })
  const id = String(getRouterParam(event, 'id') || '').trim()

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'id is required.',
    })
  }

  const application = await rotateOauthClientSecret(event, {
    id,
    ownerScope: scope,
    ownerUserId: scope === 'nexus' ? manager.userId : undefined,
    ownerTeamId: scope === 'team' ? manager.teamId || undefined : undefined,
  })

  if (!application) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Oauth client not found.',
    })
  }

  return {
    application,
    message: 'Oauth client secret rotated. Save clientSecret now, it will not be shown again.',
  }
})
