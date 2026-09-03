import { randomBytes } from 'node:crypto'
import { normalizeAbsolutePath } from '@talex-touch/utils/common/utils/safe-path'
import { toTfileUrl } from '@talex-touch/utils/network'
import { normalizeDarwinUsersPath } from '../../utils/local-file-policy'

const PREVIEW_GRANT_QUERY_KEY = 'previewGrant'
const PREVIEW_GRANT_TTL_MS = 5 * 60 * 1000
const PREVIEW_GRANT_LIMIT = 256

interface PreviewGrantRecord {
  path: string
  expiresAt: number
}

export interface TfilePreviewGrant {
  tfileUrl: string
  expiresAt: number
}

const grants = new Map<string, PreviewGrantRecord>()

function pruneExpiredGrants(now: number): void {
  for (const [token, grant] of grants) {
    if (grant.expiresAt <= now) grants.delete(token)
  }
}

function normalizeGrantedPath(filePath: string): string | null {
  const normalized = normalizeAbsolutePath(filePath)
  return normalized && normalized.length > 0 ? normalizeDarwinUsersPath(normalized) : null
}

function readGrantToken(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'tfile:') return null
    const token = parsed.searchParams.get(PREVIEW_GRANT_QUERY_KEY)?.trim()
    return token || null
  } catch {
    return null
  }
}

export function hasTfilePreviewGrant(rawUrl: string): boolean {
  return readGrantToken(rawUrl) !== null
}

export function issueTfilePreviewGrant(
  filePath: string,
  now: number = Date.now()
): TfilePreviewGrant {
  const normalizedPath = normalizeGrantedPath(filePath)
  if (!normalizedPath) throw new Error('TFILE_PREVIEW_PATH_INVALID')

  pruneExpiredGrants(now)
  while (grants.size >= PREVIEW_GRANT_LIMIT) {
    const oldest = grants.keys().next().value
    if (typeof oldest !== 'string') break
    grants.delete(oldest)
  }

  const token = `preview_${randomBytes(24).toString('base64url')}`
  const expiresAt = now + PREVIEW_GRANT_TTL_MS
  grants.set(token, { path: normalizedPath, expiresAt })

  const tfileUrl = new URL(toTfileUrl(normalizedPath))
  tfileUrl.searchParams.set(PREVIEW_GRANT_QUERY_KEY, token)
  return { tfileUrl: tfileUrl.toString(), expiresAt }
}

export function isTfilePreviewGrantAuthorized(
  rawUrl: string,
  filePath: string,
  now: number = Date.now()
): boolean {
  const token = readGrantToken(rawUrl)
  if (!token) return false

  const grant = grants.get(token)
  if (!grant) return false
  if (grant.expiresAt <= now) {
    grants.delete(token)
    return false
  }

  const normalizedPath = normalizeGrantedPath(filePath)
  return normalizedPath !== null && normalizedPath === grant.path
}

export function clearTfilePreviewGrants(): void {
  grants.clear()
}

export const __test__ = {
  PREVIEW_GRANT_QUERY_KEY,
  PREVIEW_GRANT_TTL_MS,
  PREVIEW_GRANT_LIMIT,
  grants
}
