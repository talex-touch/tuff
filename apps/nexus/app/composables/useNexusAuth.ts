import { computed, readonly } from 'vue'

type NexusAuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface NexusAuthSession {
  expires?: string
  user?: {
    email?: string | null
    image?: string | null
    name?: string | null
    [key: string]: unknown
  } | null
  [key: string]: unknown
}

interface NexusSignInOptions extends Record<string, unknown> {
  callbackUrl?: string
  redirect?: boolean
}

interface NexusSignInResult {
  error: string | null
  ok: boolean
  status: number
  url: string | null
}

interface NexusSignOutOptions {
  callbackUrl?: string
  redirect?: boolean
}

interface NexusAuthFetchOptions {
  body?: BodyInit | Record<string, unknown>
  headers?: Record<string, string>
  method?: string
  query?: Record<string, unknown>
}

const AUTH_BASE_URL = '/api/auth'

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.keys(value).length > 0
}

function resolveCurrentCallbackUrl() {
  if (import.meta.client)
    return `${window.location.pathname}${window.location.search}${window.location.hash}`

  const event = useRequestEvent()
  return event?.path || '/'
}

function resolveNavigationTarget(value: string | null | undefined, fallback: string) {
  const target = value || fallback
  if (!import.meta.client)
    return target

  try {
    const url = new URL(target, window.location.origin)
    if (url.origin === window.location.origin)
      return `${url.pathname}${url.search}${url.hash}`
  }
  catch {}

  return target
}

function readAuthError(value: string | null | undefined) {
  if (!value)
    return null

  try {
    const base = import.meta.client ? window.location.origin : 'http://localhost'
    return new URL(value, base).searchParams.get('error')
  }
  catch {
    return null
  }
}

function buildFormBody(values: Record<string, unknown>) {
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null)
      continue
    body.set(key, String(value))
  }
  return body
}

const authFetch = $fetch as unknown as <T>(request: string, options?: NexusAuthFetchOptions & { credentials?: 'include' }) => Promise<T>

async function fetchAuth<T>(path: string, options: NexusAuthFetchOptions = {}) {
  const headers: Record<string, string> = {
    ...options.headers,
  }

  if (import.meta.server) {
    const requestHeaders = useRequestHeaders(['cookie'])
    if (requestHeaders.cookie)
      headers.cookie = requestHeaders.cookie
  }

  return await authFetch<T>(`${AUTH_BASE_URL}${path}`, {
    credentials: 'include',
    ...options,
    headers,
  })
}

export function useNexusAuth() {
  const data = useState<NexusAuthSession | null | undefined>('auth:data', () => undefined)
  const loading = useState<boolean>('auth:loading', () => false)
  const lastRefreshedAt = useState<Date | undefined>('auth:lastRefreshedAt', () => undefined)

  const status = computed<NexusAuthStatus>(() => {
    if (loading.value)
      return 'loading'
    return data.value ? 'authenticated' : 'unauthenticated'
  })

  async function getSession() {
    loading.value = true
    lastRefreshedAt.value = new Date()

    try {
      const session = await fetchAuth<NexusAuthSession | Record<string, never>>('/session', {
        query: {
          callbackUrl: resolveCurrentCallbackUrl(),
        },
      })
      data.value = isNonEmptyObject(session) ? session : null
      return data.value
    }
    catch {
      data.value = null
      return null
    }
    finally {
      loading.value = false
    }
  }

  async function getCsrfToken() {
    const response = await fetchAuth<{ csrfToken?: string }>('/csrf')
    return response.csrfToken || ''
  }

  async function getProviders() {
    return await fetchAuth<Record<string, unknown> | null>('/providers')
  }

  async function signIn(provider: string, options: NexusSignInOptions & { redirect: false }, authorizationParams?: Record<string, unknown>): Promise<NexusSignInResult>
  async function signIn(provider?: string, options?: NexusSignInOptions, authorizationParams?: Record<string, unknown>): Promise<void>
  async function signIn(provider?: string, options: NexusSignInOptions = {}, authorizationParams?: Record<string, unknown>) {
    const callbackUrl = options.callbackUrl || resolveCurrentCallbackUrl()
    const redirect = options.redirect !== false

    if (!provider) {
      const target = `${AUTH_BASE_URL}/signin?${new URLSearchParams({ callbackUrl }).toString()}`
      return await navigateTo(target)
    }

    const csrfToken = await getCsrfToken()
    const action = provider === 'credentials' ? 'callback' : 'signin'
    const response = await fetchAuth<{ url?: string }>(`/${action}/${provider}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: buildFormBody({
        ...options,
        callbackUrl,
        csrfToken,
        json: true,
      }),
      query: authorizationParams,
    }).catch((error: any) => error?.data || {})

    const targetUrl = typeof response?.url === 'string' ? response.url : callbackUrl
    if (redirect) {
      const target = resolveNavigationTarget(targetUrl, callbackUrl)
      return await navigateTo(target, { external: /^https?:\/\//.test(target) })
    }

    const error = readAuthError(targetUrl)
    await getSession()
    return {
      error,
      ok: !error,
      status: 200,
      url: error ? null : targetUrl,
    } satisfies NexusSignInResult
  }

  async function signOut(options: NexusSignOutOptions = {}) {
    const callbackUrl = options.callbackUrl || resolveCurrentCallbackUrl()
    const redirect = options.redirect !== false
    const csrfToken = await getCsrfToken()
    const response = await fetchAuth<{ url?: string }>('/signout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: buildFormBody({
        callbackUrl,
        csrfToken,
        json: true,
      }),
    }).catch((error: any) => error?.data || {})

    data.value = null
    loading.value = false
    lastRefreshedAt.value = new Date()

    const targetUrl = typeof response?.url === 'string' ? response.url : callbackUrl
    if (redirect) {
      const target = resolveNavigationTarget(targetUrl, callbackUrl)
      return await navigateTo(target, { external: /^https?:\/\//.test(target) })
    }

    await getSession()
    return response
  }

  return {
    data: readonly(data),
    getCsrfToken,
    getProviders,
    getSession,
    lastRefreshedAt: readonly(lastRefreshedAt),
    refresh: getSession,
    signIn,
    signOut,
    status,
  }
}
