import { dedupeDevTuffexStylesheets } from '../utils/devStylesheetDedupe'

export default defineNitroPlugin((nitroApp) => {
  if (process.env.NODE_ENV === 'production')
    return

  nitroApp.hooks.hook('render:response', (response, context) => {
    if (typeof response.body !== 'string')
      return
    if (!response.body.includes('<link') || !response.body.includes('rel="stylesheet"'))
      return

    response.body = dedupeDevTuffexStylesheets(response.body, context.event.path)
  })
})
