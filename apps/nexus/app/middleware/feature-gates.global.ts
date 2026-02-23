function isWatermarkRoute(path: string): boolean {
  if (!path)
    return false
  if (path.startsWith('/admin/watermark'))
    return true
  if (path.startsWith('/dashboard/watermark'))
    return true
  if (path.startsWith('/dashboard/admin/watermark'))
    return true
  return false
}

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
  const watermarkEnabled = runtimeConfig.public?.watermark?.enabled === true
  const riskControlEnabled = runtimeConfig.public?.riskControl?.enabled === true

  if (!riskControlEnabled && isRiskRoute(to.path)) {
    if (to.path.startsWith('/dashboard/'))
      return navigateTo('/dashboard/overview')
    return navigateTo('/')
  }

  if (!watermarkEnabled && isWatermarkRoute(to.path)) {
    if (to.path.startsWith('/dashboard/'))
      return navigateTo('/dashboard/overview')
    return navigateTo('/')
  }
})
