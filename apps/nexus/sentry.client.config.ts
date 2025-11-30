import * as Sentry from '@sentry/nuxt'

Sentry.init({
  // If set up, you can use the Nuxt runtime config here
  // dsn: useRuntimeConfig().public.sentry.dsn
  // modify depending on your custom runtime config
  dsn: 'https://6e718ca36ad94840c7b0539a57144a67@o4508024637620224.ingest.us.sentry.io/4508024640438272',
  // Adds request headers and IP for users, for more info visit:
  // https://docs.sentry.io/platforms/javascript/guides/nuxt/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
})
