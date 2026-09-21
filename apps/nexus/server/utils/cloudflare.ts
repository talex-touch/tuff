import type { R2Bucket } from '@cloudflare/workers-types'
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
  'VOICE_PROVIDER_CATALOG_KEYS',
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

/**
 * A binding only counts as an object bucket when it exposes the R2 API.
 *
 * The guard is the point: Cloudflare Pages always injects `ASSETS` for the project's
 * static assets, and that binding is a Fetcher, not a bucket. Calling `.get()` on it
 * throws inside the Worker, which turns a miss into a 500 — so a candidate is probed
 * instead of trusted.
 */
function asObjectBucket(candidate: unknown): R2Bucket | null {
  const bucket = candidate as Partial<R2Bucket> | null | undefined

  if (bucket && typeof bucket.get === 'function' && typeof bucket.put === 'function')
    return bucket as R2Bucket

  return null
}

export interface ResolvedObjectBucket {
  bucket: R2Bucket
  bindingName: keyof TuffCloudflareBindings
}

/**
 * Resolve the object bucket for a request, in the order the deployment binds one.
 *
 * `preferred` carries deployment-specific names (`IMAGES`, `PLUGIN_PACKAGES`, …); `R2` is the
 * object store this project binds, and `ASSETS` is accepted last, only when it really is a
 * bucket.
 */
export function resolveObjectBucketBinding(
  event: H3Event | null | undefined,
  preferred: readonly (keyof TuffCloudflareBindings)[] = [],
): ResolvedObjectBucket | null {
  if (!event)
    return null

  const bindings = readCloudflareBindings(event)

  if (!bindings)
    return null

  for (const bindingName of [...preferred, 'R2', 'ASSETS'] as const) {
    const bucket = asObjectBucket(bindings[bindingName])

    if (bucket)
      return { bucket, bindingName }
  }

  return null
}

/** The object bucket for a request, when the deployment binds one. */
export function resolveObjectBucket(
  event: H3Event | null | undefined,
  preferred: readonly (keyof TuffCloudflareBindings)[] = [],
): R2Bucket | null {
  return resolveObjectBucketBinding(event, preferred)?.bucket ?? null
}
