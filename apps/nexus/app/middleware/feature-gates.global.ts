import { isFeatureFlagEnabled } from '#shared/utils/feature-flags'

function isRiskRoute(path: string): boolean {
  if (!path)
    return false
  if (path.startsWith('/dashboard/admin/risk'))
    return true
  if (path.startsWith('/admin/emergency'))
    return true
  return false
}

export default defineNuxtRouteMiddleware((to) => {
  const runtimeConfig = useRuntimeConfig()
  const riskControlEnabled = isFeatureFlagEnabled(runtimeConfig.public?.riskControl?.enabled)

  if (!riskControlEnabled && isRiskRoute(to.path)) {
    if (to.path.startsWith('/dashboard/'))
      return navigateTo('/dashboard/overview')
    return navigateTo('/')
  }
})
