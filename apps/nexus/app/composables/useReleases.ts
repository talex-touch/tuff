import type { Ref } from 'vue'

export type ReleaseChannel = 'RELEASE' | 'BETA' | 'SNAPSHOT'
export type ReleaseStatus = 'draft' | 'published' | 'archived'
export type AssetPlatform = 'darwin' | 'win32' | 'linux'
export type AssetArch = 'x64' | 'arm64' | 'universal'
export type AssetSourceType = 'github' | 'upload'

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
  notes: string
  notesHtml?: string | null
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
      releases.value = data.releases
      return data.releases
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
      return data.release
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
      return data.release
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
  if (typeof navigator === 'undefined')
    return 'darwin'

  const ua = navigator.userAgent.toLowerCase()

  if (ua.includes('win'))
    return 'win32'
  if (ua.includes('linux'))
    return 'linux'

  return 'darwin'
}

export function detectArch(): AssetArch {
  if (typeof navigator === 'undefined')
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
