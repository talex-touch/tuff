import { createError } from 'h3'
import { isRiskControlFeatureEnabled, isWatermarkFeatureEnabled } from '../utils/runtime-features'

const RISK_API_PREFIXES = [
  '/api/admin/emergency',
  '/api/admin/risk',
  '/api/admin/oob/risk',
]

function normalizePath(path: string): string {
  if (!path)
    return ''
  const [pathname] = path.split('?')
  return pathname || path
}

function isRiskApiPath(path: string): boolean {
  if (RISK_API_PREFIXES.some(prefix => path.startsWith(prefix)))
    return true
  if (path.startsWith('/api/admin/telemetry/ip-blocks'))
    return true
  if (path.startsWith('/api/dashboard/intelligence/ip-bans'))
    return true
  return false
}

function isWatermarkApiPath(path: string): boolean {
  if (path.startsWith('/api/watermark/'))
    return true
  if (/^\/api\/admin\/.*watermark(\/|$)/i.test(path))
    return true
  if (/^\/api\/dashboard\/.*watermark(\/|$)/i.test(path))
    return true
  return false
}

function featureDisabled() {
  return createError({
    statusCode: 404,
    statusMessage: 'Feature not found.',
  })
}

export default defineEventHandler((event) => {
  const path = normalizePath(event.path || event.node.req.url || '')
  if (!path.startsWith('/api/'))
    return

  if (!isRiskControlFeatureEnabled(event) && isRiskApiPath(path))
    throw featureDisabled()

  if (!isWatermarkFeatureEnabled(event) && isWatermarkApiPath(path))
    throw featureDisabled()
})
