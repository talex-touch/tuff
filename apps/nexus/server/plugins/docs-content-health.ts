import process from 'node:process'
import { queryCollection } from '@nuxt/content/server'
import { docsContentAvailability } from '../utils/docsContentCache'

/**
 * Probes the docs collection once, on the first request that reaches the dev
 * server. A broken content database is otherwise invisible until someone
 * notices a blank docs sidebar, because every endpoint degrades quietly by
 * design — this turns hours of guessing into one startup log line.
 */
export default defineNitroPlugin((nitroApp) => {
  if (process.env.NODE_ENV === 'production')
    return

  const unhook = nitroApp.hooks.hook('request', async (event) => {
    // Unregister first so concurrent requests cannot start a second probe.
    unhook()

    try {
      await queryCollection(event, 'docs').first()
    }
    catch (error) {
      docsContentAvailability.markUnavailable()
      console.error(
        '\n[docs-content] The Nuxt Content docs collection is unreachable — docs pages, search, and the sidebar will all be empty.'
        + '\n[docs-content] Most often the better-sqlite3 native binding is missing. Try: pnpm rebuild -r better-sqlite3\n',
        error,
      )
    }
  })
})
