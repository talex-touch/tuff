import { createError } from 'h3'
import { isRiskControlFeatureEnabled } from '../utils/runtime-features'

const RISK_API_PREFIXES = [
  '/api/admin/emergency',
  '/api/admin/risk',
  '/api/admin/oob/risk',
  '/api/admin/telemetry/ip-blocks',
  '/api/dashboard/intelligence/ip-bans',
]

/**
 * Nitro matches routes against the percent-decoded path, but `event.path` keeps
 * the raw request target. A prefix test on the raw value therefore reads
 * `/api/admin/%72isk/mode.override` as an unrelated path and waves it through
 * while the router still dispatches it to the risk handler. Decode once — the
 * same number of times the router does — and fold away the `//`, `.` and `..`
 * segments so the gate sees the path the handler is actually chosen by.
 */
function normalizePath(path: string): string {
  if (!path)
    return ''

  const [rawPathname = ''] = path.split('?')
  let pathname = rawPathname
  try {
    pathname = decodeURIComponent(rawPathname)
  }
  catch {
    // A dangling escape never decodes into a routable path, so matching the raw
    // form keeps the gate closed instead of failing the request with a URIError.
  }

  const segments: string[] = []
  for (const segment of pathname.split('/')) {
    if (!segment || segment === '.')
      continue
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(segment)
  }

  return `/${segments.join('/')}`
}

function isRiskApiPath(path: string): boolean {
  return RISK_API_PREFIXES.some(prefix => path.startsWith(prefix))
}

export const FEATURE_DISABLED_ERROR_CODE = 'NEXUS_FEATURE_DISABLED'

/**
 * A disabled feature and a missing record both answer 404, so the only thing
 * telling them apart was the English wording of `statusMessage` — clients
 * lowercase it and substring-match (IntelligenceAdminPanel.isFeatureNotFoundError).
 * `data.code` gives them something stable to branch on; the message stays as it
 * was so the existing readers keep working.
 */
function featureDisabled() {
  return createError({
    statusCode: 404,
    statusMessage: 'Feature not found.',
    data: { code: FEATURE_DISABLED_ERROR_CODE },
  })
}

export default defineEventHandler((event) => {
  const path = normalizePath(event.path || event.node.req.url || '')
  if (!path.startsWith('/api/'))
    return

  if (!isRiskControlFeatureEnabled(event) && isRiskApiPath(path))
    throw featureDisabled()
})
