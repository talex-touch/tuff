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
  const riskControlEnabled = runtimeConfig.public?.riskControl?.enabled === true

  if (!riskControlEnabled && isRiskRoute(to.path)) {
    if (to.path.startsWith('/dashboard/'))
      return navigateTo('/dashboard/overview')
    return navigateTo('/')
  }
})
