import axios from 'axios'
import chalk from 'chalk'

export interface OfficialPluginVersionEntry {
  version: string
  path: string
  timestamp?: string
}

export interface OfficialPluginMetadata {
  readme_path?: string
  [key: string]: unknown
}

export interface OfficialPluginManifestEntry {
  id: string
  name: string
  author?: string
  version: string
  category?: string
  description?: string
  path: string
  timestamp?: string
  metadata?: OfficialPluginMetadata
  versions?: OfficialPluginVersionEntry[]
}

export interface OfficialPluginEntry extends OfficialPluginManifestEntry {
  downloadUrl: string
  readmeUrl?: string
  official: true
}

export interface OfficialPluginResponse {
  plugins: OfficialPluginEntry[]
  fetchedAt: number
  fromCache: boolean
  etag?: string
  lastModified?: string
}

const OFFICIAL_REPO_MANIFEST_URL =
  'https://raw.githubusercontent.com/talex-touch/tuff-official-plugins/main/plugins.json'
const OFFICIAL_REPO_BASE_URL =
  'https://raw.githubusercontent.com/talex-touch/tuff-official-plugins/main/'
const CACHE_TTL_MS = 1000 * 60 * 30 // 30 minutes

let cached: OfficialPluginEntry[] | null = null
let cachedAt = 0
let cachedEtag = ''
let cachedLastModified = ''

const logLabel = chalk.blue('[OfficialPluginService]')

function isManifestEntryArray(value: unknown): value is OfficialPluginManifestEntry[] {
  return Array.isArray(value)
}

function toOfficialEntry(entry: OfficialPluginManifestEntry): OfficialPluginEntry {
  const normalizedPath = entry.path.replace(/^\//, '')
  const downloadUrl = new URL(normalizedPath, OFFICIAL_REPO_BASE_URL).toString()

  let readmeUrl: string | undefined
  const readmePath = entry.metadata?.readme_path
  if (readmePath && readmePath.trim().length > 0) {
    const normalizedReadmePath = readmePath.replace(/^\//, '')
    readmeUrl = new URL(normalizedReadmePath, OFFICIAL_REPO_BASE_URL).toString()
  }

  return {
    ...entry,
    downloadUrl,
    readmeUrl,
    official: true
  }
}

interface FetchOptions {
  force?: boolean
}

export async function getOfficialPlugins(
  options: FetchOptions = {}
): Promise<OfficialPluginResponse> {
  const { force = false } = options
  const now = Date.now()

  if (!force && cached && now - cachedAt < CACHE_TTL_MS) {
    return {
      plugins: cached,
      fetchedAt: cachedAt,
      fromCache: true,
      etag: cachedEtag,
      lastModified: cachedLastModified
    }
  }

  const headers: Record<string, string> = {
    Accept: 'application/json'
  }

  if (!force && cached) {
    if (cachedEtag) headers['If-None-Match'] = cachedEtag
    if (cachedLastModified) headers['If-Modified-Since'] = cachedLastModified
  }

  try {
    const response = await axios.get(OFFICIAL_REPO_MANIFEST_URL, {
      headers,
      timeout: 15_000,
      proxy: false,
      validateStatus: (status) => (status >= 200 && status < 300) || status === 304
    })

    if (response.status === 304 && cached) {
      cachedAt = now
      return {
        plugins: cached,
        fetchedAt: cachedAt,
        fromCache: true,
        etag: cachedEtag,
        lastModified: cachedLastModified
      }
    }

    if (!isManifestEntryArray(response.data)) {
      throw new Error('Invalid manifest format received from official plugin repository')
    }

    const plugins = response.data.map(toOfficialEntry)

    cached = plugins
    cachedAt = now
    cachedEtag = response.headers.etag ?? cachedEtag
    cachedLastModified = response.headers['last-modified'] ?? cachedLastModified

    console.log(logLabel, `Fetched ${plugins.length} plugin(s) from official repository.`)

    return {
      plugins,
      fetchedAt: cachedAt,
      fromCache: false,
      etag: cachedEtag,
      lastModified: cachedLastModified
    }
  } catch (error: unknown) {
    console.error(logLabel, 'Failed to fetch official plugins:', error)

    if (cached) {
      console.warn(logLabel, 'Serving official plugins from cache due to fetch failure.')
      return {
        plugins: cached,
        fetchedAt: cachedAt,
        fromCache: true,
        etag: cachedEtag,
        lastModified: cachedLastModified
      }
    }

    throw error
  }
}

export function clearOfficialPluginCache(): void {
  cached = null
  cachedAt = 0
  cachedEtag = ''
  cachedLastModified = ''
}
