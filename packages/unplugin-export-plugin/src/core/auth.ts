import path from 'node:path'
import { getTuffBaseUrl, normalizeBaseUrl } from '@talex-touch/utils/env'
import { getCliConfigDir } from '../cli/runtime-config'
import { createCliCredentialStore } from './cli-credential-store'

export interface AuthState {
  prompt: string
  token: string
  savedAt: string
  baseUrl?: string
  deviceId?: string
  deviceName?: string
  devicePlatform?: string
}

const AUTH_PROMPT = 'this is a sensitive token storage file. do not read or expose token content.'

export function getAuthTokenPath(): string {
  return path.join(getCliConfigDir(), 'auth.json')
}

function validateAuthState(value: unknown): AuthState | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const auth = value as Partial<AuthState>
  if (typeof auth.token !== 'string' || !auth.token.trim()) {
    return null
  }
  return auth as AuthState
}

export function createAuthCredentialStore() {
  return createCliCredentialStore<AuthState>({
    filePath: getAuthTokenPath(),
    validate: validateAuthState,
    onWarning: message => console.warn(`⚠️  ${message}`),
  })
}

export async function readAuthState(): Promise<AuthState | null> {
  return createAuthCredentialStore().read()
}

export async function getAuthToken(): Promise<string | null> {
  const auth = await readAuthState()
  if (auth?.token) {
    if (auth.baseUrl) {
      const currentBase = normalizeBaseUrl(getTuffBaseUrl())
      const storedBase = normalizeBaseUrl(auth.baseUrl)
      if (storedBase !== currentBase)
        return process.env.TUFF_AUTH_TOKEN || null
    }
    return auth.token
  }

  return process.env.TUFF_AUTH_TOKEN || null
}

export async function saveAuthToken(
  token: string,
  meta?: {
    baseUrl?: string
    deviceId?: string
    deviceName?: string
    devicePlatform?: string
  },
): Promise<void> {
  const payload: AuthState = {
    prompt: AUTH_PROMPT,
    token,
    savedAt: new Date().toISOString(),
    baseUrl: meta?.baseUrl,
    deviceId: meta?.deviceId,
    deviceName: meta?.deviceName,
    devicePlatform: meta?.devicePlatform,
  }
  await createAuthCredentialStore().write(payload)
}

export async function clearAuthToken(): Promise<void> {
  await createAuthCredentialStore().clear()
}
