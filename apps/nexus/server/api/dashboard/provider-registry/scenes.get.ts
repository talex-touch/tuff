import type { ProviderRegistryOwnerScope } from '../../../utils/providerRegistryStore'
import type { SceneBindingStatus, SceneRegistryOwner } from '../../../utils/sceneRegistryStore'
import { getQuery } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { listSceneRegistryEntries, withSceneRegistryReadiness } from '../../../utils/sceneRegistryStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = getQuery(event)

  const sceneEntries = await listSceneRegistryEntries(event, {
    owner: typeof query.owner === 'string' ? query.owner as SceneRegistryOwner : undefined,
    ownerScope: typeof query.ownerScope === 'string' ? query.ownerScope as ProviderRegistryOwnerScope : undefined,
    status: typeof query.status === 'string' ? query.status as SceneBindingStatus : undefined,
  })
  const scenes = await Promise.all(sceneEntries.map(scene => withSceneRegistryReadiness(event, scene)))

  return { scenes }
})
