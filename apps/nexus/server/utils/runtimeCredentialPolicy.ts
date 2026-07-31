import { createError } from 'h3'

const MINIMUM_RUNTIME_CREDENTIAL_LENGTH = 16

const LOCAL_ONLY_CREDENTIAL_VALUES = new Set([
  'tuff-dev-secret',
  'tuff-local-pages-preview-secret',
  'tuff-local-app-auth-jwt-secret',
  'tuff-local-intelligence-encrypt-key',
  'tuff-intelligence-dev-encrypt-key',
  'tuff-intelligence-default-key-change-me',
])

const DOCUMENTED_PLACEHOLDER_PATTERNS = [
  /^change[-_ ]?me(?:[-_ ].*)?$/i,
  /^your(?:[-_ ].*)?$/i,
  /^replace[-_ ]?with(?:[-_ ].*)?$/i,
  /^placeholder(?:[-_ ].*)?$/i,
  /^<[^>]+>$/,
]

export const RUNTIME_CREDENTIAL_ERROR_CODE = 'NEXUS_RUNTIME_CREDENTIAL_INVALID'

export interface RuntimeCredentialOptions {
  localDevelopment: boolean
  minimumLength?: number
}

function invalidCredential(variableName: string, reason: string): never {
  const error = createError({
    statusCode: 500,
    statusMessage: `${variableName} rejected by ${RUNTIME_CREDENTIAL_ERROR_CODE}.`,
  }) as ReturnType<typeof createError> & {
    code: string
    reason: string
    variableName: string
  }
  error.code = RUNTIME_CREDENTIAL_ERROR_CODE
  error.reason = reason
  error.variableName = variableName
  throw error
}

export function isLocalDevelopmentRuntime(localPreviewMarker?: unknown, platformBindings?: object): boolean {
  if (localPreviewMarker === true || localPreviewMarker === 'true') return true

  if (platformBindings) return false

  return process.env.NODE_ENV !== 'production' && process.env.NITRO_PRESET !== 'cloudflare-pages'
}

export function selectRuntimeCredential(
  platformBindings: object | undefined,
  platformValue: unknown,
  fallbackValues: readonly unknown[],
): unknown {
  if (platformBindings) return platformValue

  return fallbackValues.find(value => value !== undefined && value !== null)
}

export function assertRuntimeCredential(
  variableName: string,
  value: unknown,
  options: RuntimeCredentialOptions,
): string {
  if (typeof value !== 'string' || value.trim() === '') return invalidCredential(variableName, 'missing')

  const normalized = value.trim()
  if (options.localDevelopment && LOCAL_ONLY_CREDENTIAL_VALUES.has(normalized)) return normalized

  const minimumLength = options.minimumLength ?? MINIMUM_RUNTIME_CREDENTIAL_LENGTH
  if (normalized.length < minimumLength) return invalidCredential(variableName, 'too-short')

  if (options.localDevelopment) return normalized

  if (LOCAL_ONLY_CREDENTIAL_VALUES.has(normalized)) return invalidCredential(variableName, 'local-only-default')

  if (DOCUMENTED_PLACEHOLDER_PATTERNS.some(pattern => pattern.test(normalized)))
    return invalidCredential(variableName, 'documented-placeholder')

  return normalized
}
