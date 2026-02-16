import type { DocEngagementSourceType } from '../../../utils/docAnalyticsStore'
import { requireAdmin } from '../../../utils/auth'
import { readCloudflareBindings } from '../../../utils/cloudflare'
import { ensureDocAnalyticsSchema, getDocAnalyticsDashboard, normalizeDocPath } from '../../../utils/docAnalyticsStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  // TODO-SEC-3: 后续与管理员控制面保护策略合并（break-glass/双人复核等）。

  const query = getQuery(event)
  const days = Math.min(Math.max(Number(query.days) || 30, 1), 365)
  const path = typeof query.path === 'string' && query.path.trim()
    ? normalizeDocPath(query.path)
    : undefined

  let sourceType: DocEngagementSourceType | undefined
  if (query.source === 'docs_page' || query.source === 'doc_comments_admin')
    sourceType = query.source

  const bindings = readCloudflareBindings(event)
  if (!bindings?.DB) {
    return {
      overview: {
        docCount: 0,
        totalViews: 0,
        totalSessionCount: 0,
        totalActiveMs: 0,
        totalTotalMs: 0,
        totalCopyCount: 0,
        totalSelectCount: 0,
      },
      docs: [],
      detail: null,
      source: 'memory',
    }
  }

  await ensureDocAnalyticsSchema(bindings.DB)

  const result = await getDocAnalyticsDashboard(bindings.DB, {
    days,
    path,
    sourceType,
    limit: 40,
  })

  return {
    ...result,
    source: 'd1',
  }
})
