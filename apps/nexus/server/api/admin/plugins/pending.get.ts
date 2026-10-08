import { requireAdmin } from '../../../utils/auth'
import { listPlugins } from '../../../utils/pluginsStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)

  // One read of every plugin: the pending ones are among them. It was a read for each list.
  const allPlugins = await listPlugins(event, {
    includeVersions: true,
    viewerIsAdmin: true,
  })
  const plugins = allPlugins.filter(plugin => plugin.status === 'pending')

  // Also find plugins with pending versions

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
