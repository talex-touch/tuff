import { sentryCloudflareNitroPlugin } from '@sentry/nuxt/module/plugins'
import { sentryClientOptions } from '../../sentry.client.config'
import { withDetachedErrorHooks } from '../utils/detachedErrorHooks'

/**
 * Server-side Sentry for the Pages Worker.
 *
 * It used to be `sentry.server.config.ts`, which `@sentry/nuxt` only runs when Node preloads it
 * (`node --import`). A Cloudflare Worker cannot, so `Sentry.init` never ran on the server: no 500 or
 * D1 failure reached Sentry, while the module still wrapped every handler, middleware and storage
 * call for nothing. On a Cloudflare preset the SDK is set up by this plugin instead
 * (docs.sentry.io/platforms/javascript/guides/cloudflare/frameworks/nuxt).
 *
 * Errors only: no tracing option, so no spans are made per request, and no request data or IPs
 * (`sendDefaultPii`) go into server events.
 */
export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig()
  if (!config.public.sentryClientEnabled)
    return

  // Its error hook awaits a flush that waits for that hook too; see `withDetachedErrorHooks`.
  withDetachedErrorHooks(nitroApp, sentryCloudflareNitroPlugin({
    dsn: sentryClientOptions.dsn,
    environment: config.public.sentryEnvironment || undefined,
    release: config.public.sentryRelease || undefined,
    sendDefaultPii: false,
  }))
})
