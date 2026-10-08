import { sessionGeneration } from '~/utils/session-generation'

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
  status?: string
  createdAt?: string
  updatedAt?: string | null
  emailVerified: boolean
  emailState: 'verified' | 'unverified' | 'missing'
  isRestricted: boolean
  passkeyCount?: number
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

/**
 * How long a fetched profile keeps answering in this tab. A dashboard visit used to ask for it over
 * and over: `app.vue` on every protected route, every mounted `useAuthUser()` (the console gate, the
 * nav, the page) and the locale sync, and again on every route change as the next page mounted its
 * own — from CN a few hundred milliseconds each. Callers that miss at the same time share one
 * request; callers that must see a change they just made pass `force`.
 *
 * The cache belongs to the browser tab. Server renders always ask: one server process answers for
 * many accounts.
 */
export const CURRENT_USER_PROFILE_TTL_MS = 30_000

interface CachedProfile {
  value: CurrentUserProfile | null
  fetchedAt: number
  generation: number
  ticket: number
}

interface ProfileRequest {
  promise: Promise<CurrentUserProfile | null>
  generation: number
}

let cachedProfile: CachedProfile | null = null
let pendingProfile: ProfileRequest | null = null
/** Every request and every invalidation takes the next ticket, so a late answer cannot overwrite a newer one. */
let lastTicket = 0
/** Answers to requests at or below this ticket started before the profile changed; they are not kept. */
let staleBelowTicket = 0

function resolveRequest(request?: RequestLike): RequestLike {
  if (request)
    return request
  if (import.meta.server)
    return useRequestFetch() as RequestLike
  return $fetch as RequestLike
}

async function requestProfile(request: RequestLike) {
  const result = await request(USER_ME_ENDPOINT, { cache: 'no-store' })
  return result as CurrentUserProfile | null
}

function isCurrent(entry: { generation: number }) {
  return entry.generation === sessionGeneration()
}

function rememberProfile(value: CurrentUserProfile | null, ticket: number, generation: number) {
  // Fetched for an account that has since signed out or been switched away from.
  if (generation !== sessionGeneration() || ticket <= staleBelowTicket)
    return
  if (cachedProfile && isCurrent(cachedProfile) && cachedProfile.ticket > ticket)
    return
  cachedProfile = { value, fetchedAt: Date.now(), generation, ticket }
}

/** The answer a request should hand back: its own, unless a newer one for the same account already landed. */
function settledProfile(value: CurrentUserProfile | null, ticket: number, generation: number) {
  if (cachedProfile && cachedProfile.generation === generation && cachedProfile.ticket > ticket)
    return cachedProfile.value
  return value
}

export interface FetchCurrentUserProfileOptions {
  /** Ask the server even when a recent answer is cached; the answer then replaces it. */
  force?: boolean
  /** Send the request through this function instead, bypassing the cache. */
  request?: RequestLike
}

export async function fetchCurrentUserProfile(options: FetchCurrentUserProfileOptions = {}) {
  if (options.request || import.meta.server)
    return await requestProfile(resolveRequest(options.request))

  if (!options.force) {
    if (cachedProfile && isCurrent(cachedProfile) && Date.now() - cachedProfile.fetchedAt < CURRENT_USER_PROFILE_TTL_MS)
      return cachedProfile.value
    if (pendingProfile && isCurrent(pendingProfile))
      return await pendingProfile.promise
  }

  const generation = sessionGeneration()
  const ticket = ++lastTicket
  const promise = requestProfile(resolveRequest()).then((value) => {
    rememberProfile(value, ticket, generation)
    return settledProfile(value, ticket, generation)
  })
  const entry: ProfileRequest = { promise, generation }
  // A forced request is the newest, so later callers join it rather than an older one.
  pendingProfile = entry
  // Settled either way, it stops being joinable; a failure is not remembered.
  promise.then(
    () => { if (pendingProfile === entry) pendingProfile = null },
    () => { if (pendingProfile === entry) pendingProfile = null },
  )
  return await promise
}

/** Drops the cached profile, and any answer to a request already on its way. */
export function forgetCurrentUserProfile() {
  cachedProfile = null
  pendingProfile = null
  staleBelowTicket = ++lastTicket
}

export async function patchCurrentUserProfile(payload: CurrentUserProfilePatch, request?: RequestLike) {
  const result = await resolveRequest(request)(USER_PROFILE_ENDPOINT, { method: 'PATCH', body: payload })
  // The update answers with the user record, not the whole profile (no linked accounts, passkeys or
  // bootstrap state), so it cannot stand in for the cached profile: the next read asks again.
  if (!request && !import.meta.server)
    forgetCurrentUserProfile()
  return result as CurrentUserProfile | null
}
