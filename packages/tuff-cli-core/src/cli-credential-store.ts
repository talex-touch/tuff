import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import fs from 'fs-extra'

export interface CliCredentialStoreOptions<T> {
  filePath: string
  onWarning?: (message: string) => void
  validate?: (value: unknown) => T | null
}

export interface CliCredentialWriteResult {
  path: string
  directoryModeSecured: boolean
  fileModeSecured: boolean
  platform: NodeJS.Platform
  warning?: string
}

const DIRECTORY_MODE = 0o700
const FILE_MODE = 0o600
const POSIX_GROUP_OR_OTHER_MASK = 0o077

function isPosix(platform: NodeJS.Platform = process.platform): boolean {
  return platform !== 'win32'
}

async function chmodBestEffort(targetPath: string, mode: number): Promise<boolean> {
  try {
    await fs.chmod(targetPath, mode)
    return true
  }
  catch {
    return false
  }
}

async function secureDirectory(dirPath: string): Promise<boolean> {
  await fs.ensureDir(dirPath)
  if (!isPosix()) {
    return false
  }
  return chmodBestEffort(dirPath, DIRECTORY_MODE)
}

async function secureFile(filePath: string): Promise<boolean> {
  if (!isPosix()) {
    return false
  }
  return chmodBestEffort(filePath, FILE_MODE)
}

async function repairOverlyPermissiveFile(filePath: string, onWarning?: (message: string) => void): Promise<void> {
  if (!isPosix()) {
    return
  }

  try {
    const stats = await fs.stat(filePath)
    if ((stats.mode & POSIX_GROUP_OR_OTHER_MASK) === 0) {
      return
    }
    if (!await secureFile(filePath)) {
      onWarning?.(`Unable to restrict credential file permissions: ${filePath}`)
    }
  }
  catch {
    // Ignore unreadable metadata and let the caller decide whether JSON can be read.
  }
}

function getWindowsSecurityWarning(filePath: string): string | undefined {
  if (isPosix()) {
    return undefined
  }
  const homeDir = os.homedir()
  const normalizedFile = path.resolve(filePath)
  const normalizedHome = homeDir ? path.resolve(homeDir) : ''
  if (normalizedHome && normalizedFile.startsWith(normalizedHome)) {
    return undefined
  }
  return `Credential file is outside the current user profile; verify Windows ACLs manually: ${filePath}`
}

export function createCliCredentialStore<T>(options: CliCredentialStoreOptions<T>) {
  const { filePath, onWarning, validate } = options

  return {
    getPath(): string {
      return filePath
    },

    async read(): Promise<T | null> {
      try {
        if (!await fs.pathExists(filePath)) {
          return null
        }

        await repairOverlyPermissiveFile(filePath, onWarning)
        const raw = await fs.readJson(filePath)
        if (validate) {
          return validate(raw)
        }
        return raw as T
      }
      catch {
        return null
      }
    },

    async write(value: T): Promise<CliCredentialWriteResult> {
      const dirPath = path.dirname(filePath)
      const directoryModeSecured = await secureDirectory(dirPath)
      await fs.writeJson(filePath, value, { spaces: 2 })
      const fileModeSecured = await secureFile(filePath)
      const warning = getWindowsSecurityWarning(filePath)
      if (warning) {
        onWarning?.(warning)
      }
      return {
        path: filePath,
        directoryModeSecured,
        fileModeSecured,
        platform: process.platform,
        warning,
      }
    },

    async clear(): Promise<boolean> {
      if (!await fs.pathExists(filePath)) {
        return false
      }
      await fs.remove(filePath)
      return true
    },
  }
}
