import { getRequestURL } from 'h3'
import { listPlugins } from '../../utils/pluginsStore'

export default defineEventHandler(async (event) => {
  const requestUrl = getRequestURL(event)
  const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`

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
        readmeUrl: plugin.readmeMarkdown ? `${baseUrl}/api/market/plugins/${plugin.slug}/readme` : null,
      }
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value))

  return {
    plugins: enriched,
    total: enriched.length,
  }
})
