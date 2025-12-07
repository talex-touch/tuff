import { listPlugins } from '../../utils/pluginsStore'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const keyword = (query.q as string || '').toLowerCase().trim()
  const category = query.category as string | undefined
  const limit = Math.min(Number(query.limit) || 50, 100)
  const offset = Number(query.offset) || 0

  const plugins = await listPlugins(event, {
    includeVersions: true,
    forMarket: true,
  })

  let filtered = plugins
    .map((plugin) => {
      const versions = plugin.versions ?? []
      const latest = versions.find(v => v.id === plugin.latestVersionId) ?? versions[0]
      if (!latest) return null

      return {
        ...plugin,
        latestVersion: latest,
      }
    })
    .filter((v): v is NonNullable<typeof v> => Boolean(v))

  if (keyword) {
    filtered = filtered.filter(plugin =>
      plugin.name.toLowerCase().includes(keyword)
      || plugin.slug.toLowerCase().includes(keyword)
      || plugin.summary.toLowerCase().includes(keyword)
      || plugin.author?.name?.toLowerCase().includes(keyword),
    )
  }

  if (category) {
    filtered = filtered.filter(plugin => plugin.category === category)
  }

  const total = filtered.length
  const paginated = filtered.slice(offset, offset + limit)

  return {
    plugins: paginated,
    total,
    limit,
    offset,
  }
})
