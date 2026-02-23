import { requireWatermarkToken } from '../utils/watermarkGuard'
import { isWatermarkFeatureEnabled } from '../utils/runtime-features'

const GUARDED_PREFIXES = ['/api/dashboard']
const GUARDED_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

export default defineEventHandler((event) => {
  if (!isWatermarkFeatureEnabled(event))
    return

  const url = event.node.req.url || ''
  const method = (event.node.req.method || 'GET').toUpperCase()
  if (!GUARDED_METHODS.has(method))
    return
  if (!GUARDED_PREFIXES.some(prefix => url.startsWith(prefix)))
    return
  requireWatermarkToken(event)
})
