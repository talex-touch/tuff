import type { H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readCloudflareBindings } from './cloudflare'
import { assertRuntimeCredential, isLocalDevelopmentRuntime, selectRuntimeCredential } from './runtimeCredentialPolicy'

export function resolveSessionAuthSecret(event: H3Event) {
  const config = useRuntimeConfig(event)
  const bindings = readCloudflareBindings(event)
  const secret = selectRuntimeCredential(bindings, bindings?.AUTH_SECRET, [
    config.auth?.secret,
    process.env.AUTH_SECRET,
  ])

  return assertRuntimeCredential('AUTH_SECRET', secret, {
    localDevelopment: isLocalDevelopmentRuntime(bindings?.NEXUS_LOCAL_PAGES_PREVIEW, bindings),
  })
}
