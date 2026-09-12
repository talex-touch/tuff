import { installErrorBuffer, scheduleAfterIdle } from '~/utils/sentry-deferred'

/**
 * How long after mount the SDK may wait for an idle slot before it is loaded regardless.
 * Long enough for the demos above the fold to start, short enough that a crash in the
 * first seconds of a session still reaches Sentry with its context intact.
 */
const SENTRY_DEFERRED_INIT_TIMEOUT_MS = 2000

/**
 * Loads the Sentry client after the app has mounted instead of before it hydrates.
 *
 * `@sentry/nuxt` registers two plugins that run in the plugin phase: one `await import`s
 * `sentry.client.config.ts` (the SDK, ~47 KB, one network round trip) and one attaches the Vue
 * and error-hook integrations. Both had to finish before Nuxt would mount the app, so every page
 * paid that round trip between DOMContentLoaded and interactivity — 0.5 s at the latencies
 * measured from CN, on a page whose content was already on screen. `nuxt.config.ts` drops those
 * two plugins in `app:resolve`; this one takes their place with the same DSN and integrations
 * but runs the load on the first idle slot after mount.
 *
 * Nothing is lost in the gap: a tiny listener pair buffers `error` and `unhandledrejection`
 * events from the moment this plugin runs, and the buffer is flushed into `captureException`
 * once the SDK is up, and the same `app:error` / `vue:error` hooks the module used are
 * registered here.
 */
export default defineNuxtPlugin({
  name: 'nexus:sentry-deferred',
  setup(nuxtApp) {
    if (!useRuntimeConfig().public.sentryClientEnabled)
      return

    const buffer = installErrorBuffer(window)
    let loading: Promise<void> | null = null

    const loadSentry = async () => {
      if (loading)
        return loading

      loading = (async () => {
        const [Sentry, { initSentryClient }] = await Promise.all([
          import('@sentry/nuxt'),
          import('../../sentry.client.config'),
        ])

        initSentryClient(Sentry)

        // The module's plugin also attached @sentry/vue's integration with
        // `attachErrorHandler: false`. Under that option it only installs component-tracing
        // mixins, and tracing is compiled out of this build (`__SENTRY_TRACING__: false`), so
        // it contributed nothing here; the two Nuxt hooks below are what actually report.
        nuxtApp.hook('app:error', (error) => {
          const statusCode = (error as { statusCode?: number } | null)?.statusCode
          if (typeof statusCode === 'number' && statusCode >= 300 && statusCode < 500)
            return
          Sentry.captureException(error)
        })
        nuxtApp.hook('vue:error', (error, _instance, info) => {
          Sentry.captureException(error, { extra: { info } })
        })

        buffer.flush((error, hint) => {
          Sentry.captureException(error, { extra: { deferredKind: hint.kind } })
        })
      })().catch((error) => {
        // The page must never depend on the reporter. Keep the buffer alive so a later,
        // successful load (the next hook below) still gets what happened.
        loading = null
        console.warn('[sentry] deferred load failed', error)
      })

      return loading
    }

    nuxtApp.hook('app:mounted', () => {
      scheduleAfterIdle(() => { void loadSentry() }, SENTRY_DEFERRED_INIT_TIMEOUT_MS, window)
    })
  },
})
