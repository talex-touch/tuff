import { Buffer } from 'node:buffer'
import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

export const SECURE_STORE_FILE = 'secure-store.json'
export const SECURE_STORE_KEY_PATTERN = /^[a-z0-9._-]{1,80}$/i

type WarnHandler = (message: string, error: unknown) => void
type ElectronSafeStorage = (typeof import('electron'))['safeStorage']
const requireFromCurrentModule = createRequire(import.meta.url)

function resolveSafeStorage(): ElectronSafeStorage | null {
  try {
    const electron = requireFromCurrentModule('electron') as typeof import('electron')
    return electron.safeStorage ?? null
  } catch {
    return null
  }
}

function normalizeSecureStoreKey(rawKey: string): string {
  const key = rawKey.trim()
  if (!SECURE_STORE_KEY_PATTERN.test(key)) {
    throw new Error('INVALID_SECURE_STORE_KEY')
  }
  return key
}

async function readSecureStoreFile(
  rootPath: string,
  warn?: WarnHandler
): Promise<Record<string, string>> {
  const storePath = path.join(rootPath, 'config', SECURE_STORE_FILE)
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
    warn?.('Failed to read secure store file', error)
    return {}
  }
}

async function writeSecureStoreFile(
  rootPath: string,
  store: Record<string, string>
): Promise<void> {
  const storePath = path.join(rootPath, 'config', SECURE_STORE_FILE)
  await fs.mkdir(path.dirname(storePath), { recursive: true })
  await fs.writeFile(storePath, JSON.stringify(store), 'utf-8')
}

export function isSecureStoreAvailable(): boolean {
  const safeStorage = resolveSafeStorage()
  return safeStorage?.isEncryptionAvailable() === true
}

export async function getSecureStoreValue(
  rootPath: string,
  rawKey: string,
  warn?: WarnHandler
): Promise<string | null> {
  const safeStorage = resolveSafeStorage()
  if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
    return null
  }

  const key = normalizeSecureStoreKey(rawKey)
  const store = await readSecureStoreFile(rootPath, warn)
  const encrypted = store[key]
  if (!encrypted) {
    return null
  }

  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch (error) {
    warn?.('Failed to decrypt secure store value', error)
    return null
  }
}

export async function setSecureStoreValue(
  rootPath: string,
  rawKey: string,
  value: string | null,
  warn?: WarnHandler
): Promise<boolean> {
  const safeStorage = resolveSafeStorage()
  if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
    return false
  }

  const key = normalizeSecureStoreKey(rawKey)
  const store = await readSecureStoreFile(rootPath, warn)
  if (!value) {
    delete store[key]
    await writeSecureStoreFile(rootPath, store)
    return true
  }

  store[key] = safeStorage.encryptString(value).toString('base64')
  await writeSecureStoreFile(rootPath, store)
  return true
}
