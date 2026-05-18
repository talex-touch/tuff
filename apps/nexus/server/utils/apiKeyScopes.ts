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

export const DEFAULT_PLUGIN_API_KEY_SCOPES: ApiKeyScope[] = [
  'plugin:read',
  'plugin:publish',
]

const SCOPE_IMPLICATIONS: Partial<Record<ApiKeyScope, ApiKeyScope[]>> = {
  'plugin:publish': ['plugin:read'],
}

export function isApiKeyScope(scope: unknown): scope is ApiKeyScope {
  return typeof scope === 'string' && API_KEY_SCOPES.includes(scope as ApiKeyScope)
}

export function hasRequiredScope(scopes: string[], requiredScope: string): boolean {
  if (scopes.includes(requiredScope))
    return true

  return scopes.some((scope) => {
    if (!isApiKeyScope(scope))
      return false
    return SCOPE_IMPLICATIONS[scope]?.includes(requiredScope as ApiKeyScope) ?? false
  })
}
