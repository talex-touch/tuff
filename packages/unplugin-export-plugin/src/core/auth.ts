import path from 'node:path'
import process from 'node:process'
import fs from 'fs-extra'

export interface AuthState {
  token: string
  savedAt: string
}

function getHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || process.cwd()
}

export function getAuthTokenPath(): string {
  return path.join(getHomeDir(), '.tuff', 'auth.json')
}

export async function getAuthToken(): Promise<string | null> {
  const tokenPath = getAuthTokenPath()

  try {
    if (await fs.pathExists(tokenPath)) {
      const auth = await fs.readJson(tokenPath)
      return auth.token || null
    }
  }
  catch {
    // Ignore
  }

  return process.env.TUFF_AUTH_TOKEN || null
}

export async function saveAuthToken(token: string): Promise<void> {
  const tuffDir = path.join(getHomeDir(), '.tuff')
  await fs.ensureDir(tuffDir)

  const tokenPath = getAuthTokenPath()
  const payload: AuthState = { token, savedAt: new Date().toISOString() }
  await fs.writeJson(tokenPath, payload)
}
