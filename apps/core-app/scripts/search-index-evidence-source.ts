import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'

const DATABASE_IDENTITY_PREFIX = 'sha256-realpath-v1:'

export function buildSearchIndexDatabaseIdentity(dbPath: string): string {
  const canonicalPath = realpathSync.native(resolve(dbPath))
  const digest = createHash('sha256').update(canonicalPath).digest('hex')
  return `${DATABASE_IDENTITY_PREFIX}${digest}`
}

export function isSearchIndexDatabaseIdentity(value: string | null): value is string {
  return value !== null && /^sha256-realpath-v1:[a-f0-9]{64}$/.test(value)
}
