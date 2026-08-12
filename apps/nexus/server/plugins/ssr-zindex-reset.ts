import { resetZIndexForRequest } from '../utils/ssrZIndexReset'

export default defineNitroPlugin((nitroApp) => {
  // Must run before any component setup, so hook the request itself rather than
  // a render hook — TxDrawer allocates during setup via an immediate watcher.
  nitroApp.hooks.hook('request', () => {
    resetZIndexForRequest()
  })
})
