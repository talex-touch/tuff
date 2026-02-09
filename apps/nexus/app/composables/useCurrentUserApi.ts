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
  linkedProviders?: string[]
  linkedAccounts?: LinkedProviderAccount[]
}

interface CurrentUserProfilePatch {
  name?: string | null
  image?: string | null
  locale?: string | null
}

type RequestLike = <T>(request: string, options?: any) => Promise<T>

const USER_ME_ENDPOINT = '/api/user/me'
const USER_PROFILE_ENDPOINT = '/api/user/profile'

function resolveRequest(): RequestLike {
  return (import.meta.server ? useRequestFetch() : $fetch) as RequestLike
}

export async function fetchCurrentUserProfile(request?: RequestLike) {
  const caller = request ?? resolveRequest()
  return await caller<CurrentUserProfile | null>(USER_ME_ENDPOINT)
}

export async function patchCurrentUserProfile(payload: CurrentUserProfilePatch, request?: RequestLike) {
  const caller = request ?? resolveRequest()
  return await caller<CurrentUserProfile | null>(USER_PROFILE_ENDPOINT, {
    method: 'PATCH',
    body: payload,
  })
}
