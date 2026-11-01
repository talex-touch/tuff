import { hasDocument, hasNavigator, hasWindow } from '../../../../../utils/env'

/**
 * Whether `backdrop-filter: url(#filter)` actually bends the backdrop. Only Chromium does: Safari and
 * Firefox parse the value and then paint nothing, so the property check alone says yes where it should say no.
 */
export function supportsLensRefraction(): boolean {
  if (!hasWindow() || !hasNavigator() || !hasDocument())
    return false

  const agent = navigator.userAgent
  const webkit = /Safari/.test(agent) && !/Chrom(?:e|ium)/.test(agent)
  if (webkit || /Firefox/.test(agent))
    return false

  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function')
    return false
  const probe = 'url(#tx-glass-lens-probe)'
  return CSS.supports('backdrop-filter', probe) || CSS.supports('-webkit-backdrop-filter', probe)
}
