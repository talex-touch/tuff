import type * as SentryNuxt from '@sentry/nuxt'

/**
 * The client SDK options, and the one place that calls `init`.
 *
 * `@sentry/nuxt` discovers this file by name and, on its own, would `await import` it inside a
 * plugin before the app mounts. This app removes that plugin (see `nuxt.config.ts`
 * `app:resolve`) and loads the SDK from `app/plugins/sentry-deferred.client.ts` after mount
 * instead, so the file exports an initialiser rather than initialising on import — importing it
 * must stay free of side effects.
 */
export const sentryClientOptions = {
  dsn: 'https://4f74dffb4ae41ed8df43f5ca8f605153@o4508024637620224.ingest.us.sentry.io/4510196494499840',
  // Adds request headers and IP for users, for more info visit:
  // https://docs.sentry.io/platforms/javascript/guides/nuxt/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
} satisfies Parameters<typeof SentryNuxt.init>[0]

export function initSentryClient(Sentry: Pick<typeof SentryNuxt, 'init' | 'getClient'>) {
  if (Sentry.getClient())
    return
  Sentry.init(sentryClientOptions)
}
