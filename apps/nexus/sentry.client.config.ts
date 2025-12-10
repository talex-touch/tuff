import * as Sentry from '@sentry/nuxt'

Sentry.init({
  // If set up, you can use the Nuxt runtime config here
  // dsn: useRuntimeConfig().public.sentry.dsn
  // modify depending on your custom runtime config
  dsn: 'https://4f74dffb4ae41ed8df43f5ca8f605153@o4508024637620224.ingest.us.sentry.io/4510196494499840',
  // Adds request headers and IP for users, for more info visit:
  // https://docs.sentry.io/platforms/javascript/guides/nuxt/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
})
