export interface LinkedProviderAccount {
  provider: string
  providerAccountId: string
}

export interface CurrentUserProfile {
  id: string
  email: string
  name: string | null
  image: string | null
  role: string
  locale: string | null
  emailVerified: boolean
  emailState: 'verified' | 'unverified' | 'missing'
  isRestricted: boolean
  passkeyCount?: number
  hasPassword?: boolean
  linkedProviders?: string[]
  linkedAccounts?: LinkedProviderAccount[]
  adminBootstrap?: {
    enabled: boolean
    required: boolean
    canPromote: boolean
    isFirstUser: boolean
  }
}

interface CurrentUserProfilePatch {
  name?: string | null
  image?: string | null
  locale?: string | null
}

interface RequestOptions {
  method?: string
  body?: unknown
  cache?: RequestCache
  [key: string]: unknown
}

type RequestLike = (request: string, options?: RequestOptions) => Promise<unknown>

const USER_ME_ENDPOINT = '/api/user/me'
const USER_PROFILE_ENDPOINT = '/api/user/profile'

export async function fetchCurrentUserProfile(request?: RequestLike) {
  const result = request
    ? await request(USER_ME_ENDPOINT, { cache: 'no-store' })
    : import.meta.server
      ? await useRequestFetch()(USER_ME_ENDPOINT, { cache: 'no-store' })
      : await $fetch(USER_ME_ENDPOINT, { cache: 'no-store' })
  return result as CurrentUserProfile | null
}

export async function patchCurrentUserProfile(payload: CurrentUserProfilePatch, request?: RequestLike) {
  const result = request
    ? await request(USER_PROFILE_ENDPOINT, { method: 'PATCH', body: payload })
    : import.meta.server
      ? await useRequestFetch()(USER_PROFILE_ENDPOINT, { method: 'PATCH', body: payload })
      : await $fetch(USER_PROFILE_ENDPOINT, { method: 'PATCH', body: payload })
  return result as CurrentUserProfile | null
}
