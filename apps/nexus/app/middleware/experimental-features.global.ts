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

export default defineNuxtRouteMiddleware((to) => {
  const runtimeConfig = useRuntimeConfig()
  const riskControlEnabled = runtimeConfig.public.experimentalFeatures?.riskControlEnabled === true
  const watermarkEnabled = runtimeConfig.public.experimentalFeatures?.watermarkEnabled === true

  if (!riskControlEnabled) {
    if (to.path.startsWith('/dashboard/admin/risk'))
      return navigateTo('/dashboard/overview')
    if (to.path.startsWith('/admin/emergency'))
      return navigateTo('/')
  }

  if (!watermarkEnabled && isWatermarkRoute(to.path)) {
    if (to.path.startsWith('/dashboard/'))
      return navigateTo('/dashboard/overview')
    return navigateTo('/')
  }
})
