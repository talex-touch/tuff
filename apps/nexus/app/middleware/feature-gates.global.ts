import { isFeatureFlagEnabled } from '#shared/utils/feature-flags'

function isRiskRoute(path: string): boolean {
  if (!path)
    return false
  if (path.startsWith('/admin/risk'))
    return true
  if (path.startsWith('/admin/emergency'))
    return true
  return false
}

export default defineNuxtRouteMiddleware((to) => {
  const runtimeConfig = useRuntimeConfig()
  const riskControlEnabled = isFeatureFlagEnabled(runtimeConfig.public?.riskControl?.enabled)

  if (!riskControlEnabled && isRiskRoute(to.path)) {
    // The risk console is a panel of the administrator console, so it falls
    // back to that console's first section. `/admin/emergency` is a standalone
    // recovery page with no shell and no session, so it falls back to the root.
    return navigateTo(to.path.startsWith('/admin/emergency') ? '/' : '/admin/updates')
  }
})
