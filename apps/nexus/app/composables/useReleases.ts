import type { Ref } from 'vue'
import { hasNavigator } from '@talex-touch/utils/env'

export type ReleaseChannel = 'RELEASE' | 'BETA' | 'SNAPSHOT'
export type ReleaseStatus = 'draft' | 'published' | 'archived'
export type AssetPlatform = 'darwin' | 'win32' | 'linux'
export type AssetArch = 'x64' | 'arm64' | 'universal'
export type AssetSourceType = 'github' | 'upload'
export type ReleaseNoteLocale = 'zh' | 'en'

export interface ReleaseNotes {
  zh: string
  en: string
}

export interface ReleaseAsset {
  id: string
  releaseId: string
  platform: AssetPlatform
  arch: AssetArch
  filename: string
  sourceType: AssetSourceType
  fileKey: string | null
  downloadUrl: string
  size: number
  sha256: string | null
  contentType: string
  downloadCount: number
  createdAt: string
  updatedAt: string
}

export interface AppRelease {
  id: string
  tag: string
  name: string
  channel: ReleaseChannel
  version: string
  notes: ReleaseNotes
  notesHtml?: ReleaseNotes | null
  status: ReleaseStatus
  publishedAt: string | null
  minAppVersion?: string | null
  isCritical: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
  assets?: ReleaseAsset[]
}

interface ReleasesResponse {
  releases: AppRelease[]
}

interface LatestReleaseResponse {
  release: AppRelease | null
  message?: string
}

interface ReleaseResponse {
  release: AppRelease
}

function normalizeReleaseNotes(input: unknown): ReleaseNotes {
  if (typeof input === 'string') {
    return { zh: input, en: input }
  }

  if (input && typeof input === 'object') {
    const zh = typeof (input as any).zh === 'string' ? (input as any).zh : ''
    const en = typeof (input as any).en === 'string' ? (input as any).en : ''
    const resolved = { zh: zh || en, en: en || zh }
    if (resolved.zh || resolved.en) {
      return resolved
    }
  }

  return { zh: '', en: '' }
}

function normalizeReleaseNotesHtml(input: unknown): ReleaseNotes | null {
  if (!input) {
    return null
  }
  const resolved = normalizeReleaseNotes(input)
  if (!resolved.zh && !resolved.en) {
    return null
  }
  return resolved
}

function normalizeRelease(release: AppRelease): AppRelease {
  const notes = normalizeReleaseNotes((release as any).notes)
  const notesHtml = normalizeReleaseNotesHtml((release as any).notesHtml)
  return {
    ...release,
    notes,
    notesHtml,
  }
}

export function resolveReleaseLocale(locale?: string): ReleaseNoteLocale {
  if (typeof locale === 'string' && locale.toLowerCase().startsWith('zh')) {
    return 'zh'
  }
  return 'en'
}

export function resolveReleaseNotes(notes: ReleaseNotes, locale?: string): string {
  const key = resolveReleaseLocale(locale)
  return notes[key] || notes.en || notes.zh
}

export function resolveReleaseNotesHtml(
  notesHtml: ReleaseNotes | null | undefined,
  notes: ReleaseNotes,
  locale?: string,
): string {
  if (notesHtml) {
    const key = resolveReleaseLocale(locale)
    return notesHtml[key] || notesHtml.en || notesHtml.zh
  }
  return resolveReleaseNotes(notes, locale)
}

export function useReleases() {
  const releases = ref<AppRelease[]>([]) as Ref<AppRelease[]>
  const loading = ref(false)
  const error = ref<Error | null>(null)

  async function fetchReleases(options: {
    channel?: ReleaseChannel
    status?: ReleaseStatus
    includeAssets?: boolean
    limit?: number
  } = {}) {
    loading.value = true
    error.value = null

    try {
      const params = new URLSearchParams()
      if (options.channel)
        params.set('channel', options.channel)
      if (options.status)
        params.set('status', options.status)
      if (options.includeAssets)
        params.set('assets', 'true')
      if (options.limit)
        params.set('limit', options.limit.toString())

      const queryString = params.toString()
      const url = `/api/releases${queryString ? `?${queryString}` : ''}`

      const data = await $fetch<ReleasesResponse>(url)
      const normalized = data.releases.map(normalizeRelease)
      releases.value = normalized
      return normalized
    }
    catch (err) {
      error.value = err as Error
      console.error('[useReleases] Failed to fetch releases:', err)
      return []
    }
    finally {
      loading.value = false
    }
  }

  async function fetchLatestRelease(
    channel: ReleaseChannel = 'RELEASE',
    platform?: AssetPlatform,
  ): Promise<AppRelease | null> {
    loading.value = true
    error.value = null

    try {
      const params = new URLSearchParams()
      params.set('channel', channel)
      if (platform)
        params.set('platform', platform)

      const data = await $fetch<LatestReleaseResponse>(`/api/releases/latest?${params.toString()}`)
      return data.release ? normalizeRelease(data.release) : null
    }
    catch (err) {
      error.value = err as Error
      console.error('[useReleases] Failed to fetch latest release:', err)
      return null
    }
    finally {
      loading.value = false
    }
  }

  async function fetchReleaseByTag(tag: string): Promise<AppRelease | null> {
    loading.value = true
    error.value = null

    try {
      const data = await $fetch<ReleaseResponse>(`/api/releases/${encodeURIComponent(tag)}`)
      return data.release ? normalizeRelease(data.release) : null
    }
    catch (err) {
      error.value = err as Error
      console.error('[useReleases] Failed to fetch release:', err)
      return null
    }
    finally {
      loading.value = false
    }
  }

  return {
    releases,
    loading,
    error,
    fetchReleases,
    fetchLatestRelease,
    fetchReleaseByTag,
  }
}

export function detectPlatform(): AssetPlatform {
  if (!hasNavigator())
    return 'darwin'

  const ua = navigator.userAgent.toLowerCase()

  if (ua.includes('win'))
    return 'win32'
  if (ua.includes('linux'))
    return 'linux'

  return 'darwin'
}

export function detectArch(): AssetArch {
  if (!hasNavigator())
    return 'arm64'

  // Try to detect ARM architecture
  const ua = navigator.userAgent.toLowerCase()

  // Modern approach using userAgentData (Chrome 90+)
  if ('userAgentData' in navigator) {
    const uaData = (navigator as Navigator & { userAgentData?: { architecture?: string } }).userAgentData
    if (uaData?.architecture === 'arm')
      return 'arm64'
  }

  // Fallback: Check for common ARM indicators
  if (ua.includes('arm') || ua.includes('aarch64'))
    return 'arm64'

  return 'x64'
}

export function getPlatformLabel(platform: AssetPlatform): string {
  const labels: Record<AssetPlatform, string> = {
    darwin: 'macOS',
    win32: 'Windows',
    linux: 'Linux',
  }
  return labels[platform] || platform
}

export function getArchLabel(arch: AssetArch): string {
  const labels: Record<AssetArch, string> = {
    x64: 'Intel',
    arm64: 'Apple Silicon',
    universal: 'Universal',
  }
  return labels[arch] || arch
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0)
    return '0 B'

  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${units[i]}`
}

export function findAssetForPlatform(
  assets: ReleaseAsset[] | undefined,
  platform: AssetPlatform,
  preferredArch?: AssetArch,
): ReleaseAsset | undefined {
  if (!assets?.length)
    return undefined

  const platformAssets = assets.filter(a => a.platform === platform)

  if (!platformAssets.length)
    return undefined

  // Try to find preferred arch
  if (preferredArch) {
    const preferred = platformAssets.find(a => a.arch === preferredArch)
    if (preferred)
      return preferred
  }

  // Try universal
  const universal = platformAssets.find(a => a.arch === 'universal')
  if (universal)
    return universal

  // Return first available
  return platformAssets[0]
}
