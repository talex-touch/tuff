import { defineEventHandler, getQuery } from 'h3'
import { PRODUCT_SCENE_TEMPLATES } from '#shared/provider-registry'
import { requireAdmin } from '../../../../utils/auth'
import { type ProviderRegistryOwnerScope } from '../../../../utils/providerRegistryStore'
import {
  listSceneRegistryEntries,
  type SceneBindingStatus,
  type SceneRegistryOwner,
  withSceneRegistryReadiness,
} from '../../../../utils/sceneRegistryStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = getQuery(event)
  const owner = typeof query.owner === 'string' && query.owner.trim()
    ? query.owner.trim() as SceneRegistryOwner
    : undefined
  const ownerScope = typeof query.ownerScope === 'string' && query.ownerScope.trim()
    ? query.ownerScope.trim() as ProviderRegistryOwnerScope
    : undefined
  const status = typeof query.status === 'string' && query.status.trim()
    ? query.status.trim() as SceneBindingStatus
    : undefined

  const entries = await listSceneRegistryEntries(event, { owner, ownerScope, status })
  const scenes = await Promise.all(entries.map(scene => withSceneRegistryReadiness(event, scene)))

  return {
    scenes,
    templates: PRODUCT_SCENE_TEMPLATES,
  }
})
