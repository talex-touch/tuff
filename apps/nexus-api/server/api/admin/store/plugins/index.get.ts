import { defineEventHandler, getQuery } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import { listPlugins } from '../../../../utils/pluginsStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = getQuery(event)
  const status = typeof query.status === 'string' ? query.status.trim().toLowerCase() : ''
  const search = typeof query.q === 'string' ? query.q.trim().toLowerCase() : ''
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20))

  const all = await listPlugins(event, {
    includeVersions: true,
    viewerIsAdmin: true,
  })

  const filtered = all.filter((plugin) => {
    if (status && status !== 'all' && plugin.status !== status)
      return false
    if (search) {
      const hay = `${plugin.name} ${plugin.slug} ${plugin.summary ?? ''}`.toLowerCase()
      if (!hay.includes(search))
        return false
    }
    return true
  })

  const total = filtered.length
  const start = (page - 1) * limit
  const plugins = filtered.slice(start, start + limit)

  return {
    plugins,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
})
