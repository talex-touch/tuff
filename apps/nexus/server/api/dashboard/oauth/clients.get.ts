import { getQuery } from 'h3'
import { listOauthClients } from '../../../utils/oauthClientStore'
import { requireOauthManager, resolveOauthOwnerScope } from '../../../utils/oauthAccess'

export default defineEventHandler(async (event) => {
  const manager = await requireOauthManager(event)
  const query = getQuery(event)
  const scope = resolveOauthOwnerScope(manager, { scope: String(query.scope || '') })

  const applications = await listOauthClients(event, {
    ownerScope: scope,
    ownerUserId: scope === 'nexus' ? manager.userId : undefined,
    ownerTeamId: scope === 'team' ? manager.teamId || undefined : undefined,
  })

  return {
    scope,
    applications,
  }
})
