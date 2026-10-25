import { stripLandingImagePrefetches, stripStaticModulepreloads } from '../utils/landingResourceHints'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', (response, context) => {
    if (typeof response.body !== 'string')
      return
    const hasImagePrefetch = response.body.includes('rel="prefetch"') && response.body.includes('as="image"')
    const hasModulepreload = response.body.includes('rel="modulepreload"')
    if (!hasImagePrefetch && !hasModulepreload)
      return

    response.body = stripLandingImagePrefetches(response.body, context.event.path)
    response.body = stripStaticModulepreloads(response.body, context.event.path)
  })
})
