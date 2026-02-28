import type { AuthState, AuthUser } from '@talex-touch/utils/auth'
import type { MaybePromise, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { StorageList } from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { appSettingOriginData } from '@talex-touch/utils/common/storage/entity/app-settings'
import { getTuffBaseUrl, isDevEnv } from '@talex-touch/utils/env'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { randomUUID, createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { safeStorage, shell } from 'electron'
import { BaseModule } from '../abstract-base-module'
import { getMainConfig, saveMainConfig, subscribeMainConfig } from '../storage'

const authLog = getLogger('auth')

const SECURE_STORE_FILE = 'secure-store.json'
const AUTH_TOKEN_KEY = 'auth.token'
const MACHINE_SEED_SECURE_KEY = 'sync.machine-seed.v1'
const MACHINE_CODE_VERSION = 'mc_v1'
const STEP_UP_TOKEN_TTL_MS = 10 * 60 * 1000
const AUTH_PROFILE_REQUEST_TIMEOUT_MS = 4_000
const AUTH_PROFILE_STARTUP_REFRESH_DELAY_MS = 6_000
const LOCAL_AUTH_BASE_URL = 'http://localhost:3200'

type AuthStateListener = (state: AuthState) => void

type NexusRequestPayload = {
  url?: string
  path?: string
  method?: string
  headers?: Record<string, string>
  body?: string
  context?: string
}

type NexusResponsePayload = {
  status: number
  statusText: string
  headers: Record<string, string>
  url: string
  body: string
}

const authState: AuthState = {
  isLoaded: false,
  isSignedIn: false,
  user: null,
  sessionId: null
}

const authStateListeners = new Set<AuthStateListener>()

let appRootPath = ''
let transport: ITuffTransportMain | null = null
let requestRendererValue: (<T>(eventName: string) => Promise<T | null>) | null = null

let authToken: string | null = null
let authUseSecureStorage = false
let stepUpToken: string | null = null
let stepUpTokenExpiresAt = 0
let authStartupRefreshTimer: NodeJS.Timeout | null = null

const authGetStateEvent = defineRawEvent<void, AuthState>('auth:get-state')
const authLoginEvent = defineRawEvent<{ mode?: 'sign-in' | 'sign-up' }, { initiated: boolean }>(
  'auth:login'
)
const authLogoutEvent = defineRawEvent<void, { success: boolean }>('auth:logout')
const authUpdateProfileEvent = defineRawEvent<
  { displayName?: string; bio?: string },
  AuthUser | null
>('auth:update-profile')
const authUpdateAvatarEvent = defineRawEvent<{ dataUrl: string }, AuthUser | null>(
  'auth:update-avatar'
)
const authAttestDeviceEvent = defineRawEvent<void, { success: boolean }>('auth:attest-device')
const authNexusRequestEvent = defineRawEvent<NexusRequestPayload, NexusResponsePayload | null>(
  'auth:nexus-request'
)
const authStateChangedEvent = defineRawEvent<AuthState, void>('auth:state-changed')
const authManualTokenEvent = defineRawEvent<
  { token: string; appToken?: string },
  { success: boolean }
>('auth:manual-token')
const authRequestStepUpEvent = defineRawEvent<void, { initiated: boolean }>('auth:request-stepup')
const authGetStepUpTokenEvent = defineRawEvent<void, string | null>('auth:get-stepup-token')
const authClearStepUpTokenEvent = defineRawEvent<void, { success: boolean }>(
  'auth:clear-stepup-token'
)
const accountGetAuthTokenEvent = defineRawEvent<void, string | null>('account:get-auth-token')
const accountGetDeviceIdEvent = defineRawEvent<void, string | null>('account:get-device-id')
const accountGetSyncEnabledEvent = defineRawEvent<void, boolean>('account:get-sync-enabled')
const accountRecordSyncActivityEvent = defineRawEvent<{ kind?: string }, boolean>(
  'account:record-sync-activity'
)

function cloneAuthState(): AuthState {
  return {
    isLoaded: authState.isLoaded,
    isSignedIn: authState.isSignedIn,
    user: authState.user ? { ...authState.user } : null,
    sessionId: authState.sessionId
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
    transport.broadcast(authStateChangedEvent, snapshot)
  }
}

export function subscribeAuthState(listener: AuthStateListener): () => void {
  authStateListeners.add(listener)
  return () => {
    authStateListeners.delete(listener)
  }
}

export function getAuthToken(): string | null {
  return authToken
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
  const appSettings = getMainConfig(StorageList.APP_SETTING) as AppSetting
  const localAuth = isDevEnv() && appSettings?.dev?.authServer === 'local'
  return localAuth ? LOCAL_AUTH_BASE_URL : getTuffBaseUrl()
}

function normalizeBearerToken(token: string): string {
  const trimmed = token.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('Bearer ') ? trimmed : `Bearer ${trimmed}`
}

function resolveSecureStorePath(): string {
  if (!appRootPath) {
    throw new Error('[AuthModule] App root path is not ready')
  }
  return path.join(appRootPath, 'config', SECURE_STORE_FILE)
}

async function readSecureStoreFile(): Promise<Record<string, string>> {
  const storePath = resolveSecureStorePath()
  try {
    const raw = await fs.readFile(storePath, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const store: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        store[key] = value
      }
    }
    return store
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return {}
    }
    authLog.warn('Failed to read secure store file', { error })
    return {}
  }
}

async function writeSecureStoreFile(store: Record<string, string>): Promise<void> {
  const storePath = resolveSecureStorePath()
  await fs.mkdir(path.dirname(storePath), { recursive: true })
  await fs.writeFile(storePath, JSON.stringify(store), 'utf-8')
}

async function getSecureValue(key: string): Promise<string | null> {
  if (!safeStorage.isEncryptionAvailable()) {
    return null
  }
  const store = await readSecureStoreFile()
  const encrypted = store[key]
  if (!encrypted) {
    return null
  }
  try {
    const buffer = Buffer.from(encrypted, 'base64')
    return safeStorage.decryptString(buffer)
  } catch (error) {
    authLog.warn('Failed to decrypt secure value', { error })
    return null
  }
}

async function setSecureValue(key: string, value: string | null): Promise<boolean> {
  if (!safeStorage.isEncryptionAvailable()) {
    return false
  }
  const store = await readSecureStoreFile()
  if (!value) {
    delete store[key]
    await writeSecureStoreFile(store)
    return true
  }
  const encrypted = safeStorage.encryptString(value).toString('base64')
  store[key] = encrypted
  await writeSecureStoreFile(store)
  return true
}

function updateAuthState(nextUser: AuthUser | null, sessionId?: string | null): void {
  authState.isLoaded = true
  authState.isSignedIn = Boolean(nextUser)
  authState.user = nextUser
  authState.sessionId = sessionId ?? null
  setCachedAuthUser(nextUser)
  notifyAuthStateChanged()
}

async function loadAuthToken(): Promise<void> {
  authUseSecureStorage = isAuthTokenSecureStorageEnabled()

  if (!authUseSecureStorage) {
    authToken = null
    await setSecureValue(AUTH_TOKEN_KEY, null)
    return
  }

  authToken = await getSecureValue(AUTH_TOKEN_KEY)
  if (!safeStorage.isEncryptionAvailable()) {
    authLog.warn('Secure storage unavailable; auth token will only remain in memory')
  }
}

async function setAuthToken(nextToken: string): Promise<void> {
  authToken = nextToken
  if (!authUseSecureStorage) {
    return
  }
  await setSecureValue(AUTH_TOKEN_KEY, nextToken)
}

async function clearAuthToken(): Promise<void> {
  authToken = null
  await setSecureValue(AUTH_TOKEN_KEY, null)
}

function ensureSecuritySettings(appSettings: AppSetting): void {
  if (!appSettings.security) {
    appSettings.security = {
      machineSeed: '',
      machineCodeHash: '',
      machineCodeAttestedAt: '',
      machineSeedMigratedAt: '',
      allowLegacyMachineSeedFallback: false
    }
  }
}

function ensureAuthSettings(appSettings: AppSetting): void {
  if (!appSettings.auth) {
    appSettings.auth = {
      deviceId: '',
      deviceName: '',
      devicePlatform: '',
      useSecureStorage: false,
      secureStorageReminderShown: false
    }
    return
  }

  const authSettings = appSettings.auth as {
    useSecureStorage?: unknown
    secureStorageReminderShown?: unknown
  }

  if (typeof authSettings.useSecureStorage !== 'boolean') {
    authSettings.useSecureStorage = false
  }
  if (typeof authSettings.secureStorageReminderShown !== 'boolean') {
    authSettings.secureStorageReminderShown = false
  }
}

function isAuthTokenSecureStorageEnabled(appSettings?: AppSetting): boolean {
  const resolvedSettings = appSettings ?? (getMainConfig(StorageList.APP_SETTING) as AppSetting)
  ensureAuthSettings(resolvedSettings)
  const authSettings = resolvedSettings.auth as { useSecureStorage?: unknown }
  return authSettings.useSecureStorage === true
}

async function handleAuthStoragePreferenceChanged(nextAppSetting: AppSetting): Promise<void> {
  const nextEnabled = isAuthTokenSecureStorageEnabled(nextAppSetting)
  if (nextEnabled === authUseSecureStorage) {
    return
  }

  authUseSecureStorage = nextEnabled
  if (!authUseSecureStorage) {
    await setSecureValue(AUTH_TOKEN_KEY, null)
    authLog.info('Auth secure storage disabled by user preference; using session-only token mode')
    return
  }

  if (!authToken) {
    return
  }

  const persisted = await setSecureValue(AUTH_TOKEN_KEY, authToken)
  if (!persisted) {
    authLog.warn('Secure storage unavailable; token cannot be persisted yet')
    return
  }
  authLog.info('Auth secure storage enabled by user preference')
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

async function fetchRemoteUser(
  token: string,
  signal?: AbortSignal
): Promise<FetchRemoteUserResult> {
  try {
    const url = new URL('/api/v1/auth/me', resolveAuthBaseUrl()).toString()
    const response = await fetch(url, {
      headers: { Authorization: normalizeBearerToken(token) },
      signal
    })
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { kind: 'unauthorized' }
      }
      return { kind: 'unavailable' }
    }
    const data = (await response.json()) as AuthUser
    return { kind: 'success', user: toAuthUserProfile(data) }
  } catch {
    return { kind: 'unavailable' }
  }
}

async function fetchRemoteUserWithTimeout(token: string): Promise<FetchRemoteUserResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AUTH_PROFILE_REQUEST_TIMEOUT_MS)
  try {
    return await fetchRemoteUser(token, controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

async function refreshAuthStateFromRemote(): Promise<void> {
  if (!authToken) {
    updateAuthState(null)
    return
  }

  const remoteResult = await fetchRemoteUserWithTimeout(authToken)
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

function scheduleAuthStartupRefresh(delayMs = AUTH_PROFILE_STARTUP_REFRESH_DELAY_MS): void {
  if (authStartupRefreshTimer) {
    clearTimeout(authStartupRefreshTimer)
  }

  authStartupRefreshTimer = setTimeout(() => {
    authStartupRefreshTimer = null
    void refreshAuthStateFromRemote()
  }, delayMs)
}

async function patchRemoteUserProfile(
  token: string,
  payload: { name?: string | null; bio?: string | null; image?: string | null }
): Promise<AuthUser> {
  const url = new URL('/api/v1/auth/profile', resolveAuthBaseUrl()).toString()
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: normalizeBearerToken(token)
    },
    body: JSON.stringify(payload)
  })
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }
  const data = (await response.json()) as AuthUser
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
  if (!authToken) {
    updateAuthState(null)
    return
  }
  const cachedUser = getCachedAuthUser()
  if (cachedUser) {
    updateAuthState(cachedUser, authState.sessionId)
  }
  scheduleAuthStartupRefresh()
}

async function openLoginPage(mode: 'sign-in' | 'sign-up' = 'sign-in'): Promise<void> {
  const { deviceId, deviceName, devicePlatform } = ensureDeviceProfile()
  const nexusUrl = resolveAuthBaseUrl()
  const redirectUrl = new URL('/auth/app-callback', nexusUrl)
  if (deviceId) {
    redirectUrl.searchParams.set('device_id', deviceId)
  }
  if (deviceName) {
    redirectUrl.searchParams.set('device_name', deviceName)
  }
  if (devicePlatform) {
    redirectUrl.searchParams.set('device_platform', devicePlatform)
  }

  const entry = mode === 'sign-up' ? '/sign-up' : '/sign-in'
  const url = new URL(entry, nexusUrl)
  url.searchParams.set('redirect_url', redirectUrl.pathname + redirectUrl.search)
  await shell.openExternal(url.toString())
}

async function handleExternalAuthCallback(token: string, appToken?: string): Promise<boolean> {
  const resolvedToken = appToken || token
  if (!resolvedToken) {
    return false
  }
  await setAuthToken(resolvedToken)
  const remoteResult = await fetchRemoteUserWithTimeout(resolvedToken)
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

  updateAuthState(null)
  scheduleAuthStartupRefresh(2_000)
  return true
}

function normalizeHeaders(headers: Headers): Record<string, string> {
  const normalized: Record<string, string> = {}
  headers.forEach((value, key) => {
    normalized[key] = value
  })
  return normalized
}

async function performNexusRequest(
  payload: NexusRequestPayload
): Promise<NexusResponsePayload | null> {
  const token = authToken
  if (!token) {
    return null
  }
  const rawUrl = payload.url
  const rawPath = payload.path
  if (!rawUrl && !rawPath) {
    throw new Error('Missing request url/path')
  }
  const url = rawUrl ? rawUrl : new URL(rawPath ?? '', resolveAuthBaseUrl()).toString()
  const method = payload.method ? payload.method.toUpperCase() : 'GET'
  const headers = new Headers(payload.headers ?? {})
  headers.set('Authorization', normalizeBearerToken(token))

  const response = await fetch(url, {
    method,
    headers,
    body: payload.body
  })

  if (response.status === 401) {
    await clearAuthToken()
    updateAuthState(null)
  }

  const body = await response.text()

  return {
    status: response.status,
    statusText: response.statusText,
    headers: normalizeHeaders(response.headers),
    url: response.url || url,
    body
  }
}

function allowLegacyMachineSeedFallback(appSettings: AppSetting): boolean {
  ensureSecuritySettings(appSettings)
  return appSettings.security.allowLegacyMachineSeedFallback === true
}

async function getOrInitMachineSeed(appSettings: AppSetting): Promise<string> {
  ensureSecuritySettings(appSettings)
  const legacySeed =
    typeof appSettings.security.machineSeed === 'string'
      ? appSettings.security.machineSeed.trim()
      : ''

  try {
    const secureSeed = (await getSecureValue(MACHINE_SEED_SECURE_KEY))?.trim() ?? ''
    if (secureSeed) {
      if (legacySeed) {
        appSettings.security.machineSeed = ''
        appSettings.security.machineSeedMigratedAt = new Date().toISOString()
        saveMainConfig(StorageList.APP_SETTING, appSettings)
      }
      return secureSeed
    }

    const nextSeed = legacySeed || randomUUID().replace(/-/g, '')
    await setSecureValue(MACHINE_SEED_SECURE_KEY, nextSeed)
    if (legacySeed) {
      appSettings.security.machineSeed = ''
      appSettings.security.machineSeedMigratedAt = new Date().toISOString()
      saveMainConfig(StorageList.APP_SETTING, appSettings)
    }
    return nextSeed
  } catch {
    if (allowLegacyMachineSeedFallback(appSettings) && legacySeed) {
      return legacySeed
    }
    if (allowLegacyMachineSeedFallback(appSettings)) {
      const nextSeed = randomUUID().replace(/-/g, '')
      appSettings.security.machineSeed = nextSeed
      saveMainConfig(StorageList.APP_SETTING, appSettings)
      return nextSeed
    }
    throw new Error('Secure machine seed unavailable')
  }
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
  const hash = await requestRendererValue<string>('auth:get-fingerprint-hash')
  return typeof hash === 'string' ? hash : ''
}

async function attestCurrentDevice(): Promise<boolean> {
  if (isDevEnv()) {
    const appSettings = getMainConfig(StorageList.APP_SETTING) as AppSetting
    if (appSettings?.dev?.authServer === 'local') {
      return true
    }
  }

  const token = authToken
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
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: normalizeBearerToken(token),
      'content-type': 'application/json',
      'x-device-id': deviceId
    },
    body: JSON.stringify(payload)
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
  await shell.openExternal(url)
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

export async function applyExternalAuthCallback(
  token: string,
  appToken?: string
): Promise<boolean> {
  return handleExternalAuthCallback(token, appToken)
}

export function applyStepUpToken(token: string): void {
  setStepUpToken(token)
}

export class AuthModule extends BaseModule<TalexEvents> {
  static key: symbol = Symbol.for('AuthModule')
  name: ModuleKey = AuthModule.key
  private transportDisposers: Array<() => void> = []
  private appSettingUnsubscribe: (() => void) | null = null

  constructor() {
    super(AuthModule.key)
  }

  onInit({ app }: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    appRootPath =
      app?.rootPath ?? ($app as { rootPath?: string } | null | undefined)?.rootPath ?? ''
    if (!appRootPath) {
      throw new Error('[AuthModule] App root path unavailable')
    }

    const channel =
      (app as { channel?: unknown } | null | undefined)?.channel ??
      ($app as { channel?: unknown } | null | undefined)?.channel
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
      transport.on(authGetStateEvent, async () => cloneAuthState()),
      transport.on(authLoginEvent, async (payload) => {
        const mode = payload?.mode === 'sign-up' ? 'sign-up' : 'sign-in'
        await openLoginPage(mode)
        return { initiated: true }
      }),
      transport.on(authLogoutEvent, async () => {
        await clearAuthToken()
        updateAuthState(null)
        return { success: true }
      }),
      transport.on(authUpdateProfileEvent, async (payload) => {
        const token = authToken
        if (!token) {
          return null
        }
        const nextUser = await patchRemoteUserProfile(token, {
          name: payload?.displayName ?? null,
          bio: payload?.bio ?? null
        })
        updateAuthState(nextUser, authState.sessionId)
        return nextUser
      }),
      transport.on(authUpdateAvatarEvent, async (payload) => {
        const token = authToken
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
      }),
      transport.on(authAttestDeviceEvent, async () => {
        const success = await attestCurrentDevice()
        return { success }
      }),
      transport.on(authNexusRequestEvent, async (payload) => performNexusRequest(payload)),
      transport.on(authManualTokenEvent, async (payload) => {
        const token =
          typeof payload?.appToken === 'string' && payload.appToken.trim()
            ? payload.appToken
            : payload?.token
        if (!token) {
          return { success: false }
        }
        await handleExternalAuthCallback(token, payload?.appToken)
        return { success: true }
      }),
      transport.on(authRequestStepUpEvent, async () => {
        await requestStepUp()
        return { initiated: true }
      }),
      transport.on(authGetStepUpTokenEvent, async () => getStepUpToken()),
      transport.on(authClearStepUpTokenEvent, async () => {
        clearStepUpToken()
        return { success: true }
      }),
      transport.on(accountGetAuthTokenEvent, async () => authToken),
      transport.on(accountGetDeviceIdEvent, async () => getDeviceId()),
      transport.on(accountGetSyncEnabledEvent, async () => getSyncEnabled()),
      transport.on(accountRecordSyncActivityEvent, async (payload) => {
        const kind = payload?.kind === 'pull' ? 'pull' : payload?.kind === 'push' ? 'push' : ''
        if (!kind) {
          return false
        }
        return recordSyncActivity(kind)
      })
    )

    if (!this.appSettingUnsubscribe) {
      this.appSettingUnsubscribe = subscribeMainConfig(StorageList.APP_SETTING, (data) => {
        void handleAuthStoragePreferenceChanged(data as AppSetting)
      })
    }

    void (async () => {
      await loadAuthToken()
      ensureDeviceProfile()
      await initializeAuthState()
    })()
  }

  onDestroy(): MaybePromise<void> {
    if (authStartupRefreshTimer) {
      clearTimeout(authStartupRefreshTimer)
      authStartupRefreshTimer = null
    }
    if (this.appSettingUnsubscribe) {
      this.appSettingUnsubscribe()
      this.appSettingUnsubscribe = null
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
