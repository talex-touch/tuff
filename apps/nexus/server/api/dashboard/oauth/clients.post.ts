import { readBody } from 'h3'
import { createOauthClient } from '../../../utils/oauthClientStore'
import { requireOauthManager, resolveOauthOwnerScope } from '../../../utils/oauthAccess'

interface CreateOauthClientBody {
  scope?: 'team' | 'nexus'
  name?: string
  description?: string
  redirectUris?: string[]
}

export default defineEventHandler(async (event) => {
  const manager = await requireOauthManager(event)
  const body = await readBody<CreateOauthClientBody>(event)
  const scope = resolveOauthOwnerScope(manager, { scope: body?.scope })

  const name = String(body?.name || '').trim()
  const redirectUris = Array.isArray(body?.redirectUris)
    ? body.redirectUris.map(item => String(item || '').trim()).filter(Boolean)
    : []

  const application = await createOauthClient(event, {
    ownerScope: scope,
    ownerUserId: manager.userId,
    ownerTeamId: scope === 'team' ? manager.teamId : null,
    createdByRole: scope === 'team' ? 'team_admin' : 'nexus_admin',
    name,
    description: String(body?.description || '').trim() || null,
    redirectUris,
  })

  return {
    application,
    message: 'Oauth client created. Save clientSecret now, it will not be shown again.',
  }
})
