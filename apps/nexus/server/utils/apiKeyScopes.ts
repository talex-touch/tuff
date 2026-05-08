export const API_KEY_SCOPES = [
  'plugin:publish',
  'plugin:read',
  'account:read',
  'release:write',
  'release:publish',
  'release:assets',
  'release:news',
  'release:evidence',
] as const

export type ApiKeyScope = typeof API_KEY_SCOPES[number]

export function isApiKeyScope(scope: unknown): scope is ApiKeyScope {
  return typeof scope === 'string' && API_KEY_SCOPES.includes(scope as ApiKeyScope)
}

export function hasRequiredScope(scopes: string[], requiredScope: string): boolean {
  return scopes.includes(requiredScope)
}
