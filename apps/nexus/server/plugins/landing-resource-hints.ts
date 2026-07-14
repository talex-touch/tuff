import { stripLandingImagePrefetches } from '../utils/landingResourceHints'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', (response, context) => {
    if (typeof response.body !== 'string')
      return
    if (!response.body.includes('rel="prefetch"') || !response.body.includes('as="image"'))
      return

    response.body = stripLandingImagePrefetches(response.body, context.event.path)
  })
})
