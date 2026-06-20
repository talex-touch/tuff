import { dedupeDevTuffexStylesheets } from '../utils/devStylesheetDedupe'

export default defineNitroPlugin((nitroApp) => {
  if (process.env.NODE_ENV === 'production')
    return

  nitroApp.hooks.hook('render:response', (response) => {
    if (typeof response.body !== 'string')
      return
    if (!response.body.includes('/packages/tuffex/packages/components/'))
      return

    response.body = dedupeDevTuffexStylesheets(response.body)
  })
})
