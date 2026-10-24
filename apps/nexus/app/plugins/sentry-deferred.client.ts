import { installErrorBuffer } from '~/utils/sentry-deferred'

/**
 * Passive visits keep the reporter out of the critical path. Interaction starts it immediately;
 * the timeout is only a fallback for sessions that never interact.
 */
const SENTRY_DEFERRED_INIT_TIMEOUT_MS = 30000

/**
 * Loads the Sentry client after the app has mounted instead of before it hydrates.
 *
 * `@sentry/nuxt` registers two plugins that run in the plugin phase: one `await import`s
 * `sentry.client.config.ts` and one attaches the Vue/error integrations. Both used to occupy
 * the critical path. This replacement buffers errors immediately, then starts on the first
 * meaningful interaction or a long passive-session fallback.
 *
 * Nothing is lost in the gap: the buffer is flushed into `captureException` once the SDK is up,
 * and the same `app:error` / `vue:error` hooks the module used are registered here.
 */
export default defineNuxtPlugin({
  name: 'nexus:sentry-deferred',
  setup(nuxtApp) {
    const config = useRuntimeConfig().public
    if (!config.sentryClientEnabled)
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

        initSentryClient(Sentry, {
          environment: config.sentryEnvironment,
          release: config.sentryRelease,
        })

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

    const disposers: Array<() => void> = []
    let started = false
    const start = () => {
      if (started)
        return
      started = true
      for (const dispose of disposers)
        dispose()
      disposers.length = 0
      void loadSentry()
    }
    for (const eventName of ['pointerdown', 'keydown', 'touchstart'] as const) {
      window.addEventListener(eventName, start, { passive: true, once: true })
      disposers.push(() => window.removeEventListener(eventName, start))
    }
    window.setTimeout(start, SENTRY_DEFERRED_INIT_TIMEOUT_MS)
  },
})
