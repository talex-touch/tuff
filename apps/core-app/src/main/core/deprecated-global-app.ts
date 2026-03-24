import type { TalexTouch } from '@talex-touch/utils'
import { mainLog } from '../utils/logger'

let globalAppWarningShown = false

function warnGlobalAppAccess(site: string): void {
  if (globalAppWarningShown) {
    return
  }
  globalAppWarningShown = true
  mainLog.warn('Deprecated global app access detected; migrate to lifecycle runtime context.', {
    meta: { site }
  })
}

export function getDeprecatedGlobalApp(site: string): TalexTouch.TouchApp | undefined {
  const app = (globalThis as { $app?: TalexTouch.TouchApp }).$app
  if (app) {
    warnGlobalAppAccess(site)
  }
  return app
}

export function resolveRuntimeChannel(
  runtimeChannel: unknown,
  appChannel: unknown,
  site: string
): unknown {
  if (runtimeChannel) {
    return runtimeChannel
  }
  if (appChannel) {
    return appChannel
  }
  return (getDeprecatedGlobalApp(site) as { channel?: unknown } | undefined)?.channel
}
