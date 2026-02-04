import { requireAdmin } from '../../../utils/auth'
import { listPlugins } from '../../../utils/pluginsStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)

  const plugins = await listPlugins(event, {
    includeVersions: true,
    viewerIsAdmin: true,
    statuses: ['pending'],
  })

  // Also find plugins with pending versions
  const allPlugins = await listPlugins(event, {
    includeVersions: true,
    viewerIsAdmin: true,
  })

  const pluginsWithPendingVersions = allPlugins.filter((plugin) => {
    if (plugin.status === 'pending')
      return false // Already in pending list
    return (plugin.versions ?? []).some(v => v.status === 'pending')
  })

  return {
    pendingPlugins: plugins,
    pluginsWithPendingVersions: pluginsWithPendingVersions.map(plugin => ({
      ...plugin,
      versions: (plugin.versions ?? []).filter(v => v.status === 'pending'),
    })),
  }
})
