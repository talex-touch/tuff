import type { H3Event } from 'h3'
import { createError } from 'h3'

let hasLoggedBindings = false

/**
 * Safely read Cloudflare bindings when running inside a Worker/Pages function.
 */
export function readCloudflareBindings(event: H3Event) {
  const bindings = event.context.cloudflare?.env as TuffCloudflareBindings | undefined

  if (!hasLoggedBindings) {
    hasLoggedBindings = true
  }

  return bindings
}

/**
 * Require Cloudflare bindings when they are mandatory for the handler.
 * Throws a 500 in non-Cloudflare environments so it fails fast during preview.
 */
export function requireCloudflareBindings(event: H3Event) {
  const bindings = readCloudflareBindings(event)

  if (!bindings) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Cloudflare bindings are not available in this runtime.',
    })
  }

  return bindings
}

export function shouldUseCloudflareBindings() {
  return process.env.NODE_ENV === 'production'
    || process.env.NUXT_USE_CLOUDFLARE_DEV === 'true'
    || process.env.NITRO_PRESET === 'cloudflare-pages'
}
