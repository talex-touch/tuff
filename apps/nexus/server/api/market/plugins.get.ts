import { listPlugins } from '../../utils/pluginsStore'

export default defineEventHandler(async (event) => {
  // Market 页面显示所有插件，依据可见规则过滤版本
  const plugins = await listPlugins(event, {
    includeVersions: true,
    forMarket: true,
  })

  const enriched = plugins
    .map((plugin) => {
      const versions = plugin.versions ?? []
      const latest = versions.find(version => version.id === plugin.latestVersionId) ?? versions[0]

      if (!latest)
        return null

      return {
        ...plugin,
        latestVersion: latest,
      }
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value))

  return {
    plugins: enriched,
    total: enriched.length,
  }
})
