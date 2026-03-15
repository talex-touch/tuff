import path from 'node:path'
import process from 'node:process'
import { getTuffBaseUrl, normalizeBaseUrl } from '@talex-touch/utils/env'
import fs from 'fs-extra'
import { getCliConfigDir } from './runtime-config'

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

export async function readAuthState(): Promise<AuthState | null> {
  const tokenPath = getAuthTokenPath()

  try {
    if (await fs.pathExists(tokenPath)) {
      const auth = await fs.readJson(tokenPath)
      if (auth && typeof auth === 'object') {
        return auth as AuthState
      }
    }
  }
  catch {
    // Ignore
  }

  return null
}

export async function getAuthToken(): Promise<string | null> {
  const auth = await readAuthState()
  if (auth?.token) {
    if (auth.baseUrl) {
      const currentBase = normalizeBaseUrl(getTuffBaseUrl())
      const storedBase = normalizeBaseUrl(auth.baseUrl)
      if (storedBase !== currentBase)
        return null
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
  const tokenPath = getAuthTokenPath()
  await fs.ensureDir(path.dirname(tokenPath))
  const payload: AuthState = {
    prompt: AUTH_PROMPT,
    token,
    savedAt: new Date().toISOString(),
    baseUrl: meta?.baseUrl,
    deviceId: meta?.deviceId,
    deviceName: meta?.deviceName,
    devicePlatform: meta?.devicePlatform,
  }
  await fs.writeJson(tokenPath, payload, { spaces: 2 })
}

export async function clearAuthToken(): Promise<void> {
  const tokenPath = getAuthTokenPath()
  if (await fs.pathExists(tokenPath)) {
    await fs.remove(tokenPath)
  }
}
