import type { H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readCloudflareBindings } from './cloudflare'
import { assertRuntimeCredential, isLocalDevelopmentRuntime, selectRuntimeCredential } from './runtimeCredentialPolicy'

export function assertPreviewRuntimeCredentials(event: H3Event): void {
  const bindings = readCloudflareBindings(event)
  if (isLocalDevelopmentRuntime(bindings?.NEXUS_LOCAL_PAGES_PREVIEW, bindings)) return

  const config = useRuntimeConfig(event)
  const credentials = [
    [
      'AUTH_SECRET',
      selectRuntimeCredential(bindings, bindings?.AUTH_SECRET, [config.auth?.secret, process.env.AUTH_SECRET]),
    ],
    [
      'APP_AUTH_JWT_SECRET',
      selectRuntimeCredential(bindings, bindings?.APP_AUTH_JWT_SECRET, [
        config.appAuthJwtSecret,
        process.env.APP_AUTH_JWT_SECRET,
      ]),
    ],
    [
      'ADMIN_EMERGENCY_JWT_SECRET',
      selectRuntimeCredential(bindings, bindings?.ADMIN_EMERGENCY_JWT_SECRET, [
        config.adminControl?.emergencyJwtSecret,
        process.env.ADMIN_EMERGENCY_JWT_SECRET,
      ]),
    ],
    [
      'ADMIN_CONTROL_PLANE_PEPPER',
      selectRuntimeCredential(bindings, bindings?.ADMIN_CONTROL_PLANE_PEPPER, [
        config.adminControl?.pepper,
        process.env.ADMIN_CONTROL_PLANE_PEPPER,
      ]),
    ],
  ] as const

  for (const [variableName, value] of credentials) {
    assertRuntimeCredential(variableName, value, {
      localDevelopment: false,
    })
  }
}
