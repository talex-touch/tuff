import { deferStaticStyles } from '../utils/landingResourceStyles'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', (response, context) => {
    if (typeof response.body !== 'string')
      return
    if (!response.body.includes('rel="stylesheet"'))
      return

    response.body = deferStaticStyles(response.body, context.event.path)
  })
})
