import type { H3Event } from 'h3'
import { createError } from 'h3'

const LOCAL_CLOUDFLARE_DEV_CREDENTIAL_BINDINGS = [
  'ADMIN_CONTROL_PLANE_PEPPER',
  'ADMIN_EMERGENCY_JWT_SECRET',
  'APP_AUTH_JWT_SECRET',
  'AUTH_SECRET',
  'NOTIFICATION_SECURE_STORE_KEY',
  'NUXT_INTELLIGENCE_ENCRYPT_KEY',
  'PLUGIN_ATTESTATION_PRIVATE_KEY_PEM',
  'PROVIDER_REGISTRY_SECURE_STORE_KEY',
  'STORAGE_SECURE_STORE_KEY',
] as const satisfies readonly (keyof TuffCloudflareBindings)[]

let hasLoggedBindings = false

function isLocalCloudflareDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production'
    && process.env.NUXT_USE_CLOUDFLARE_DEV === 'true'
}

/**
 * Safely read Cloudflare bindings when running inside a Worker/Pages function.
 */
export function readCloudflareBindings(event: H3Event) {
  const bindings = event.context?.cloudflare?.env as TuffCloudflareBindings | undefined

  if (!hasLoggedBindings) {
    hasLoggedBindings = true
  }

  if (!bindings || !isLocalCloudflareDevelopment()) return bindings

  const localBindings = {
    ...bindings,
    NEXUS_LOCAL_PAGES_PREVIEW: 'true',
  }

  for (const name of LOCAL_CLOUDFLARE_DEV_CREDENTIAL_BINDINGS) {
    if (bindings[name] == null && process.env[name] != null)
      localBindings[name] = process.env[name]
  }

  return localBindings
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
