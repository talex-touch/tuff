import type * as SentryTypes from '@sentry/nuxt'
import { ERROR_BUFFER_LIMIT, installErrorBuffer, scheduleAfterIdle } from '~/utils/sentry-deferred'

/**
 * The SDK starts once the page has mounted and gone idle. The timeout is the upper bound for a
 * page that never goes idle; errors caught until then sit in the buffer, so the wait loses nothing.
 */
const SENTRY_DEFERRED_IDLE_TIMEOUT_MS = 6000

/**
 * Loads the Sentry client after the app has mounted instead of before it hydrates.
 *
 * `@sentry/nuxt` registers two plugins that run in the plugin phase: one `await import`s
 * `sentry.client.config.ts` and one attaches the Vue/error integrations. Both used to occupy
 * the critical path. This replacement buffers errors immediately, then starts once the page is
 * idle after mount. It does not wait for an interaction: the first click or keypress is when the
 * SDK's parse and evaluation would land on the input the reader is waiting for.
 *
 * Nothing is lost in the gap: window errors wait in the buffer, Nuxt and Vue errors wait in a
 * queue, and both are flushed into `captureException` once the SDK is up. The `app:error` and
 * `vue:error` hooks the module used are registered at setup, not after the SDK loads.
 */
export default defineNuxtPlugin({
  name: 'nexus:sentry-deferred',
  setup(nuxtApp) {
    const config = useRuntimeConfig().public
    if (!config.sentryClientEnabled)
      return

    const buffer = installErrorBuffer(window)
    let loading: Promise<void> | null = null

    // Nuxt and Vue report through hooks rather than window events, so the buffer cannot hold them.
    // Their hooks are registered now and queue what they catch until the SDK is up.
    let sentry: typeof SentryTypes | null = null
    const pendingReports: Array<(Sentry: typeof SentryTypes) => void> = []
    let droppedReports = 0
    const report = (run: (Sentry: typeof SentryTypes) => void) => {
      if (sentry) {
        run(sentry)
        return
      }
      if (pendingReports.length >= ERROR_BUFFER_LIMIT) {
        droppedReports += 1
        return
      }
      pendingReports.push(run)
    }

    nuxtApp.hook('app:error', (error) => {
      const statusCode = (error as { statusCode?: number } | null)?.statusCode
      if (typeof statusCode === 'number' && statusCode >= 300 && statusCode < 500)
        return
      report((Sentry) => Sentry.captureException(error))
    })
    nuxtApp.hook('vue:error', (error, _instance, info) => {
      report((Sentry) => Sentry.captureException(error, { extra: { info } }))
    })

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
        // it contributed nothing here; the two Nuxt hooks registered in setup are what actually report.
        sentry = Sentry
        for (const run of pendingReports.splice(0))
          run(Sentry)
        if (droppedReports > 0) {
          Sentry.captureException(new Error(`${droppedReports} earlier Nuxt or Vue error(s) were dropped before Sentry loaded`))
          droppedReports = 0
        }

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

    let started = false
    const start = () => {
      if (started)
        return
      started = true
      void loadSentry()
    }
    nuxtApp.hook('app:mounted', () => {
      scheduleAfterIdle(start, SENTRY_DEFERRED_IDLE_TIMEOUT_MS, window)
    })
  },
})
