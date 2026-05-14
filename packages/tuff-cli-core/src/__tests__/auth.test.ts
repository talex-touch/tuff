import os from 'node:os'
import path from 'node:path'
import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearAuthToken,
  getAuthToken,
  getAuthTokenPath,
  readAuthState,
  saveAuthToken,
} from '../auth'

async function modeOf(filePath: string): Promise<number> {
  const stats = await fs.stat(filePath)
  return stats.mode & 0o777
}

describe('auth credential store', () => {
  let tempDir: string
  let previousConfigDir: string | undefined
  let previousToken: string | undefined
  let previousBaseUrl: string | undefined

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-cli-auth-'))
    previousConfigDir = process.env.TUFF_CONFIG_DIR
    previousToken = process.env.TUFF_AUTH_TOKEN
    previousBaseUrl = process.env.TUFF_NEXUS_BASE_URL
    process.env.TUFF_CONFIG_DIR = tempDir
    delete process.env.TUFF_AUTH_TOKEN
    delete process.env.TUFF_NEXUS_BASE_URL
  })

  afterEach(async () => {
    if (previousConfigDir === undefined)
      delete process.env.TUFF_CONFIG_DIR
    else
      process.env.TUFF_CONFIG_DIR = previousConfigDir

    if (previousToken === undefined)
      delete process.env.TUFF_AUTH_TOKEN
    else
      process.env.TUFF_AUTH_TOKEN = previousToken

    if (previousBaseUrl === undefined)
      delete process.env.TUFF_NEXUS_BASE_URL
    else
      process.env.TUFF_NEXUS_BASE_URL = previousBaseUrl

    await fs.remove(tempDir)
  })

  it('saves and reads token state from the configured directory', async () => {
    await saveAuthToken('local-token', {
      baseUrl: 'https://tuff.tagzxia.com',
      deviceId: 'device-1',
    })

    expect(getAuthTokenPath()).toBe(path.join(tempDir, 'auth.json'))
    await expect(getAuthToken()).resolves.toBe('local-token')
    await expect(readAuthState()).resolves.toMatchObject({
      token: 'local-token',
      baseUrl: 'https://tuff.tagzxia.com',
      deviceId: 'device-1',
    })
  })

  it('secures auth file and directory permissions on POSIX', async () => {
    await saveAuthToken('secure-token')

    if (process.platform === 'win32') {
      return
    }

    await expect(modeOf(tempDir)).resolves.toBe(0o700)
    await expect(modeOf(getAuthTokenPath())).resolves.toBe(0o600)
  })

  it('falls back to env token when stored base URL does not match', async () => {
    await saveAuthToken('stored-token', { baseUrl: 'https://old.example.com' })
    process.env.TUFF_AUTH_TOKEN = 'env-token'
    process.env.TUFF_NEXUS_BASE_URL = 'https://new.example.com'

    await expect(getAuthToken()).resolves.toBe('env-token')
  })

  it('returns null when stored base URL does not match and env token is absent', async () => {
    await saveAuthToken('stored-token', { baseUrl: 'https://old.example.com' })
    process.env.TUFF_NEXUS_BASE_URL = 'https://new.example.com'

    await expect(getAuthToken()).resolves.toBeNull()
  })

  it('repairs overly permissive auth file mode while reading legacy JSON', async () => {
    await fs.ensureDir(tempDir)
    const tokenPath = getAuthTokenPath()
    await fs.writeJson(tokenPath, {
      prompt: 'legacy',
      token: 'legacy-token',
      savedAt: new Date().toISOString(),
    })

    if (process.platform !== 'win32') {
      await fs.chmod(tokenPath, 0o644)
    }

    await expect(readAuthState()).resolves.toMatchObject({ token: 'legacy-token' })
    if (process.platform !== 'win32') {
      await expect(modeOf(tokenPath)).resolves.toBe(0o600)
    }
  })

  it('clears auth token idempotently', async () => {
    await saveAuthToken('clear-token')
    await expect(fs.pathExists(getAuthTokenPath())).resolves.toBe(true)

    await clearAuthToken()
    await clearAuthToken()

    await expect(fs.pathExists(getAuthTokenPath())).resolves.toBe(false)
  })
})
