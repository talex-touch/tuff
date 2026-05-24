import { getQuery, setHeader } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { formatPlatformGovernanceReportMarkdown, getPlatformGovernanceReportSnapshot } from '../../../utils/platformGovernanceStore'

function readPositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'string')
    return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = getQuery(event)
  const snapshot = await getPlatformGovernanceReportSnapshot(event, {
    days: readPositiveInt(query.days, 30),
    limit: readPositiveInt(query.limit, 5000),
    topLimit: readPositiveInt(query.topLimit, 12),
  })

  if (query.format === 'markdown') {
    const fileDate = new Date().toISOString().slice(0, 10)
    setHeader(event, 'Content-Type', 'text/markdown; charset=utf-8')
    setHeader(event, 'Content-Disposition', `attachment; filename="nexus-governance-report-${fileDate}.md"`)
    return formatPlatformGovernanceReportMarkdown(snapshot)
  }

  return snapshot
})
