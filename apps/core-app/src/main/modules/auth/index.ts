import type { AuthState, AuthUser } from '@talex-touch/utils/auth'
import type { MaybePromise, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import type { NetworkMethod, NetworkRetryPolicy } from '@talex-touch/utils/network'
import type {
  AccountSessionState,
  FeatureFlag,
  PlanQuota,
  Subscription,
  Team,
  UsageStats,
  UserProfile
} from '@talex-touch/utils/account'
import type {
  AuthAvatarUpdateRequest,
  AuthLoginRequest,
  AuthManualTokenRequest,
  AuthPendingLoginStatus,
  AuthProfileUpdateRequest,
  NexusRequestPayload,
  NexusResponsePayload,
  NexusUploadFilePayload,
  NexusUploadPayload,
  AccountRecordSyncActivityRequest
} from '@talex-touch/utils/transport/events/auth'
import type {
  HandlerContext,
  ITuffTransportMain,
  StreamContext
} from '@talex-touch/utils/transport/main'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { StorageList } from '@talex-touch/utils'
import {
  BillingCycle,
  DEFAULT_PLAN_QUOTAS,
  SubscriptionPlan,
  SubscriptionStatus,
  TeamRole
} from '@talex-touch/utils/account'
import { getLogger } from '@talex-touch/utils/common/logger'
import { getBooleanEnv } from '@talex-touch/utils/env'
import { appSettingOriginData } from '@talex-touch/utils/common/storage/entity/app-settings'
import { AccountEvents, AuthEvents } from '@talex-touch/utils/transport/events'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { randomUUID, createHash } from 'node:crypto'
import os from 'node:os'
import { shell } from 'electron'
import { isVisibleEvidenceHookEnabled } from '../../core/acceptance-mode'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import {
  type SecureStoreHealth,
  getSecureStoreHealth,
  getSecureStoreValueStrict,
  setSecureStoreValue
} from '../../utils/secure-store'
import { BaseModule } from '../abstract-base-module'
import { getNetworkService } from '../network'
import {
  AUTH_REAUTHENTICATION_REQUIRED_FIELD,
  AUTH_TOKEN_BASE_URL_FIELD,
  LEGACY_AUTH_PROTECTION_FIELDS
} from '../storage/main-storage-registry'
import { getRuntimeNexusBaseUrl, getRuntimeServerMode } from '../nexus/runtime-base'
import { getMainConfig, saveMainConfig, saveMainConfigDurable } from '../storage'
import { withPermission } from '../permission/channel-guard'
import { openValidatedExternalUrl } from '../../utils/external-url-policy'

const authLog = getLogger('auth')

const AUTH_TOKEN_KEY = 'auth.token'
const MACHINE_SEED_SECURE_KEY = 'sync.machine-seed.v1'
const AUTH_TOKEN_PURPOSE = 'auth-token'
const MACHINE_SEED_PURPOSE = 'machine-seed'
const MACHINE_CODE_VERSION = 'mc_v1'
const STEP_UP_TOKEN_TTL_MS = 10 * 60 * 1000
const AUTH_PROFILE_REQUEST_TIMEOUT_MS = 12_000
const AUTH_PROFILE_REQUEST_RETRY_DELAY_MS = 800
const AUTH_NETWORK_NO_RETRY_POLICY: NetworkRetryPolicy = Object.freeze({
  maxRetries: 0,
  retryOnNetworkError: false,
  retryOnTimeout: false,
  retryableStatusCodes: []
})
const AUTH_PROFILE_STARTUP_REFRESH_DELAY_MS = 6_000
const AUTH_CREDENTIAL_BUNDLE_VERSION = 1
const AUTH_ACCESS_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000
const AUTH_ACCESS_TOKEN_REFRESH_RETRY_MS = 60 * 1000
const DEVICE_AUTH_TIMEOUT_MS = 2 * 60 * 1000
const DEVICE_AUTH_DEFAULT_INTERVAL_SECONDS = 3
const VISIBLE_AUTH_EVIDENCE_FLAG = 'TUFF_VISIBLE_EVIDENCE_AUTH'
const VISIBLE_AUTH_EVIDENCE_DEVICE_START_JSON = 'TUFF_VISIBLE_EVIDENCE_AUTH_DEVICE_START_JSON'
const VISIBLE_AUTH_EVIDENCE_BROWSER_OPEN_FAIL = 'TUFF_VISIBLE_EVIDENCE_AUTH_BROWSER_OPEN_FAIL'
const VISIBLE_AUTH_EVIDENCE_POLL_STATUS = 'TUFF_VISIBLE_EVIDENCE_AUTH_POLL_STATUS'
const VISIBLE_AUTH_EVIDENCE_POLL_DELAY_MS = 'TUFF_VISIBLE_EVIDENCE_AUTH_POLL_DELAY_MS'
const UNAVAILABLE_SECURE_STORE_HEALTH: SecureStoreHealth = Object.freeze({
  backend: 'unavailable' as const,
  available: false,
  degraded: true,
  reason: 'Local encrypted storage is unavailable'
})

type AuthStateListener = (state: AuthState) => void

interface AuthCredentialBundleV1 {
  version: typeof AUTH_CREDENTIAL_BUNDLE_VERSION
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: number | null
}

interface AuthCredentialState {
  accessToken: string
  refreshToken: string | null
  accessTokenExpiresAt: number | null
}

type AccessTokenRefreshResult =
  | { kind: 'success'; token: string }
  | { kind: 'unauthorized' }
  | { kind: 'unavailable' }
  | { kind: 'not-refreshable' }

const authState: AuthState = {
  isLoaded: false,
  isSignedIn: false,
  user: null,
  sessionId: null,
  isSettled: false
}

const authStateListeners = new Set<AuthStateListener>()

let appRootPath = ''
let transport: ITuffTransportMain | null = null
let requestRendererValue: (<T>(eventName: string) => Promise<T | null>) | null = null

let authToken: string | null = null
let authRefreshToken: string | null = null
let authAccessTokenExpiresAt: number | null = null
let authAccessRefreshTimer: NodeJS.Timeout | null = null
let authRefreshInFlight: Promise<AccessTokenRefreshResult> | null = null
let stepUpToken: string | null = null
let stepUpTokenExpiresAt = 0
let authStartupRefreshTimer: NodeJS.Timeout | null = null
let deviceAuthLoginAttempt = 0

/**
 * Main-process-only request controls. Transport events remain on the narrow
 * string-body contract; binary callers use this internal auth owner directly.
 */
export interface NexusAuthenticatedRequestOptions {
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
  /** Reject redirects while carrying an app bearer credential. */
  readonly rejectRedirects?: boolean
  /** Require the request URL to remain on this captured Nexus origin. */
  readonly trustedBaseUrl?: string
}

type NexusMainRequestPayload = Omit<NexusRequestPayload, 'body'> & {
  readonly body?: unknown
}

let authRequestIdentity = ''
let authRequestIdentityController = new AbortController()
let activeDeviceAuthCode: string | null = null
/**
 * The browser login in flight, from its device code until its profile is applied. Settles true
 * when the app signed in, false when the login ended any other way.
 */
let activeDeviceAuthLogin: Promise<boolean> | null = null
/** Ends the poll loop's wait so its next poll goes out now. Set only while the loop waits. */
let wakeDeviceAuthPoll: (() => void) | null = null
/** Checks waiting for a poll sent after they asked; that poll resolves them unless it ends the login. */
let deviceAuthPollWaiters: Array<() => void> = []
/** The login page being opened, until its login is in flight or the opening fails. */
let loginPageOpening: Promise<BrowserLoginStartResult | null> | null = null
/** The stored credential being read at startup. */
let authCredentialLoad: Promise<void> | null = null

type AuthEventDefinition<TPayload, TResult> = Parameters<ITuffTransportMain['on']>[0] & {
  _request: TPayload
  _response: TResult
}

function registerAuthHandler<TPayload, TResult>(
  event: AuthEventDefinition<TPayload, TResult>,
  handler: (payload: TPayload, context: HandlerContext) => TResult | Promise<TResult>
): Array<() => void> {
  return transport ? [transport.on(event, handler)] : []
}

const ACCOUNT_READ_PERMISSION = {
  permissionId: 'account.read',
  failClosedForPlugin: true,
  requireVerifiedPlugin: true,
  unavailableCode: 'ACCOUNT_PERMISSION_UNAVAILABLE',
  deniedCode: 'ACCOUNT_PERMISSION_DENIED',
  sdkMismatchCode: 'SDKAPI_MISMATCH'
} as const

/**
 * A plugin reads the account under `account.read`. The app's own windows call the same events and
 * are not plugins, so they pass unchecked.
 */
function withAccountReadPermission<TPayload, TResult>(
  handler: (payload: TPayload, context: HandlerContext) => TResult | Promise<TResult>
): (payload: TPayload, context: HandlerContext) => Promise<TResult> {
  const guarded = withPermission(ACCOUNT_READ_PERMISSION, handler)
  return async (payload, context) =>
    context?.plugin ? await guarded(payload, context) : await handler(payload, context)
}

/** A refusal reaches a stream as an Error; keeps the code that tells the plugin why. */
function toAccountStreamFailure(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }
  const { message, code } = (error ?? {}) as { message?: unknown; code?: unknown }
  const failure = new Error(typeof message === 'string' ? message : String(error)) as Error & {
    code?: string
  }
  if (typeof code === 'string') {
    failure.code = code
  }
  return failure
}

function cloneAuthState(): AuthState {
  return {
    isLoaded: authState.isLoaded,
    isSignedIn: authState.isSignedIn,
    user: authState.user ? { ...authState.user } : null,
    sessionId: authState.sessionId,
    isSettled: authState.isSettled
  }
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '[unserializable]'
  }
}

function getCachedAuthUser(): AuthUser | null {
  const appSettings = getMainConfig(StorageList.APP_SETTING) as AppSetting
  ensureAuthSettings(appSettings)

  const raw = (appSettings.auth as { cachedUser?: unknown }).cachedUser
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const candidate = raw as Partial<AuthUser>
  if (typeof candidate.id !== 'string' || typeof candidate.email !== 'string') {
    return null
  }

  return toAuthUserProfile(candidate as AuthUser)
}

function setCachedAuthUser(user: AuthUser | null): void {
  const appSettings = getMainConfig(StorageList.APP_SETTING) as AppSetting
  ensureAuthSettings(appSettings)

  const authSettings = appSettings.auth as { cachedUser?: unknown }
  const nextCachedUser = user ? toAuthUserProfile(user) : null

  if (safeJsonStringify(authSettings.cachedUser ?? null) === safeJsonStringify(nextCachedUser)) {
    return
  }

  authSettings.cachedUser = nextCachedUser
  saveMainConfig(StorageList.APP_SETTING, appSettings)
}

function notifyAuthStateChanged(): void {
  const snapshot = cloneAuthState()
  for (const listener of authStateListeners) {
    try {
      listener(snapshot)
    } catch (error) {
      authLog.warn('Auth state listener failed', { error })
    }
  }
  if (transport) {
    transport.broadcast(AuthEvents.session.stateChanged, snapshot)
  }
}

export function subscribeAuthState(listener: AuthStateListener): () => void {
  authStateListeners.add(listener)
  return () => {
    authStateListeners.delete(listener)
  }
}

/** What a plugin may know about the session: whether it is decided, and who is signed in. */
function toAccountSessionState(state: AuthState): AccountSessionState {
  return {
    isSettled: state.isSettled === true,
    isSignedIn: state.isSignedIn,
    user: state.user
      ? {
          id: state.user.id,
          ...(typeof state.user.name === 'string' ? { name: state.user.name } : {})
        }
      : null
  }
}

/**
 * Sends a plugin the session now, then whenever what it can see of it changes, until the plugin
 * cancels or the handler goes away. Profile edits it cannot see do not reach it.
 */
function watchAccountSession(context: StreamContext<AccountSessionState>): void {
  if (context.signal.aborted) {
    return
  }
  let sent = ''
  const send = (state: AuthState): void => {
    const session = toAccountSessionState(state)
    const key = JSON.stringify(session)
    if (key === sent || context.isCancelled()) {
      return
    }
    sent = key
    context.emit(session)
  }
  context.signal.addEventListener('abort', subscribeAuthState(send), { once: true })
  send(authState)
}

export function getAuthToken(): string | null {
  if (authToken && isAuthTokenBaseUrlStale()) {
    void dropCredentialIssuedByAnotherOrigin()
    return null
  }
  if (
    authRefreshToken &&
    (authAccessTokenExpiresAt === null ||
      authAccessTokenExpiresAt - Date.now() <= AUTH_ACCESS_TOKEN_REFRESH_SKEW_MS)
  ) {
    void refreshAccessToken('access-read')
  }
  return authToken
}

export function getSanitizedAuthSessionState(): {
  readonly isLoaded: boolean
  readonly isSignedIn: boolean
  readonly user: { readonly id: string; readonly name?: string } | null
} {
  return Object.freeze({
    isLoaded: authState.isLoaded,
    isSignedIn: authState.isSignedIn,
    user: authState.user
      ? Object.freeze({
          id: authState.user.id,
          ...(typeof authState.user.name === 'string' ? { name: authState.user.name } : {})
        })
      : null
  })
}

export function getDeviceId(): string | null {
  const { deviceId } = ensureDeviceProfile()
  return deviceId || null
}

export function getDeviceName(): string | null {
  const { deviceName } = ensureDeviceProfile()
  return deviceName || null
}

export function getDevicePlatform(): string | null {
  const { devicePlatform } = ensureDeviceProfile()
  return devicePlatform || null
}

function resolveAuthBaseUrl(): string {
  return getRuntimeNexusBaseUrl()
}

function normalizeAuthBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

/**
 * The Nexus origin the stored credential was issued by, or '' when nothing recorded it yet.
 *
 * Main-owned: the renderer and remote sync never see this field, so two installs sharing an
 * account cannot invalidate each other.
 */
function readAuthTokenBaseUrl(): string {
  const appSettings = getMainConfig(StorageList.APP_SETTING) as AppSetting
  const authSettings = appSettings.auth
  if (typeof authSettings !== 'object' || authSettings === null || Array.isArray(authSettings)) {
    return ''
  }
  const value = (authSettings as Record<string, unknown>)[AUTH_TOKEN_BASE_URL_FIELD]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Issuing origin of a credential that protected storage could not persist, or '' when the
 * credential in hand is either durable or absent.
 *
 * The persisted field is written only once the credential itself is durable, so a memory-only
 * credential has no recorded origin at all. Reading "nothing recorded" as "not stale" would then
 * replay that token at whatever Nexus origin the address changes to.
 */
let inMemoryCredentialBaseUrl = ''

/**
 * Bumped every time a credential is accepted.
 *
 * A cleanup captures the value it started under and abandons itself once it moved. Clearing is
 * destructive and awaits storage twice, so a login or a refresh that lands in that window would
 * otherwise have its fresh credential deleted by a cleanup aimed at the credential it replaced.
 */
let authCredentialGeneration = 0

function persistAuthTokenBaseUrl(baseUrl: string): void {
  const appSettings = getMainConfig(StorageList.APP_SETTING) as AppSetting
  ensureAuthSettings(appSettings)
  ;(appSettings.auth as Record<string, unknown>)[AUTH_TOKEN_BASE_URL_FIELD] = baseUrl
  saveMainConfig(StorageList.APP_SETTING, appSettings)
}

/**
 * Whether the credential in hand was issued by the origin currently being talked to.
 *
 * A user-chosen Nexus address is persisted and can also change out of band (config file, synced
 * settings), so the UI cannot be the only thing that clears the credential: an unchanged token
 * must never be replayed at a different origin.
 */
function isAuthTokenBaseUrlStale(): boolean {
  const recorded = resolveCredentialIssuerBaseUrl()
  if (!recorded) return false
  return recorded !== normalizeAuthBaseUrl(resolveAuthBaseUrl())
}

/**
 * Origin that issued the credential in hand: what this process recorded when it accepted the
 * credential, else what the durable record says. The in-memory value is the more recent fact, and
 * it is the only one that exists when persistence failed.
 */
function resolveCredentialIssuerBaseUrl(): string {
  return normalizeAuthBaseUrl(inMemoryCredentialBaseUrl || readAuthTokenBaseUrl())
}

async function dropCredentialIssuedByAnotherOrigin(): Promise<void> {
  const current = normalizeAuthBaseUrl(resolveAuthBaseUrl())
  const recorded = resolveCredentialIssuerBaseUrl()
  const generation = authCredentialGeneration

  await clearAuthToken(generation)

  if (authCredentialGeneration !== generation) {
    // A login or refresh landed while the credential was being cleared. That credential was issued
    // by the origin being resolved now, so both it and its own origin record stay untouched.
    authLog.warn('Abandoned credential cleanup: a newer credential arrived', {
      meta: { reason: 'credential-superseded' }
    })
    return
  }

  persistAuthTokenBaseUrl(current)
  authLog.warn('Stored auth credential discarded because the Nexus origin changed', {
    meta: { reason: 'base-url-changed', recordedBaseUrl: recorded, currentBaseUrl: current }
  })
}

function isVisibleAuthEvidenceMode(): boolean {
  return isVisibleEvidenceHookEnabled(VISIBLE_AUTH_EVIDENCE_FLAG)
}

function parsePositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

function resolveVisibleAuthEvidenceDeviceStart(): DeviceAuthStartResponse | null {
  if (!isVisibleAuthEvidenceMode()) {
    return null
  }

  const raw = process.env[VISIBLE_AUTH_EVIDENCE_DEVICE_START_JSON]?.trim()
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<DeviceAuthStartResponse>
      if (typeof parsed.deviceCode === 'string' && typeof parsed.authorizeUrl === 'string') {
        return {
          deviceCode: parsed.deviceCode,
          authorizeUrl: parsed.authorizeUrl,
          userCode: typeof parsed.userCode === 'string' ? parsed.userCode : undefined,
          expiresAt: typeof parsed.expiresAt === 'string' ? parsed.expiresAt : undefined,
          intervalSeconds:
            typeof parsed.intervalSeconds === 'number' ? parsed.intervalSeconds : undefined
        }
      }
    } catch (error) {
      authLog.warn('Failed to parse visible auth evidence device start JSON', { error })
    }
  }

  return {
    deviceCode: 'visible-evidence-device-code',
    userCode: 'TUFF26',
    authorizeUrl: new URL('/device-auth?code=TUFF26', resolveAuthBaseUrl()).toString(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    intervalSeconds: 60
  }
}

function shouldForceVisibleAuthBrowserOpenFailure(): boolean {
  return isVisibleAuthEvidenceMode() && getBooleanEnv(VISIBLE_AUTH_EVIDENCE_BROWSER_OPEN_FAIL)
}

/** Opens a page in the browser, and throws when the URL policy refuses it rather than returning quietly. */
async function openPageExternally(url: string): Promise<void> {
  const decision = await openValidatedExternalUrl(url, { opener: shell.openExternal })
  if (!decision.allowed) {
    throw new Error(`Page was not opened: ${decision.reason}`)
  }
}

async function openAuthUrlExternally(authorizeUrl: string): Promise<void> {
  if (shouldForceVisibleAuthBrowserOpenFailure()) {
    throw new Error('Visible auth evidence forced browser open failure')
  }
  await openPageExternally(authorizeUrl)
}

function normalizePositiveTtlSeconds(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : null
}

function parseStoredAuthCredential(value: string): AuthCredentialState | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  if (!trimmed.startsWith('{')) {
    return { accessToken: trimmed, refreshToken: null, accessTokenExpiresAt: null }
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    const keys = Object.keys(parsed).sort()
    const expectedKeys = ['accessToken', 'accessTokenExpiresAt', 'refreshToken', 'version']
    if (
      keys.length !== expectedKeys.length ||
      keys.some((key, index) => key !== expectedKeys[index])
    ) {
      return null
    }
    const accessToken = typeof parsed.accessToken === 'string' ? parsed.accessToken.trim() : ''
    const refreshToken = typeof parsed.refreshToken === 'string' ? parsed.refreshToken.trim() : ''
    const expiresAt = parsed.accessTokenExpiresAt
    if (parsed.version !== AUTH_CREDENTIAL_BUNDLE_VERSION || !accessToken || !refreshToken) {
      return null
    }
    if (
      expiresAt !== null &&
      (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || expiresAt <= 0)
    ) {
      return null
    }
    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: expiresAt as number | null
    }
  } catch {
    return null
  }
}

function serializeAuthCredential(state: AuthCredentialState): string {
  if (!state.refreshToken) {
    return state.accessToken
  }
  const bundle: AuthCredentialBundleV1 = {
    version: AUTH_CREDENTIAL_BUNDLE_VERSION,
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    accessTokenExpiresAt: state.accessTokenExpiresAt
  }
  return JSON.stringify(bundle)
}

function resolveAccessTokenExpiresAt(ttlSeconds: unknown): number | null {
  const normalizedTtl = normalizePositiveTtlSeconds(ttlSeconds)
  return normalizedTtl === null ? null : Date.now() + normalizedTtl * 1000
}

function resolveAuthRequestIdentity(state: AuthCredentialState | null): string {
  if (!state?.accessToken) return ''
  return state.refreshToken ? `refresh:${state.refreshToken}` : `access:${state.accessToken}`
}

function replaceAuthRequestIdentity(nextIdentity: string): void {
  if (authRequestIdentity === nextIdentity) return
  authRequestIdentityController.abort()
  authRequestIdentity = nextIdentity
  authRequestIdentityController = new AbortController()
}

function applyAuthCredentialState(state: AuthCredentialState | null): void {
  replaceAuthRequestIdentity(resolveAuthRequestIdentity(state))
  authToken = state?.accessToken ?? null
  authRefreshToken = state?.refreshToken ?? null
  authAccessTokenExpiresAt = state?.accessTokenExpiresAt ?? null
  // No credential in hand means nothing for an issuing origin to belong to.
  if (!state) inMemoryCredentialBaseUrl = ''
  scheduleAccessTokenRefresh()
}

function normalizeBearerToken(token: string): string {
  const trimmed = token.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('Bearer ') ? trimmed : `Bearer ${trimmed}`
}

function getSecureValuePurpose(key: string): string {
  if (key === AUTH_TOKEN_KEY) {
    return AUTH_TOKEN_PURPOSE
  }
  if (key === MACHINE_SEED_SECURE_KEY) {
    return MACHINE_SEED_PURPOSE
  }
  return 'default'
}

async function getSecureValue(key: string): Promise<string | null> {
  if (!appRootPath) {
    throw new Error('[AuthModule] App root path is not ready')
  }
  return await getSecureStoreValueStrict(appRootPath, key, getSecureValuePurpose(key), () =>
    authLog.warn('Secure store read failed', {
      meta: { reason: 'secure-store-read-failed' }
    })
  )
}

async function setSecureValue(key: string, value: string | null): Promise<boolean> {
  if (!appRootPath) {
    throw new Error('[AuthModule] App root path is not ready')
  }
  return await setSecureStoreValue(appRootPath, key, value, getSecureValuePurpose(key), () => {
    authLog.warn('Secure store write failed', {
      meta: { reason: 'secure-store-write-failed' }
    })
  })
}

function updateAuthState(nextUser: AuthUser | null, sessionId?: string | null): void {
  const wasSignedIn = authState.isSignedIn
  const previousUserId = authState.user?.id ?? null
  authState.isLoaded = true
  authState.isSignedIn = Boolean(nextUser)
  authState.user = nextUser
  authState.sessionId = sessionId ?? null
  // Every call decides the session: signed in as this user, or signed out.
  authState.isSettled = true
  setCachedAuthUser(nextUser)
  authLog.info('Auth state updated', {
    meta: {
      wasSignedIn,
      isSignedIn: authState.isSignedIn,
      previousUserId,
      nextUserId: nextUser?.id ?? null,
      hasSessionId: Boolean(authState.sessionId)
    }
  })
  notifyAuthStateChanged()
}

async function loadAuthToken(): Promise<void> {
  normalizeAuthSettings()
  authLog.info('Loading auth token', {
    meta: { credentialProtectionEnabled: true }
  })

  if (isAuthReauthenticationRequired()) {
    applyAuthCredentialState(null)
    const deleted = await deletePersistedAuthToken()
    if (deleted) {
      await persistAuthReauthenticationRequired(false)
    }
    authLog.info('Auth token load blocked by fail-closed marker', {
      meta: { reason: 'auth-reauthentication-required' }
    })
    return
  }

  if (isAuthTokenBaseUrlStale()) {
    await dropCredentialIssuedByAnotherOrigin()
    authLog.info('Auth token load skipped because the credential belongs to another Nexus origin', {
      meta: { reason: 'base-url-changed' }
    })
    return
  }

  let secureStoreHealth = UNAVAILABLE_SECURE_STORE_HEALTH
  let secureStoreHealthCheckFailed = false
  try {
    secureStoreHealth = await getSecureStoreHealth(appRootPath)
  } catch {
    secureStoreHealthCheckFailed = true
    authLog.warn(
      'Secure auth persistence health check failed; login state can only remain in memory',
      {
        meta: { reason: 'secure-store-health-check-failed' }
      }
    )
  }
  if (!secureStoreHealth.available) {
    applyAuthCredentialState(null)
    await invalidateAuthTokenPersistence(
      secureStoreHealthCheckFailed ? 'secure-store-health-check-failed' : 'secure-store-unavailable'
    )
  } else {
    try {
      const storedCredential = await getSecureValue(AUTH_TOKEN_KEY)
      if (!storedCredential) {
        applyAuthCredentialState(null)
      } else {
        const credential = parseStoredAuthCredential(storedCredential)
        if (!credential) {
          applyAuthCredentialState(null)
          await invalidateAuthTokenPersistence('secure-store-value-invalid')
          authLog.warn('Secure auth persistence payload is invalid; login state was cleared', {
            meta: { reason: 'secure-store-value-invalid' }
          })
        } else {
          applyAuthCredentialState(credential)
          if (!readAuthTokenBaseUrl()) {
            // A credential stored before the origin was recorded belongs to the origin resolved
            // right now, so it is adopted rather than treated as foreign and signed out.
            persistAuthTokenBaseUrl(normalizeAuthBaseUrl(resolveAuthBaseUrl()))
          }
        }
      }
    } catch {
      applyAuthCredentialState(null)
      await invalidateAuthTokenPersistence('secure-store-read-failed')
      authLog.warn('Secure auth persistence unreadable; login state can only remain in memory', {
        meta: { reason: 'secure-store-read-failed' }
      })
    }
  }
  authLog.info('Auth token load completed', {
    meta: {
      hasToken: Boolean(authToken),
      hasRefreshCredential: Boolean(authRefreshToken),
      credentialProtectionEnabled: true,
      secureStoreAvailable: secureStoreHealth.available,
      secureStoreBackend: secureStoreHealth.backend,
      secureStoreDegraded: secureStoreHealth.degraded
    }
  })
  if (!secureStoreHealth.available) {
    authLog.warn('Secure auth persistence unavailable; login state can only remain in memory', {
      meta: { reason: 'secure-store-unavailable' }
    })
  } else if (secureStoreHealth.degraded) {
    authLog.info('Auth uses local encrypted secure store', {
      meta: { reason: 'secure-store-degraded', backend: secureStoreHealth.backend }
    })
  }
}

async function deletePersistedAuthToken(): Promise<boolean> {
  try {
    const deleted = await setSecureValue(AUTH_TOKEN_KEY, null)
    if (deleted) {
      return true
    }
  } catch {
    // The marker remains the durable fail-closed recovery gate when cleanup is unavailable.
  }
  authLog.warn('Secure auth persistence cleanup failed', {
    meta: { reason: 'secure-store-write-failed' }
  })
  return false
}

async function invalidateAuthTokenPersistence(reason: string): Promise<void> {
  await persistAuthReauthenticationRequired(true)
  const deleted = await deletePersistedAuthToken()
  authLog.warn('Auth persistence entered fail-closed mode', {
    meta: { reason, protectedTokenDeleted: deleted }
  })
}

async function persistAuthToken(nextToken: string): Promise<boolean> {
  const markerPersisted = await persistAuthReauthenticationRequired(true)
  if (!markerPersisted) {
    await deletePersistedAuthToken()
    return false
  }

  let persisted = false
  try {
    persisted = await setSecureValue(AUTH_TOKEN_KEY, nextToken)
  } catch {
    persisted = false
  }
  if (!persisted) {
    await deletePersistedAuthToken()
    return false
  }

  return await persistAuthReauthenticationRequired(false)
}

async function setAuthToken(
  nextToken: string,
  options?: { refreshToken?: string | null; ttlSeconds?: number | null }
): Promise<void> {
  const accessToken = nextToken.trim()
  const refreshToken =
    typeof options?.refreshToken === 'string' ? options.refreshToken.trim() || null : null
  const credentialState: AuthCredentialState = {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: refreshToken ? resolveAccessTokenExpiresAt(options?.ttlSeconds) : null
  }
  // Bumped before the first await: a cleanup already in flight has to see that the credential it
  // was clearing has just been replaced.
  authCredentialGeneration += 1
  applyAuthCredentialState(credentialState)
  authLog.info('Auth token accepted', {
    meta: { credentialProtectionEnabled: true, hasRefreshCredential: Boolean(refreshToken) }
  })
  const persisted = await persistAuthToken(serializeAuthCredential(credentialState))
  if (persisted) {
    // Recorded only after the credential itself is durable: the reverse order would leave a
    // stale token looking like it belongs to the origin just recorded.
    persistAuthTokenBaseUrl(normalizeAuthBaseUrl(resolveAuthBaseUrl()))
  } else {
    // Persistence failed, so the durable record cannot carry the origin and this credential is
    // memory-only. The issuing origin has to be remembered here instead.
    inMemoryCredentialBaseUrl = normalizeAuthBaseUrl(resolveAuthBaseUrl())
    authLog.warn('Secure auth persistence write failed; login state can only remain in memory', {
      meta: { reason: 'secure-store-write-failed' }
    })
  }
  authLog.info('Auth token persistence completed', {
    meta: { persisted, credentialProtectionEnabled: true }
  })
}

/**
 * Clears the credential in memory and on disk.
 *
 * A caller that passes the `generation` it observed only wants the credential it saw cleared. That
 * caller is the origin-drop cleanup, which starts from a read rather than from a user action and can
 * be overtaken by a login or a refresh whose credential must survive.
 */
async function clearAuthToken(generation?: number): Promise<void> {
  const superseded = (): boolean =>
    generation !== undefined && authCredentialGeneration !== generation

  if (superseded()) return

  const hadToken = Boolean(authToken || authRefreshToken)
  applyAuthCredentialState(null)
  authLog.info('Clearing auth token', {
    meta: { hadToken, credentialProtectionEnabled: true }
  })

  if (superseded()) return
  await persistAuthReauthenticationRequired(true)

  if (superseded()) return
  if (await deletePersistedAuthToken()) {
    if (superseded()) return
    await persistAuthReauthenticationRequired(false)
  }
}

function ensureSecuritySettings(appSettings: AppSetting): void {
  if (!appSettings.security) {
    appSettings.security = {
      machineCodeHash: '',
      machineCodeAttestedAt: ''
    }
  }
}

function ensureAuthSettings(appSettings: AppSetting): void {
  if (!appSettings.auth) {
    appSettings.auth = { ...appSettingOriginData.auth }
  }
}

function isAuthReauthenticationRequired(): boolean {
  const appSettings = getMainConfig(StorageList.APP_SETTING) as AppSetting
  const authSettings = appSettings.auth
  return (
    typeof authSettings === 'object' &&
    authSettings !== null &&
    !Array.isArray(authSettings) &&
    (authSettings as Record<string, unknown>)[AUTH_REAUTHENTICATION_REQUIRED_FIELD] === true
  )
}

async function persistAuthReauthenticationRequired(required: boolean): Promise<boolean> {
  const appSettings = getMainConfig(StorageList.APP_SETTING) as AppSetting
  const authSettings =
    typeof appSettings.auth === 'object' &&
    appSettings.auth !== null &&
    !Array.isArray(appSettings.auth)
      ? (appSettings.auth as Record<string, unknown>)
      : {}
  if ((authSettings[AUTH_REAUTHENTICATION_REQUIRED_FIELD] === true) === required) {
    return true
  }

  const nextAppSettings = {
    ...appSettings,
    auth: {
      ...appSettingOriginData.auth,
      ...authSettings,
      [AUTH_REAUTHENTICATION_REQUIRED_FIELD]: required
    }
  } as AppSetting
  try {
    const result = await saveMainConfigDurable(StorageList.APP_SETTING, nextAppSettings, {
      force: true
    })
    if (result.success) {
      return true
    }
  } catch {
    // The current process may retain an in-memory session, but startup recovery is not trusted.
  }
  authLog.warn('Failed to persist auth reauthentication marker', {
    meta: {
      reason: required
        ? 'auth-reauthentication-marker-set-failed'
        : 'auth-reauthentication-marker-clear-failed'
    }
  })
  return false
}

function normalizeAuthSettings(): void {
  const appSettings = getMainConfig(StorageList.APP_SETTING) as AppSetting
  ensureAuthSettings(appSettings)
  const authSettings = appSettings.auth as Record<string, unknown>
  let changed = false
  for (const key of LEGACY_AUTH_PROTECTION_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(authSettings, key)) {
      delete authSettings[key]
      changed = true
    }
  }
  if (changed) {
    saveMainConfig(StorageList.APP_SETTING, appSettings)
  }
}

function ensureSyncSettings(appSettings: AppSetting): void {
  if (!appSettings.sync || typeof appSettings.sync !== 'object') {
    appSettings.sync = JSON.parse(JSON.stringify(appSettingOriginData.sync))
  }
}

function getSyncEnabled(): boolean {
  const appSettings = getMainConfig(StorageList.APP_SETTING) as AppSetting
  ensureSyncSettings(appSettings)
  return Boolean(appSettings.sync?.enabled)
}

function recordSyncActivity(kind: 'push' | 'pull'): boolean {
  const appSettings = getMainConfig(StorageList.APP_SETTING) as AppSetting
  ensureSyncSettings(appSettings)
  const sync = appSettings.sync
  const nowIso = new Date().toISOString()
  sync.lastActivityAt = nowIso
  sync.lastSuccessAt = nowIso
  sync.status = 'idle'
  sync.lastErrorAt = ''
  sync.lastErrorCode = ''
  sync.lastErrorMessage = ''
  sync.blockedReason = ''
  sync.consecutiveFailures = 0
  if (kind === 'push') {
    sync.lastPushAt = nowIso
  }
  if (kind === 'pull') {
    sync.lastPullAt = nowIso
  }
  saveMainConfig(StorageList.APP_SETTING, appSettings)
  return true
}

function resolveDevicePlatformFallback(): string {
  const platform = process.platform
  if (platform === 'darwin') return 'macOS'
  if (platform === 'win32') return 'Windows'
  if (platform === 'linux') return 'Linux'
  return 'desktop'
}

function ensureDeviceProfile(): { deviceId: string; deviceName: string; devicePlatform: string } {
  const appSettings = getMainConfig(StorageList.APP_SETTING) as AppSetting
  ensureAuthSettings(appSettings)

  const authSettings = appSettings.auth as {
    deviceId?: string
    deviceName?: string
    devicePlatform?: string
  }

  let changed = false
  let deviceId = typeof authSettings.deviceId === 'string' ? authSettings.deviceId.trim() : ''
  let deviceName = typeof authSettings.deviceName === 'string' ? authSettings.deviceName.trim() : ''
  let devicePlatform =
    typeof authSettings.devicePlatform === 'string' ? authSettings.devicePlatform.trim() : ''

  if (!deviceId) {
    deviceId = randomUUID()
    changed = true
  }
  if (!devicePlatform) {
    devicePlatform = resolveDevicePlatformFallback()
    changed = true
  }
  if (!deviceName) {
    deviceName = `Desktop-${devicePlatform}`
    changed = true
  }

  if (changed) {
    authSettings.deviceId = deviceId
    authSettings.deviceName = deviceName
    authSettings.devicePlatform = devicePlatform
    saveMainConfig(StorageList.APP_SETTING, appSettings)
  }

  return { deviceId, deviceName, devicePlatform }
}

type FetchRemoteUserResult =
  | { kind: 'success'; user: AuthUser }
  | { kind: 'unauthorized' }
  | { kind: 'unavailable' }

type DeviceAuthPollStatus =
  | 'approved'
  | 'expired'
  | 'cancelled'
  | 'timeout'
  | 'rejected'
  | 'browser_closed'

interface DeviceAuthStartResponse {
  deviceCode?: string
  userCode?: string
  authorizeUrl?: string
  expiresAt?: string
  intervalSeconds?: number
}

interface BrowserLoginStartResult {
  authorizeUrl: string
  userCode?: string
  expiresAt?: string
  browserOpenFailed?: boolean
}

interface DeviceAuthPollResponse {
  status?: string
  appToken?: string
  refreshToken?: string
  grantType?: 'short' | 'long'
  ttlSeconds?: number
  refreshTtlSeconds?: number
  refreshable?: boolean
  reason?: string
  message?: string | null
  /** Sent with an approval: the profile `/api/v1/auth/me` returns, or null when the server withholds it. */
  user?: AuthUser | null
}

interface DeviceAuthPollResult {
  status: DeviceAuthPollStatus
  token?: string
  refreshToken?: string
  ttlSeconds?: number
  message?: string | null
  user?: AuthUser
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Waits out the poll interval, or until a check wakes the loop to poll now. */
function waitForNextDeviceAuthPoll(intervalMs: number): Promise<void> {
  return new Promise((resolve) => {
    const wake = (): void => {
      clearTimeout(timer)
      if (wakeDeviceAuthPoll === wake) {
        wakeDeviceAuthPoll = null
      }
      resolve()
    }
    const timer = setTimeout(wake, intervalMs)
    wakeDeviceAuthPoll = wake
  })
}

/** The profile an approval carries, when `fetchRemoteUser` would have accepted it. */
function readApprovedProfile(user: AuthUser | null | undefined): AuthUser | undefined {
  if (!user || typeof user.id !== 'string' || typeof user.email !== 'string') {
    return undefined
  }
  return toAuthUserProfile(user)
}

async function fetchRemoteUser(
  token: string,
  signal?: AbortSignal
): Promise<FetchRemoteUserResult> {
  const url = new URL('/api/v1/auth/me', resolveAuthBaseUrl()).toString()
  const startedAt = Date.now()
  authLog.info('Fetching remote auth profile', {
    meta: {
      url,
      hasToken: Boolean(token),
      tokenLength: token.length,
      timeoutMs: AUTH_PROFILE_REQUEST_TIMEOUT_MS
    }
  })
  try {
    const response = await getNetworkService().request<AuthUser | null>({
      method: 'GET',
      url,
      headers: { Authorization: normalizeBearerToken(token) },
      signal,
      timeoutMs: AUTH_PROFILE_REQUEST_TIMEOUT_MS,
      retryPolicy: AUTH_NETWORK_NO_RETRY_POLICY,
      responseType: 'json',
      validateStatus: [200, 401, 403]
    })
    authLog.info('Remote auth profile response received', {
      meta: {
        status: response.status,
        ok: response.ok,
        durationMs: Date.now() - startedAt
      }
    })
    if (response.status !== 200) {
      if (response.status === 401 || response.status === 403) {
        authLog.warn('Remote auth profile unauthorized', {
          meta: { status: response.status, durationMs: Date.now() - startedAt }
        })
        return { kind: 'unauthorized' }
      }
      authLog.warn('Remote auth profile unavailable status', {
        meta: { status: response.status, durationMs: Date.now() - startedAt }
      })
      return { kind: 'unavailable' }
    }
    const data = response.data
    if (!data || typeof data.id !== 'string' || typeof data.email !== 'string') {
      authLog.warn('Remote auth profile payload is invalid', {
        meta: { durationMs: Date.now() - startedAt, hasData: Boolean(data) }
      })
      return { kind: 'unauthorized' }
    }
    authLog.info('Remote auth profile resolved', {
      meta: { userId: data.id, durationMs: Date.now() - startedAt }
    })
    return { kind: 'success', user: toAuthUserProfile(data as AuthUser) }
  } catch (error) {
    authLog.warn('Failed to fetch remote auth profile', {
      error,
      meta: {
        url,
        timeoutMs: AUTH_PROFILE_REQUEST_TIMEOUT_MS,
        durationMs: Date.now() - startedAt
      }
    })
    return { kind: 'unavailable' }
  }
}

async function fetchRemoteUserWithTimeout(token: string): Promise<FetchRemoteUserResult> {
  let requestToken = token
  let first = await fetchRemoteUser(requestToken)

  if (first.kind === 'unauthorized' && requestToken === authToken && authRefreshToken) {
    const refreshed = await refreshAccessToken('profile-unauthorized')
    if (refreshed.kind === 'success') {
      requestToken = refreshed.token
      first = await fetchRemoteUser(requestToken)
    } else if (refreshed.kind === 'unavailable') {
      return { kind: 'unavailable' }
    }
  }

  if (first.kind !== 'unavailable') {
    return first
  }

  await delay(AUTH_PROFILE_REQUEST_RETRY_DELAY_MS)
  authLog.info('Retrying remote auth profile fetch', {
    meta: {
      retryDelayMs: AUTH_PROFILE_REQUEST_RETRY_DELAY_MS,
      timeoutMs: AUTH_PROFILE_REQUEST_TIMEOUT_MS
    }
  })
  return await fetchRemoteUser(authToken || requestToken)
}

async function refreshAuthStateFromRemote(): Promise<void> {
  authLog.info('Refreshing auth state from remote', {
    meta: { hasToken: Boolean(authToken), currentUserId: authState.user?.id ?? null }
  })
  const token = await ensureFreshAccessToken('profile-refresh')
  if (!token) {
    updateAuthState(null)
    return
  }

  const remoteResult = await fetchRemoteUserWithTimeout(token)
  if (remoteResult.kind === 'success') {
    updateAuthState(remoteResult.user, authState.sessionId)
    return
  }

  if (remoteResult.kind === 'unauthorized') {
    await clearAuthToken()
    updateAuthState(null)
    return
  }

  authLog.info('Remote auth profile unavailable, keeping local cached auth state')
}

function clearAccessTokenRefreshTimer(): void {
  if (!authAccessRefreshTimer) {
    return
  }
  clearTimeout(authAccessRefreshTimer)
  authAccessRefreshTimer = null
}

function scheduleAccessTokenRefresh(delayOverrideMs?: number): void {
  clearAccessTokenRefreshTimer()
  if (!authRefreshToken) {
    return
  }

  const computedDelay =
    authAccessTokenExpiresAt === null
      ? 0
      : Math.max(0, authAccessTokenExpiresAt - Date.now() - AUTH_ACCESS_TOKEN_REFRESH_SKEW_MS)
  const delayMs =
    typeof delayOverrideMs === 'number' && Number.isFinite(delayOverrideMs)
      ? Math.max(0, Math.floor(delayOverrideMs))
      : computedDelay
  authAccessRefreshTimer = setTimeout(
    () => {
      authAccessRefreshTimer = null
      void refreshAccessToken('scheduled')
    },
    Math.min(delayMs, 2_147_483_647)
  )
}

async function refreshAccessToken(reason: string): Promise<AccessTokenRefreshResult> {
  if (authRefreshInFlight) {
    return await authRefreshInFlight
  }

  const refreshToken = authRefreshToken
  if (!refreshToken) {
    return { kind: 'not-refreshable' }
  }

  const operation = (async (): Promise<AccessTokenRefreshResult> => {
    const url = new URL('/api/app-auth/refresh', resolveAuthBaseUrl()).toString()
    authLog.info('Refreshing Nexus access token', { meta: { reason, url } })
    try {
      const response = await getNetworkService().request<{
        appToken?: string | null
        ttlSeconds?: number | null
      }>({
        method: 'POST',
        url,
        headers: { Authorization: normalizeBearerToken(refreshToken) },
        responseType: 'json',
        timeoutMs: AUTH_PROFILE_REQUEST_TIMEOUT_MS,
        retryPolicy: AUTH_NETWORK_NO_RETRY_POLICY,
        validateStatus: [200, 400, 401, 403, 404, 429, 500, 502, 503, 504]
      })

      if (authRefreshToken !== refreshToken) {
        return { kind: 'not-refreshable' }
      }
      if (response.status === 401 || response.status === 403) {
        authLog.warn('Nexus refresh credential was rejected', {
          meta: { reason, status: response.status }
        })
        await clearAuthToken()
        updateAuthState(null)
        return { kind: 'unauthorized' }
      }

      const nextToken =
        typeof response.data?.appToken === 'string' ? response.data.appToken.trim() : ''
      if (response.status !== 200 || !nextToken) {
        authLog.warn('Nexus access token refresh is temporarily unavailable', {
          meta: { reason, status: response.status }
        })
        scheduleAccessTokenRefresh(AUTH_ACCESS_TOKEN_REFRESH_RETRY_MS)
        return { kind: 'unavailable' }
      }

      await setAuthToken(nextToken, {
        refreshToken,
        ttlSeconds: response.data?.ttlSeconds
      })
      authLog.info('Nexus access token refreshed', { meta: { reason } })
      return { kind: 'success', token: nextToken }
    } catch (error) {
      authLog.warn('Nexus access token refresh failed', { error, meta: { reason } })
      if (authRefreshToken === refreshToken) {
        scheduleAccessTokenRefresh(AUTH_ACCESS_TOKEN_REFRESH_RETRY_MS)
      }
      return { kind: 'unavailable' }
    }
  })()

  authRefreshInFlight = operation
  try {
    return await operation
  } finally {
    if (authRefreshInFlight === operation) {
      authRefreshInFlight = null
    }
  }
}

async function ensureFreshAccessToken(reason: string): Promise<string | null> {
  if (isAuthTokenBaseUrlStale()) {
    await dropCredentialIssuedByAnotherOrigin()
    return null
  }
  if (!authRefreshToken) {
    return authToken
  }

  const accessTokenIsFresh = Boolean(
    authToken &&
    authAccessTokenExpiresAt !== null &&
    authAccessTokenExpiresAt - Date.now() > AUTH_ACCESS_TOKEN_REFRESH_SKEW_MS
  )
  if (accessTokenIsFresh) {
    scheduleAccessTokenRefresh()
    return authToken
  }

  const result = await refreshAccessToken(reason)
  return result.kind === 'success' ? result.token : authToken
}

function scheduleAuthStartupRefresh(delayMs = AUTH_PROFILE_STARTUP_REFRESH_DELAY_MS): void {
  authLog.info('Scheduling auth startup refresh', { meta: { delayMs } })
  if (authStartupRefreshTimer) {
    clearTimeout(authStartupRefreshTimer)
  }

  authStartupRefreshTimer = setTimeout(() => {
    authStartupRefreshTimer = null
    void refreshAuthStateFromRemote()
  }, delayMs)
}

function shouldKeepVisibleEvidenceCachedAuthState(cachedUser: AuthUser | null): boolean {
  return isVisibleAuthEvidenceMode() && Boolean(authToken) && Boolean(cachedUser)
}

async function patchRemoteUserProfile(
  token: string,
  payload: { name?: string | null; bio?: string | null; image?: string | null }
): Promise<AuthUser> {
  const url = new URL('/api/v1/auth/profile', resolveAuthBaseUrl()).toString()
  const response = await getNetworkService().request<AuthUser>({
    method: 'PATCH',
    url,
    headers: {
      'Content-Type': 'application/json',
      Authorization: normalizeBearerToken(token)
    },
    body: payload,
    responseType: 'json',
    timeoutMs: AUTH_PROFILE_REQUEST_TIMEOUT_MS,
    retryPolicy: AUTH_NETWORK_NO_RETRY_POLICY
  })
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }
  const data = response.data as AuthUser
  return toAuthUserProfile(data)
}

function toAuthUserProfile(data: AuthUser): AuthUser {
  return {
    id: data.id,
    email: data.email,
    name: data.name ?? data.email,
    avatar: data.avatar ?? null,
    role: data.role ?? null,
    locale: data.locale ?? null,
    emailVerified: data.emailVerified ?? false,
    bio: data.bio ?? null,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null
  }
}

async function initializeAuthState(): Promise<void> {
  authState.isLoaded = true
  await ensureFreshAccessToken('startup')
  if (!authToken) {
    updateAuthState(null)
    return
  }
  const cachedUser = getCachedAuthUser()
  if (cachedUser) {
    updateAuthState(cachedUser, authState.sessionId)
  }
  if (shouldKeepVisibleEvidenceCachedAuthState(cachedUser)) {
    authLog.info('Keeping visible auth evidence cached auth state without startup refresh', {
      meta: { userId: cachedUser?.id ?? null }
    })
    return
  }
  scheduleAuthStartupRefresh()
}

async function startDeviceAuthRequest(): Promise<DeviceAuthStartResponse> {
  const evidenceStart = resolveVisibleAuthEvidenceDeviceStart()
  if (evidenceStart) {
    authLog.info('Using visible auth evidence device auth start response', {
      meta: {
        hasDeviceCode: Boolean(evidenceStart.deviceCode),
        hasAuthorizeUrl: Boolean(evidenceStart.authorizeUrl),
        intervalSeconds: evidenceStart.intervalSeconds ?? null
      }
    })
    return evidenceStart
  }

  const { deviceId, deviceName, devicePlatform } = ensureDeviceProfile()
  const url = new URL('/api/app-auth/device/start', resolveAuthBaseUrl()).toString()
  const startedAt = Date.now()
  authLog.info('Starting device auth request', {
    meta: {
      url,
      deviceId,
      deviceName,
      devicePlatform
    }
  })
  const response = await getNetworkService().request<DeviceAuthStartResponse>({
    method: 'POST',
    url,
    headers: {
      'Content-Type': 'application/json'
    },
    body: {
      deviceId,
      deviceName,
      devicePlatform,
      clientType: 'app'
    },
    responseType: 'json',
    timeoutMs: AUTH_PROFILE_REQUEST_TIMEOUT_MS,
    retryPolicy: AUTH_NETWORK_NO_RETRY_POLICY,
    validateStatus: [200, 400, 403, 429]
  })

  authLog.info('Device auth start response received', {
    meta: {
      status: response.status,
      durationMs: Date.now() - startedAt,
      hasDeviceCode: Boolean(response.data?.deviceCode),
      hasAuthorizeUrl: Boolean(response.data?.authorizeUrl),
      intervalSeconds: response.data?.intervalSeconds ?? null
    }
  })

  if (
    response.status < 200 ||
    response.status >= 300 ||
    !response.data?.deviceCode ||
    !response.data?.authorizeUrl
  ) {
    const message =
      typeof (response.data as { message?: unknown } | undefined)?.message === 'string'
        ? String((response.data as { message: string }).message)
        : `Device auth start failed: ${response.status}`
    throw new Error(message)
  }

  return response.data
}

async function pollDeviceAuth(
  deviceCode: string,
  intervalSeconds = DEVICE_AUTH_DEFAULT_INTERVAL_SECONDS,
  isCurrentAttempt: () => boolean = () => true
): Promise<DeviceAuthPollResult> {
  if (isVisibleAuthEvidenceMode()) {
    const status = process.env[VISIBLE_AUTH_EVIDENCE_POLL_STATUS]?.trim()
    if (status) {
      const delayMs = parsePositiveIntegerEnv(VISIBLE_AUTH_EVIDENCE_POLL_DELAY_MS, 0)
      if (delayMs > 0) {
        await delay(delayMs)
      }
      if (!isCurrentAttempt()) {
        return { status: 'cancelled' }
      }
      if (status === 'approved') {
        return {
          status: 'approved',
          token: process.env.TUFF_VISIBLE_EVIDENCE_AUTH_APP_TOKEN || 'visible-evidence-app-token'
        }
      }
      if (
        status === 'expired' ||
        status === 'cancelled' ||
        status === 'timeout' ||
        status === 'browser_closed' ||
        status === 'rejected'
      ) {
        return {
          status,
          message:
            status === 'rejected'
              ? (process.env.TUFF_VISIBLE_EVIDENCE_AUTH_REJECT_MESSAGE ?? 'Rejected by evidence')
              : null
        }
      }
      authLog.warn('Ignoring unsupported visible auth evidence poll status', {
        meta: { status }
      })
    }
  }

  const url = new URL('/api/app-auth/device/poll', resolveAuthBaseUrl()).toString()
  const intervalMs = Math.max(1000, intervalSeconds * 1000)
  const startAt = Date.now()
  let pollCount = 0
  authLog.info('Polling device auth started', {
    meta: { url, intervalMs, timeoutMs: DEVICE_AUTH_TIMEOUT_MS }
  })

  while (Date.now() - startAt <= DEVICE_AUTH_TIMEOUT_MS) {
    if (!isCurrentAttempt()) {
      return { status: 'cancelled' }
    }

    // A check that asked while the previous poll was out gets this one without the wait.
    if (deviceAuthPollWaiters.length === 0) {
      await waitForNextDeviceAuthPoll(intervalMs)
    }

    if (!isCurrentAttempt()) {
      return { status: 'cancelled' }
    }

    const waiters = deviceAuthPollWaiters.splice(0)
    try {
      pollCount += 1
      const response = await getNetworkService().request<DeviceAuthPollResponse>({
        method: 'GET',
        url,
        query: {
          device_code: deviceCode
        },
        headers: {
          'Cache-Control': 'no-cache'
        },
        responseType: 'json',
        timeoutMs: AUTH_PROFILE_REQUEST_TIMEOUT_MS,
        retryPolicy: AUTH_NETWORK_NO_RETRY_POLICY,
        validateStatus: [200, 400, 410, 429]
      })

      authLog.debug('Device auth poll response received', {
        meta: {
          pollCount,
          statusCode: response.status,
          authStatus: response.data?.status ?? null,
          hasAppToken: Boolean(response.data?.appToken),
          hasRefreshToken: Boolean(response.data?.refreshToken)
        }
      })

      const data = response.status >= 200 && response.status < 300 ? response.data : null
      if (data?.status === 'approved' && data.appToken) {
        return {
          status: 'approved',
          token: data.appToken,
          refreshToken: data.refreshToken,
          ttlSeconds: normalizePositiveTtlSeconds(data.ttlSeconds) ?? undefined,
          user: readApprovedProfile(data.user)
        }
      }
      if (data?.status === 'expired') return { status: 'expired' }
      if (data?.status === 'cancelled') return { status: 'cancelled' }
      if (data?.status === 'browser_closed') return { status: 'browser_closed' }
      if (data?.status === 'rejected')
        return { status: 'rejected', message: data.message ?? data.reason ?? null }
    } catch (error) {
      authLog.warn('Device auth poll failed', { error })
    }

    // Not approved yet, or the server could not be asked. A poll that ends the login returned
    // above without these: they hear from the login itself.
    for (const resolve of waiters) {
      resolve()
    }
  }

  authLog.warn('Device auth polling timed out', { meta: { pollCount } })
  return { status: 'timeout' }
}

async function abortDeviceAuth(deviceCode: string): Promise<void> {
  const url = new URL('/api/app-auth/device/abort', resolveAuthBaseUrl()).toString()
  try {
    await getNetworkService().request({
      method: 'POST',
      url,
      headers: {
        'Content-Type': 'application/json'
      },
      body: { deviceCode },
      timeoutMs: AUTH_PROFILE_REQUEST_TIMEOUT_MS,
      retryPolicy: AUTH_NETWORK_NO_RETRY_POLICY,
      validateStatus: [200, 400, 404, 410]
    })
  } catch (error) {
    authLog.warn('Failed to abort device auth request', { error })
  }
}

async function cancelActiveDeviceAuth(): Promise<void> {
  const deviceCode = activeDeviceAuthCode
  deviceAuthLoginAttempt += 1
  activeDeviceAuthCode = null
  if (deviceCode) {
    // Still polling, so nothing this login does from here on is applied. A new login need not
    // wait for it, and its loop stops now rather than after the interval. Past polling it is
    // applying an approval, and a new login waits until that credential has been discarded.
    activeDeviceAuthLogin = null
    wakeDeviceAuthPoll?.()
    await abortDeviceAuth(deviceCode)
  }
}

async function completeDeviceAuthLogin(
  deviceCode: string,
  intervalSeconds: number,
  attemptId: number
): Promise<boolean> {
  const isCurrentAttempt = () =>
    deviceAuthLoginAttempt === attemptId && activeDeviceAuthCode === deviceCode
  const result = await pollDeviceAuth(deviceCode, intervalSeconds, isCurrentAttempt)
  if (!isCurrentAttempt()) {
    return false
  }

  activeDeviceAuthCode = null
  if (result.status !== 'approved' || !result.token) {
    await abortDeviceAuth(deviceCode)
    authLog.warn('Device auth login did not complete', {
      meta: {
        status: result.status,
        message: result.message ?? null
      }
    })
    if (!authToken) {
      updateAuthState(null)
    }
    return false
  }

  // The code is spent by now, so only the attempt shows whether Cancel or logout came since.
  const isCurrentLogin = () => deviceAuthLoginAttempt === attemptId
  const applied = await handleExternalAuthCallback(
    result.token,
    result.token,
    result.refreshToken,
    result.ttlSeconds,
    result.user,
    isCurrentLogin
  )
  if (!applied && isCurrentLogin()) {
    authLog.warn('Device auth token was rejected')
    if (!authToken) {
      updateAuthState(null)
    }
  }
  return applied
}

/**
 * Where the browser login in flight stands, asked of the server now instead of at the next poll.
 * An approval found this way is applied before this returns.
 */
async function settlePendingDeviceAuth(): Promise<AuthPendingLoginStatus> {
  const login = activeDeviceAuthLogin
  if (!login) {
    return 'idle'
  }
  const settled = login.then(
    (signedIn): AuthPendingLoginStatus => (signedIn ? 'signed-in' : 'idle')
  )
  // Without a code, polling is over and an approval is being applied.
  if (!activeDeviceAuthCode) {
    return await settled
  }
  const polled = new Promise<AuthPendingLoginStatus>((resolve) => {
    deviceAuthPollWaiters.push(() => resolve('waiting'))
    wakeDeviceAuthPoll?.()
  })
  return await Promise.race([settled, polled])
}

/** Resolves null without opening a page when the login in flight turns out to be approved. */
function openLoginPage(
  mode: 'sign-in' | 'sign-up' = 'sign-in'
): Promise<BrowserLoginStartResult | null> {
  const opening = startLoginPage(mode)
  loginPageOpening = opening
  const settle = (): void => {
    if (loginPageOpening === opening) {
      loginPageOpening = null
    }
  }
  opening.then(settle, settle)
  return opening
}

async function startLoginPage(
  mode: 'sign-in' | 'sign-up'
): Promise<BrowserLoginStartResult | null> {
  authLog.info('Opening browser login page', { meta: { mode } })
  // The browser may have approved the login in flight since its last poll. Its code is aborted
  // below, which would throw that approval away and send the user through sign-in again.
  if ((await settlePendingDeviceAuth()) === 'signed-in') {
    authLog.info('Login in flight was approved; not opening another page')
    return null
  }
  const previousDeviceCode = activeDeviceAuthCode
  const attemptId = ++deviceAuthLoginAttempt
  activeDeviceAuthCode = null
  if (previousDeviceCode) {
    await abortDeviceAuth(previousDeviceCode)
  }

  const auth = await startDeviceAuthRequest()
  const authorizeUrlRaw = auth.authorizeUrl
  const deviceCode = auth.deviceCode
  if (!authorizeUrlRaw || !deviceCode) {
    throw new Error('Device auth response is incomplete')
  }

  activeDeviceAuthCode = deviceCode
  const authorizeUrl = new URL(authorizeUrlRaw, resolveAuthBaseUrl())
  if (mode === 'sign-up') {
    authorizeUrl.pathname = '/sign-up'
  }

  authLog.info('Browser login page resolved', {
    meta: {
      mode,
      attemptId,
      hasPreviousDeviceCode: Boolean(previousDeviceCode),
      authorizeHost: authorizeUrl.host,
      authorizePath: authorizeUrl.pathname
    }
  })
  const loginStart = {
    authorizeUrl: authorizeUrl.toString(),
    userCode: auth.userCode,
    expiresAt: auth.expiresAt,
    browserOpenFailed: false
  }

  try {
    await openAuthUrlExternally(loginStart.authorizeUrl)
  } catch (error) {
    loginStart.browserOpenFailed = true
    authLog.warn('Failed to open browser login page', { error })
  }
  const login = completeDeviceAuthLogin(
    deviceCode,
    auth.intervalSeconds ?? DEVICE_AUTH_DEFAULT_INTERVAL_SECONDS,
    attemptId
  ).catch((error) => {
    if (deviceAuthLoginAttempt === attemptId && activeDeviceAuthCode === deviceCode) {
      activeDeviceAuthCode = null
      if (!authToken) {
        updateAuthState(null)
      }
    }
    authLog.warn('Device auth login failed', { error })
    return false
  })
  activeDeviceAuthLogin = login
  void login.then(() => {
    if (activeDeviceAuthLogin === login) {
      activeDeviceAuthLogin = null
    }
  })
  return loginStart
}

/**
 * Signs in at a plugin's request without starting over: a new login would void the code on the
 * page the user may already be signing in on, so a login under way is joined instead. True when
 * the app is signed in or a login is under way, false when no login page could be opened.
 */
async function requestLoginForPlugin(): Promise<boolean> {
  // A plugin can ask before the stored credential has been read at startup.
  await authCredentialLoad?.catch(() => undefined)
  if (authState.isSignedIn || activeDeviceAuthLogin) {
    return true
  }
  // A stored credential still being checked at startup signs the app in without a page.
  if (!authState.isSettled && authToken) {
    return true
  }
  const start = await (loginPageOpening ?? openLoginPage('sign-in'))
  return start === null || !start.browserOpenFailed
}

async function handleExternalAuthCallback(
  token: string,
  appToken?: string,
  refreshToken?: string,
  ttlSeconds?: number,
  profile?: AuthUser,
  isCurrentLogin: () => boolean = () => true
): Promise<boolean> {
  const resolvedToken = appToken || token
  authLog.info('Handling auth callback token', {
    meta: {
      hasToken: Boolean(token),
      hasAppToken: Boolean(appToken),
      hasRefreshToken: Boolean(refreshToken),
      hasProfile: Boolean(profile),
      resolvedTokenLength: resolvedToken.length
    }
  })
  if (!resolvedToken) {
    return false
  }
  // Cancel and logout can land while this awaits. They have already answered the user, so the
  // credential set here must not outlive them.
  const discardIfCancelled = async (): Promise<boolean> => {
    if (isCurrentLogin()) return false
    authLog.info('Login was cancelled while its credential was applied')
    await clearAuthToken()
    updateAuthState(null)
    return true
  }
  await setAuthToken(resolvedToken, { refreshToken, ttlSeconds })
  if (await discardIfCancelled()) return false
  // A device-code approval carries the profile `/me` would return; asking for it again cost the
  // login another cross-border round trip.
  if (profile) {
    updateAuthState(profile, authState.sessionId)
    return true
  }
  const remoteResult = await fetchRemoteUserWithTimeout(resolvedToken)
  authLog.info('Auth callback profile resolution completed', {
    meta: { result: remoteResult.kind }
  })
  if (await discardIfCancelled()) return false
  if (remoteResult.kind === 'success') {
    updateAuthState(remoteResult.user, authState.sessionId)
    return true
  }
  if (remoteResult.kind === 'unauthorized') {
    await clearAuthToken()
    updateAuthState(null)
    return false
  }

  const cachedUser = getCachedAuthUser()
  if (cachedUser) {
    updateAuthState(cachedUser, authState.sessionId)
    scheduleAuthStartupRefresh(2_000)
    return true
  }

  authLog.warn('Auth callback accepted token but user profile is unavailable')
  updateAuthState(null)
  scheduleAuthStartupRefresh(2_000)
  return false
}

function resolveNexusRequestUrl(payload: { url?: string; path?: string }): string {
  const rawUrl = payload.url
  const rawPath = payload.path
  if (!rawUrl && !rawPath) {
    throw new Error('Missing request url/path')
  }
  return rawUrl ? rawUrl : new URL(rawPath ?? '', resolveAuthBaseUrl()).toString()
}

function toUploadBytes(data: NexusUploadFilePayload['data']): Uint8Array {
  if (data instanceof Uint8Array) {
    return data
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data)
  }
  if (Array.isArray(data)) {
    return new Uint8Array(data)
  }
  return new Uint8Array()
}

function toUploadBlobPart(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function buildNexusUploadFormData(payload: NexusUploadPayload): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries(payload.fields ?? {})) {
    form.append(key, value)
  }
  for (const file of payload.files ?? []) {
    const bytes = toUploadBytes(file.data)
    const blob = new Blob([toUploadBlobPart(bytes)], {
      type: file.type || 'application/octet-stream'
    })
    form.append(file.field, blob, file.name)
  }
  return form
}

function shouldClearAuthStateForNexusUnauthorized(context?: string): boolean {
  const normalizedContext = (context ?? '').trim()
  return normalizedContext === 'auth-profile' || normalizedContext.startsWith('auth:')
}

interface NexusRequestExecutionOptions {
  readonly timeoutMs?: number
  readonly bodyFactory?: () => unknown
}

async function executeNexusRequest(
  url: string,
  method: NetworkMethod,
  headers: Headers,
  body: unknown,
  context?: string,
  options: NexusRequestExecutionOptions = {}
): Promise<NexusResponsePayload> {
  const startedAt = Date.now()
  authLog.debug('Executing Nexus request', {
    meta: {
      context: context ?? '',
      method,
      url,
      hasAuthorization: headers.has('Authorization'),
      hasBody: Boolean(body || options.bodyFactory)
    }
  })

  const sendRequest = () =>
    getNetworkService().request<string>({
      method,
      url,
      headers: Object.fromEntries(headers.entries()),
      body: options.bodyFactory ? options.bodyFactory() : body,
      responseType: 'text',
      timeoutMs: options.timeoutMs,
      retryPolicy: AUTH_NETWORK_NO_RETRY_POLICY,
      validateStatus: Array.from({ length: 500 }, (_, index) => index + 100)
    })

  let response = await sendRequest()
  let retriedAfterRefresh = false
  if (response.status === 401 && authRefreshToken) {
    const refreshed = await refreshAccessToken('request-unauthorized')
    if (refreshed.kind === 'success') {
      headers.set('Authorization', normalizeBearerToken(refreshed.token))
      response = await sendRequest()
      retriedAfterRefresh = true
    }
  }

  authLog.debug('Nexus request completed', {
    meta: {
      context: context ?? '',
      method,
      url: response.url || url,
      status: response.status,
      ok: response.ok,
      retriedAfterRefresh,
      durationMs: Date.now() - startedAt
    }
  })

  if (response.status === 401) {
    if (shouldClearAuthStateForNexusUnauthorized(context)) {
      authLog.warn('Nexus auth request returned unauthorized; clearing auth state', {
        meta: { context: context ?? '', method, url: response.url || url }
      })
      await clearAuthToken()
      updateAuthState(null)
    } else {
      authLog.warn('Nexus business request returned unauthorized; preserving auth state', {
        meta: { context: context ?? '', method, url: response.url || url }
      })
    }
  }

  return {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    url: response.url || url,
    body: response.data ?? ''
  }
}

const inFlightNexusGets = new Map<string, Promise<NexusResponsePayload | null>>()

async function performNexusRequest(
  payload: NexusRequestPayload
): Promise<NexusResponsePayload | null> {
  const method = (payload.method ? payload.method.toUpperCase() : 'GET') as NetworkMethod
  const isIdempotentGet = method === 'GET' && !payload.body
  const inFlightKey = isIdempotentGet
    ? `${method}:${payload.url || payload.path || ''}:${payload.context ?? ''}`
    : null

  if (inFlightKey && inFlightNexusGets.has(inFlightKey)) {
    return inFlightNexusGets.get(inFlightKey)!
  }

  const runRequest = async (): Promise<NexusResponsePayload | null> => {
    const token = await ensureFreshAccessToken('request')
    if (!token) {
      authLog.warn('Nexus request skipped without auth token', {
        meta: { context: payload.context ?? '', path: payload.path ?? '', url: payload.url ?? '' }
      })
      return null
    }
    const url = resolveNexusRequestUrl(payload)
    const headers = new Headers(payload.headers ?? {})
    headers.set('Authorization', normalizeBearerToken(token))

    return executeNexusRequest(url, method, headers, payload.body, payload.context, {
      timeoutMs: AUTH_PROFILE_REQUEST_TIMEOUT_MS
    })
  }

  if (inFlightKey) {
    const promise = runRequest().finally(() => {
      inFlightNexusGets.delete(inFlightKey)
    })
    inFlightNexusGets.set(inFlightKey, promise)
    return promise
  }

  return runRequest()
}

/** Internal main-process Nexus request used by binary capability clients. */
export async function performNexusRequestWithAuth(
  payload: NexusMainRequestPayload,
  options: NexusAuthenticatedRequestOptions = {}
): Promise<NexusResponsePayload | null> {
  const trustedBaseUrl = options.trustedBaseUrl?.trim() || resolveAuthBaseUrl()
  const url = resolveNexusRequestUrl(payload)
  const trustedOrigin = new URL(trustedBaseUrl).origin
  if (new URL(url).origin !== trustedOrigin) {
    throw Object.assign(new Error('NEXUS_INVALID_REQUEST'), { code: 'INVALID_REQUEST' as const })
  }
  const timeoutMs =
    typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs)
      ? Math.max(100, Math.floor(options.timeoutMs))
      : undefined
  const deadlineController = new AbortController()
  const timer = timeoutMs ? setTimeout(() => deadlineController.abort(), timeoutMs) : null
  const signal = AbortSignal.any([
    ...(options.signal ? [options.signal] : []),
    authRequestIdentityController.signal,
    deadlineController.signal
  ])
  try {
    const token = await ensureFreshAccessToken('request')
    if (signal.aborted) throw new Error('NEXUS_REQUEST_CANCELLED')
    if (!token) return null
    if (new URL(resolveAuthBaseUrl()).origin !== trustedOrigin) {
      throw new Error('NEXUS_REQUEST_CONTEXT_CHANGED')
    }
    const requestIdentity = authRequestIdentity
    const headers = new Headers(payload.headers ?? {})
    headers.set('Authorization', normalizeBearerToken(token))
    const method = (payload.method ? payload.method.toUpperCase() : 'GET') as NetworkMethod
    const requestOptions = {
      method,
      url,
      headers: Object.fromEntries(headers.entries()),
      body: payload.body,
      responseType: 'text' as const,
      signal,
      timeoutMs,
      validateStatus: Array.from({ length: 500 }, (_, index) => index + 100),
      retryPolicy: {
        maxRetries: 0,
        retryOnNetworkError: false,
        retryOnTimeout: false,
        retryableStatusCodes: []
      }
    }
    const sendRequest = () =>
      options.rejectRedirects
        ? getNetworkService().requestNoRedirect<string>(requestOptions)
        : getNetworkService().request<string>(requestOptions)
    let response = await sendRequest()
    if (response.status === 401 && authRefreshToken && !signal.aborted) {
      const refreshed = await refreshAccessToken('request-unauthorized')
      if (
        refreshed.kind === 'success' &&
        requestIdentity === authRequestIdentity &&
        new URL(resolveAuthBaseUrl()).origin === trustedOrigin &&
        !signal.aborted
      ) {
        headers.set('Authorization', normalizeBearerToken(refreshed.token))
        requestOptions.headers = Object.fromEntries(headers.entries())
        response = await sendRequest()
      }
    }
    if (new URL(resolveAuthBaseUrl()).origin !== trustedOrigin) {
      throw new Error('NEXUS_REQUEST_CONTEXT_CHANGED')
    }
    if (requestIdentity !== authRequestIdentity || signal.aborted) {
      throw new Error('NEXUS_REQUEST_CANCELLED')
    }
    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      url: response.url || url,
      body: response.data ?? ''
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function performNexusUpload(
  payload: NexusUploadPayload
): Promise<NexusResponsePayload | null> {
  const token = await ensureFreshAccessToken('upload')
  if (!token) {
    authLog.warn('Nexus upload skipped without auth token', {
      meta: { context: payload.context ?? '', path: payload.path ?? '', url: payload.url ?? '' }
    })
    return null
  }
  const url = resolveNexusRequestUrl(payload)
  const method = (payload.method ? payload.method.toUpperCase() : 'POST') as NetworkMethod
  const headers = new Headers(payload.headers ?? {})
  headers.delete('content-type')
  headers.set('Authorization', normalizeBearerToken(token))

  return executeNexusRequest(url, method, headers, null, payload.context, {
    bodyFactory: () => buildNexusUploadFormData(payload)
  })
}

function parseTimestampToMillis(value?: string | null): number {
  if (!value) {
    return 0
  }
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function mapAuthUserToProfile(user: AuthUser): UserProfile {
  const email = user.email
  const emailName = email ? email.split('@')[0] : ''
  return {
    id: user.id,
    displayName: user.name ?? emailName,
    email,
    emailVerified: user.emailVerified ?? false,
    avatarUrl: user.avatar ?? undefined,
    bio: user.bio ?? undefined,
    locale: user.locale ?? undefined,
    createdAt: parseTimestampToMillis(user.createdAt),
    updatedAt: parseTimestampToMillis(user.updatedAt),
    twoFactorEnabled: false,
    socialConnections: []
  }
}

interface SubscriptionStatusPayload {
  plan?: unknown
  expiresAt?: string | null
  activatedAt?: string | null
  isActive?: boolean
  features?: {
    aiRequests?: { limit?: unknown; used?: number }
    aiTokens?: { limit?: unknown; used?: number }
    customModels?: unknown
    prioritySupport?: unknown
    apiAccess?: unknown
  }
  team?: {
    id?: unknown
    name?: unknown
    type?: unknown
    role?: unknown
    seats?: { used?: unknown }
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeSubscriptionPlan(raw: unknown): SubscriptionPlan {
  const normalized = String(raw ?? '').toLowerCase()
  const values = Object.values(SubscriptionPlan) as string[]
  return values.includes(normalized) ? (normalized as SubscriptionPlan) : SubscriptionPlan.FREE
}

function mapSubscriptionUsage(status: SubscriptionStatusPayload): UsageStats {
  const features = status?.features ?? {}
  const aiRequestsUsed = features?.aiRequests?.used ?? 0
  const aiTokensUsed = features?.aiTokens?.used ?? 0
  return {
    aiRequestsThisWeek: aiRequestsUsed,
    aiTokensThisWeek: aiTokensUsed,
    aiRequestsToday: aiRequestsUsed,
    aiRequestsThisMonth: aiRequestsUsed,
    aiTokensThisMonth: aiTokensUsed,
    storageUsedBytes: 0,
    pluginsInstalled: 0
  }
}

async function fetchSubscriptionStatus(): Promise<SubscriptionStatusPayload | null> {
  try {
    const response = await performNexusRequest({
      method: 'GET',
      path: '/api/subscription/status',
      context: 'account-subscription-status'
    })
    if (!response || response.status >= 400) {
      return null
    }
    const body: unknown = response.body
    if (!body) {
      return null
    }
    const parsed: unknown = typeof body === 'string' ? JSON.parse(body) : body
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null
    }
    return parsed as SubscriptionStatusPayload
  } catch (error) {
    authLog.warn('Failed to fetch subscription status', { error })
    return null
  }
}

/**
 * The plan's limits as Nexus reports them, over the local table for those it does not report.
 * Nexus counts AI requests and tokens per week, the same window as the usage mapped above, and
 * refuses no call over them: what it enforces is credits.
 */
function mapSubscriptionQuota(
  plan: SubscriptionPlan,
  status: SubscriptionStatusPayload
): PlanQuota {
  const features = status.features ?? {}
  const quota: PlanQuota = { ...DEFAULT_PLAN_QUOTAS[plan] }
  if (isFiniteNumber(features.aiRequests?.limit)) {
    quota.aiRequestsPerWeek = features.aiRequests.limit
    quota.aiRequestsPerDay = features.aiRequests.limit
  }
  if (isFiniteNumber(features.aiTokens?.limit)) {
    quota.aiTokensPerWeek = features.aiTokens.limit
    quota.aiTokensPerMonth = features.aiTokens.limit
  }
  if (typeof features.customModels === 'boolean') {
    quota.customModelAccess = features.customModels
  }
  if (typeof features.prioritySupport === 'boolean') {
    quota.prioritySupport = features.prioritySupport
  }
  if (typeof features.apiAccess === 'boolean') {
    quota.apiAccess = features.apiAccess
  }
  return quota
}

/** Nexus's plan features as flags. A limit carries its number, -1 for unlimited. */
function mapSubscriptionFeatures(status: SubscriptionStatusPayload): FeatureFlag[] {
  const features = status.features ?? {}
  const flags: FeatureFlag[] = []
  for (const id of ['aiRequests', 'aiTokens'] as const) {
    const limit = features[id]?.limit
    if (isFiniteNumber(limit)) {
      flags.push({ id, enabled: limit !== 0, value: limit })
    }
  }
  for (const id of ['customModels', 'prioritySupport', 'apiAccess'] as const) {
    const enabled = features[id]
    if (typeof enabled === 'boolean') {
      flags.push({ id, enabled })
    }
  }
  return flags
}

/**
 * The organization the account belongs to. Every account also has a personal team, which is no
 * team in the SDK's sense and is left out. Nexus reports no slug or creation time here, so the id
 * stands in for the slug and 0 means unknown, as for the other timestamps in this file.
 */
function mapSubscriptionTeams(status: SubscriptionStatusPayload): Team[] {
  const team = status.team
  if (!team || team.type !== 'organization' || typeof team.id !== 'string' || !team.id) {
    return []
  }
  const roles = Object.values(TeamRole) as string[]
  return [
    {
      id: team.id,
      name: typeof team.name === 'string' ? team.name : '',
      slug: team.id,
      role: roles.includes(String(team.role)) ? (team.role as TeamRole) : TeamRole.MEMBER,
      memberCount: isFiniteNumber(team.seats?.used) ? team.seats.used : 0,
      createdAt: 0
    }
  ]
}

async function fetchAccountSubscription(): Promise<Subscription | null> {
  const status = await fetchSubscriptionStatus()
  if (!status) {
    return null
  }
  const plan = normalizeSubscriptionPlan(status.plan)
  const quota = mapSubscriptionQuota(plan, status)
  return {
    id: `sub_${plan}`,
    plan,
    status: status.isActive ? SubscriptionStatus.ACTIVE : SubscriptionStatus.EXPIRED,
    billingCycle: BillingCycle.MONTHLY,
    quota,
    usage: mapSubscriptionUsage(status),
    startedAt: parseTimestampToMillis(status.activatedAt),
    currentPeriodEnd: parseTimestampToMillis(status.expiresAt),
    cancelAtPeriodEnd: false,
    autoRenew: false,
    hasPaymentMethod: false
  }
}

async function fetchAccountUsage(): Promise<UsageStats | null> {
  const status = await fetchSubscriptionStatus()
  if (!status) {
    return null
  }
  return mapSubscriptionUsage(status)
}

async function fetchAccountFeatures(): Promise<FeatureFlag[]> {
  const status = await fetchSubscriptionStatus()
  return status ? mapSubscriptionFeatures(status) : []
}

async function fetchAccountTeams(): Promise<Team[]> {
  const status = await fetchSubscriptionStatus()
  return status ? mapSubscriptionTeams(status) : []
}

/**
 * Where the account links go on Nexus. It has no billing, settings or profile page: the plan and
 * its activation codes live on the team page, and the account page holds settings and profile.
 */
const ACCOUNT_PAGES = {
  upgrade: '/pricing',
  billing: '/dashboard/team',
  settings: '/dashboard/account',
  profile: '/dashboard/account'
} as const

async function openAccountDashboard(
  pathname: string,
  query: Record<string, string> = {}
): Promise<void> {
  const url = new URL(pathname, resolveAuthBaseUrl())
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value)
  }
  // The policy takes a string. Handed the URL object, it refused every page, and nothing said so.
  await openPageExternally(url.toString())
}

/** The plan to show on the pricing page, if the caller named one. */
function resolveUpgradePlanQuery(payload: unknown): Record<string, string> {
  const plan = (payload as { plan?: unknown } | null | undefined)?.plan
  return (Object.values(SubscriptionPlan) as unknown[]).includes(plan)
    ? { plan: plan as string }
    : {}
}

async function getOrInitMachineSeed(appSettings: AppSetting): Promise<string> {
  ensureSecuritySettings(appSettings)
  const secureSeed = (await getSecureValue(MACHINE_SEED_SECURE_KEY))?.trim() ?? ''
  if (secureSeed) {
    return secureSeed
  }

  const nextSeed = randomUUID().replace(/-/g, '')
  const persisted = await setSecureValue(MACHINE_SEED_SECURE_KEY, nextSeed)
  if (!persisted) {
    throw new Error('Secure machine seed unavailable')
  }
  return nextSeed
}

function extractFingerprint(): string {
  const platform = os.platform()
  const arch = os.arch()
  const cpuModels = os
    .cpus()
    .map((cpu) => cpu.model || '')
    .filter(Boolean)
  const cpuModelUniq = Array.from(new Set(cpuModels)).sort()

  const macs: string[] = []
  const nics = os.networkInterfaces()
  for (const entries of Object.values(nics)) {
    if (!entries) continue
    for (const nic of entries) {
      if (!nic) continue
      const mac = nic.mac?.toLowerCase() ?? ''
      if (!mac || mac === '00:00:00:00:00:00' || nic.internal) continue
      macs.push(mac)
    }
  }
  const uniqMacs = Array.from(new Set(macs)).sort()

  return [
    `p:${platform}`,
    `a:${arch}`,
    `c:${cpuModelUniq.join(',')}`,
    `m:${uniqMacs.join(',')}`
  ].join('|')
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function resolveFingerprintHash(): Promise<string> {
  if (!requestRendererValue) {
    return ''
  }
  const hash = await requestRendererValue<string>(
    AuthEvents.device.getFingerprintHash.toEventName()
  )
  return typeof hash === 'string' ? hash : ''
}

async function attestCurrentDevice(): Promise<boolean> {
  if (getRuntimeServerMode() === 'local') {
    return true
  }

  const token = await ensureFreshAccessToken('device-attestation')
  if (!token) {
    return false
  }

  const deviceId = getDeviceId()
  if (!deviceId) {
    return false
  }

  const appSettings = getMainConfig(StorageList.APP_SETTING) as AppSetting
  ensureSecuritySettings(appSettings)
  const seed = await getOrInitMachineSeed(appSettings)
  const fingerprint = extractFingerprint()
  const fingerprintHash = await resolveFingerprintHash()
  const machineCodeHash = sha256Hex(
    `${MACHINE_CODE_VERSION}|${seed}|${fingerprint}|${fingerprintHash || ''}`
  )

  const lastHash =
    typeof appSettings.security.machineCodeHash === 'string'
      ? appSettings.security.machineCodeHash.trim()
      : ''
  if (lastHash && lastHash === machineCodeHash) {
    return true
  }

  const payload: { machine_code_hash: string; fingerprint_hash?: string } = {
    machine_code_hash: machineCodeHash
  }
  if (fingerprintHash) {
    payload.fingerprint_hash = fingerprintHash
  }

  const url = new URL('/api/v1/devices/attest', resolveAuthBaseUrl()).toString()
  const response = await getNetworkService().request<string>({
    method: 'POST',
    url,
    headers: {
      Authorization: normalizeBearerToken(token),
      'content-type': 'application/json',
      'x-device-id': deviceId
    },
    body: payload,
    responseType: 'text',
    timeoutMs: AUTH_PROFILE_REQUEST_TIMEOUT_MS,
    retryPolicy: AUTH_NETWORK_NO_RETRY_POLICY
  })

  if (!response.ok) {
    throw new Error(`Attest failed: ${response.status} ${response.statusText}`)
  }

  appSettings.security.machineCodeHash = machineCodeHash
  appSettings.security.machineCodeAttestedAt = new Date().toISOString()
  saveMainConfig(StorageList.APP_SETTING, appSettings)
  return true
}

async function requestStepUp(): Promise<void> {
  const url = `${resolveAuthBaseUrl()}/auth/stepup-callback`
  await openPageExternally(url)
}

function setStepUpToken(token: string): void {
  const trimmed = token.trim()
  if (!trimmed) {
    return
  }
  stepUpToken = trimmed
  stepUpTokenExpiresAt = Date.now() + STEP_UP_TOKEN_TTL_MS
}
function clearStepUpToken(): void {
  stepUpToken = null
  stepUpTokenExpiresAt = 0
}

function getStepUpToken(): string | null {
  if (!stepUpToken) return null
  if (stepUpTokenExpiresAt && stepUpTokenExpiresAt <= Date.now()) {
    clearStepUpToken()
    return null
  }
  return stepUpToken
}

/**
 * Entry point for the `tuff://auth/callback` deep link.
 *
 * Only honoured while a browser login this app started is still in flight.
 * Without that check any page could navigate the user's browser to
 * `tuff://auth/callback?token=…` and silently swap the session to the
 * attacker's account — everything written afterwards lands in their account
 * (#695).
 *
 * `activeDeviceAuthCode` is the signal: openLoginPage sets it, and it is
 * cleared on cancel, on a completed poll and on poll failure, so the window is
 * bounded by a login the user actually initiated.
 *
 * This is not full state binding. It does not tie the callback to *which*
 * login is in flight, so an attacker who lands one while the user has a
 * genuine login open still wins. Closing that needs a nonce carried through
 * the browser round-trip, which means changing the nexus callback URL too —
 * tracked on the issue rather than half-done here.
 */
export async function applyExternalAuthCallback(
  token: string,
  appToken?: string,
  refreshToken?: string,
  ttlSeconds?: number
): Promise<boolean> {
  if (!activeDeviceAuthCode) {
    authLog.warn('Rejected auth callback with no login in flight', {
      meta: {
        hasToken: Boolean(token),
        hasAppToken: Boolean(appToken),
        hasRefreshToken: Boolean(refreshToken)
      }
    })
    return false
  }
  return handleExternalAuthCallback(token, appToken, refreshToken, ttlSeconds)
}

export function applyStepUpToken(token: string): void {
  setStepUpToken(token)
}

type AuthModuleTestState = {
  appRootPath?: string
  authToken?: string | null
  authRefreshToken?: string | null
  authAccessTokenExpiresAt?: number | null
}

function resetAuthModuleTestState(): void {
  if (authStartupRefreshTimer) {
    clearTimeout(authStartupRefreshTimer)
    authStartupRefreshTimer = null
  }
  clearAccessTokenRefreshTimer()
  authState.isLoaded = false
  authState.isSignedIn = false
  authState.user = null
  authState.sessionId = null
  authState.isSettled = false
  authStateListeners.clear()
  appRootPath = ''
  transport = null
  requestRendererValue = null
  authToken = null
  authRefreshToken = null
  authAccessTokenExpiresAt = null
  inMemoryCredentialBaseUrl = ''
  authCredentialGeneration += 1
  replaceAuthRequestIdentity('')
  authRefreshInFlight = null
  stepUpToken = null
  stepUpTokenExpiresAt = 0
  deviceAuthLoginAttempt += 1
  activeDeviceAuthCode = null
  activeDeviceAuthLogin = null
  wakeDeviceAuthPoll = null
  deviceAuthPollWaiters = []
  loginPageOpening = null
  authCredentialLoad = null
}

function setAuthModuleTestState(nextState: AuthModuleTestState): void {
  if (Object.prototype.hasOwnProperty.call(nextState, 'appRootPath')) {
    appRootPath = nextState.appRootPath ?? ''
  }
  if (Object.prototype.hasOwnProperty.call(nextState, 'authToken')) {
    authToken = nextState.authToken ?? null
  }
  if (Object.prototype.hasOwnProperty.call(nextState, 'authRefreshToken')) {
    authRefreshToken = nextState.authRefreshToken ?? null
  }
  if (Object.prototype.hasOwnProperty.call(nextState, 'authAccessTokenExpiresAt')) {
    authAccessTokenExpiresAt = nextState.authAccessTokenExpiresAt ?? null
  }
  replaceAuthRequestIdentity(
    resolveAuthRequestIdentity({
      accessToken: authToken ?? '',
      refreshToken: authRefreshToken,
      accessTokenExpiresAt: authAccessTokenExpiresAt
    })
  )
}

export const __test__ = {
  loadAuthToken,
  setAuthToken,
  refreshAccessToken,
  performNexusRequest,
  /** Lets a test put a browser login "in flight" without running the device flow. */
  setActiveDeviceAuthCode: (code: string | null): void => {
    activeDeviceAuthCode = code
  },
  clearAuthToken,
  /** Lets a test await the origin cleanup that `getAuthToken()` starts without awaiting. */
  dropCredentialIssuedByAnotherOrigin,
  initializeAuthState,
  getCachedAuthUser,
  getCredentialState: (): AuthCredentialState => ({
    accessToken: authToken ?? '',
    refreshToken: authRefreshToken,
    accessTokenExpiresAt: authAccessTokenExpiresAt
  }),
  getState: cloneAuthState,
  resetState: resetAuthModuleTestState,
  setState: setAuthModuleTestState
}

export class AuthModule extends BaseModule<TalexEvents> {
  static key: symbol = Symbol.for('AuthModule')
  name: ModuleKey = AuthModule.key
  private transportDisposers: Array<() => void> = []

  constructor() {
    super(AuthModule.key)
  }

  onInit(ctx: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    const runtime = resolveMainRuntime(ctx, 'AuthModule.onInit')
    appRootPath = runtime.app?.rootPath ?? ''
    if (!appRootPath) {
      throw new Error('[AuthModule] App root path unavailable')
    }

    const channel = runtime.channel
    if (!channel) {
      throw new Error('[AuthModule] TouchChannel not available on app context')
    }

    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    transport = getTuffTransportMain(channel, keyManager)

    requestRendererValue = async <T>(eventName: string): Promise<T | null> => {
      const channelProxy = channel as {
        sendMain?: (event: string, arg?: unknown) => Promise<unknown>
      }
      const sendMain = channelProxy.sendMain?.bind(channelProxy)
      if (!sendMain) {
        authLog.warn(`TouchChannel sendMain unavailable for ${eventName}`)
        return null
      }
      try {
        const response = await sendMain(eventName)
        if (response && typeof response === 'object' && 'data' in response) {
          return (response as { data?: T }).data ?? null
        }
        return (response as T) ?? null
      } catch (error) {
        authLog.warn(`Failed to resolve ${eventName}`, { error })
        return null
      }
    }

    this.transportDisposers.push(
      ...registerAuthHandler(AuthEvents.session.getState, async () => cloneAuthState()),
      ...registerAuthHandler(AuthEvents.session.login, async (payload: AuthLoginRequest) => {
        const mode = payload?.mode === 'sign-up' ? 'sign-up' : 'sign-in'
        const loginStart = await openLoginPage(mode)
        return loginStart ? { initiated: true, ...loginStart } : { initiated: false }
      }),
      ...registerAuthHandler(AuthEvents.session.checkPendingLogin, async () => ({
        status: await settlePendingDeviceAuth()
      })),
      ...registerAuthHandler(AuthEvents.session.cancelLogin, async () => {
        await cancelActiveDeviceAuth()
        return { success: true }
      }),
      ...registerAuthHandler(AuthEvents.session.logout, async () => {
        await cancelActiveDeviceAuth()
        await clearAuthToken()
        updateAuthState(null)
        return { success: true }
      }),
      ...registerAuthHandler(
        AuthEvents.profile.update,
        async (payload: AuthProfileUpdateRequest) => {
          const token = await ensureFreshAccessToken('profile-update')
          if (!token) {
            return null
          }
          const nextUser = await patchRemoteUserProfile(token, {
            name: payload?.displayName ?? null,
            bio: payload?.bio ?? null
          })
          updateAuthState(nextUser, authState.sessionId)
          return nextUser
        }
      ),
      ...registerAuthHandler(
        AuthEvents.profile.updateAvatar,
        async (payload: AuthAvatarUpdateRequest) => {
          const token = await ensureFreshAccessToken('profile-update')
          if (!token) {
            return null
          }
          const dataUrl = typeof payload?.dataUrl === 'string' ? payload.dataUrl : ''
          if (!dataUrl) {
            return null
          }
          const nextUser = await patchRemoteUserProfile(token, { image: dataUrl })
          updateAuthState(nextUser, authState.sessionId)
          return nextUser
        }
      ),
      ...registerAuthHandler(AuthEvents.device.attest, async () => {
        const success = await attestCurrentDevice()
        return { success }
      }),
      ...registerAuthHandler(AuthEvents.nexus.request, async (payload) =>
        performNexusRequest(payload)
      ),
      ...registerAuthHandler(AuthEvents.nexus.upload, async (payload) =>
        performNexusUpload(payload)
      ),
      ...registerAuthHandler(AuthEvents.token.manual, async (payload: AuthManualTokenRequest) => {
        const token =
          typeof payload?.appToken === 'string' && payload.appToken.trim()
            ? payload.appToken
            : payload?.token
        if (!token) {
          return { success: false }
        }
        await handleExternalAuthCallback(
          token,
          payload?.appToken,
          payload?.refreshToken,
          normalizePositiveTtlSeconds(payload?.ttlSeconds) ?? undefined
        )
        return { success: true }
      }),
      ...registerAuthHandler(AuthEvents.stepUp.request, async () => {
        await requestStepUp()
        return { initiated: true }
      }),
      ...registerAuthHandler(AuthEvents.stepUp.getToken, async () => getStepUpToken()),
      ...registerAuthHandler(AuthEvents.stepUp.clearToken, async () => {
        clearStepUpToken()
        return { success: true }
      }),
      ...registerAuthHandler(AccountEvents.auth.getToken, async () => authToken),
      ...registerAuthHandler(AccountEvents.device.getId, async () => getDeviceId()),
      ...registerAuthHandler(AccountEvents.sync.getEnabled, async () => getSyncEnabled()),
      ...registerAuthHandler(
        AccountEvents.sync.recordActivity,
        async (payload: AccountRecordSyncActivityRequest) => {
          const kind = payload?.kind === 'pull' ? 'pull' : payload?.kind === 'push' ? 'push' : ''
          if (!kind) {
            return false
          }
          return recordSyncActivity(kind)
        }
      ),
      ...registerAuthHandler(
        AccountEvents.account.getProfile,
        withAccountReadPermission(async () =>
          authState.user ? mapAuthUserToProfile(authState.user) : null
        )
      ),
      ...registerAuthHandler(
        AccountEvents.account.getSubscription,
        withAccountReadPermission(async () => fetchAccountSubscription())
      ),
      ...registerAuthHandler(
        AccountEvents.account.getUsage,
        withAccountReadPermission(async () => fetchAccountUsage())
      ),
      ...registerAuthHandler(
        AccountEvents.account.getFeatures,
        withAccountReadPermission(async () => fetchAccountFeatures())
      ),
      ...registerAuthHandler(
        AccountEvents.account.getTeams,
        withAccountReadPermission(async () => fetchAccountTeams())
      ),
      ...registerAuthHandler(AccountEvents.account.getSessions, async () => []),
      ...registerAuthHandler(AccountEvents.account.getInfo, async () => null),
      // Opening a page reveals nothing, but a plugin opens the browser only with a permission.
      ...registerAuthHandler(
        AccountEvents.account.openUpgrade,
        withAccountReadPermission(async (payload) =>
          openAccountDashboard(ACCOUNT_PAGES.upgrade, resolveUpgradePlanQuery(payload))
        )
      ),
      ...registerAuthHandler(
        AccountEvents.account.openBilling,
        withAccountReadPermission(async () => openAccountDashboard(ACCOUNT_PAGES.billing))
      ),
      ...registerAuthHandler(
        AccountEvents.account.openSettings,
        withAccountReadPermission(async () => openAccountDashboard(ACCOUNT_PAGES.settings))
      ),
      ...registerAuthHandler(
        AccountEvents.account.openProfile,
        withAccountReadPermission(async () => openAccountDashboard(ACCOUNT_PAGES.profile))
      ),
      ...registerAuthHandler(
        AccountEvents.account.requestLogin,
        withAccountReadPermission(async () => requestLoginForPlugin())
      ),
      ...registerAuthHandler(AccountEvents.account.logout, async () => {
        await cancelActiveDeviceAuth()
        await clearAuthToken()
        updateAuthState(null)
      })
    )
    if (transport) {
      const checkAccountRead = withAccountReadPermission(async () => undefined)
      this.transportDisposers.push(
        transport.onStream(AccountEvents.session.changed, async (payload, context) => {
          try {
            await checkAccountRead(payload, context as unknown as HandlerContext)
          } catch (error) {
            if (!context.isCancelled()) {
              context.error(toAccountStreamFailure(error))
            }
            return
          }
          watchAccountSession(context)
        })
      )
    }

    const credentialLoad = loadAuthToken()
    authCredentialLoad = credentialLoad
    void (async () => {
      await credentialLoad
      ensureDeviceProfile()
      await initializeAuthState()
    })()
  }

  onDestroy(): MaybePromise<void> {
    if (authStartupRefreshTimer) {
      clearTimeout(authStartupRefreshTimer)
      authStartupRefreshTimer = null
    }
    for (const dispose of this.transportDisposers) {
      try {
        dispose()
      } catch {
        // ignore
      }
    }
    this.transportDisposers = []
    transport = null
    requestRendererValue = null
  }
}

export const authModule = new AuthModule()
