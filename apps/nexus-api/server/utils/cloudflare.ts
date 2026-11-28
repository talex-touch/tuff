import type { R2Bucket } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { createError } from 'h3'

const LOCAL_CLOUDFLARE_DEV_CREDENTIAL_BINDINGS = [
  'APP_AUTH_JWT_SECRET',
  'AUTH_SECRET',
  'EXCHANGE_RATE_API_KEY',
  'GITHUB_CLIENT_SECRET',
  'LINUXDO_CLIENT_SECRET',
  'PLUGIN_ATTESTATION_PRIVATE_KEY_PEM',
  'PROVIDER_REGISTRY_SECURE_STORE_KEY',
  'RESEND_API_KEY',
  'VOICE_PROVIDER_CATALOG_KEYS',
] as const satisfies readonly (keyof TuffCloudflareBindings)[]

function isLocalCloudflareDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production'
    && process.env.NUXT_USE_CLOUDFLARE_DEV === 'true'
}

export function readCloudflareBindings(event: H3Event): TuffCloudflareBindings | undefined {
  const bindings = event.context?.cloudflare?.env as TuffCloudflareBindings | undefined
  if (!bindings || !isLocalCloudflareDevelopment())
    return bindings

  const localBindings: TuffCloudflareBindings = {
    ...bindings,
    NEXUS_LOCAL_PAGES_PREVIEW: 'true',
  }

  for (const name of LOCAL_CLOUDFLARE_DEV_CREDENTIAL_BINDINGS) {
    if (bindings[name] == null && process.env[name] != null)
      localBindings[name] = process.env[name]
  }

  return localBindings
}

export function requireCloudflareBindings(event: H3Event): TuffCloudflareBindings {
  const bindings = readCloudflareBindings(event)
  if (!bindings) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Cloudflare bindings are not available in this runtime.',
    })
  }
  return bindings
}

export function shouldUseCloudflareBindings(): boolean {
  return process.env.NODE_ENV === 'production'
    || process.env.NUXT_USE_CLOUDFLARE_DEV === 'true'
    || process.env.NITRO_PRESET === 'cloudflare-module'
    || process.env.NITRO_PRESET === 'cloudflare-pages'
}

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

export function resolveObjectBucket(
  event: H3Event | null | undefined,
  preferred: readonly (keyof TuffCloudflareBindings)[] = [],
): R2Bucket | null {
  return resolveObjectBucketBinding(event, preferred)?.bucket ?? null
}
