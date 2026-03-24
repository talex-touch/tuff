import type { DownloadAsset, GitHubRelease, UpdateSourceConfig } from '@talex-touch/utils'
import {
  AppPreviewChannel,
  UpdateErrorType,
  UpdateProviderType,
  hasNavigator
} from '@talex-touch/utils'
import { appSetting } from '~/modules/channel/storage'
import { UpdateProvider } from './UpdateProvider'
import { resolveUpdateAssetTarget } from './platform-target'

type OfficialReleaseAsset = {
  name?: string
  browser_download_url?: string
  url?: string
  size?: number
  platform?: DownloadAsset['platform']
  arch?: DownloadAsset['arch']
  sha256?: string
  signatureUrl?: string
}

type DownloadAssetWithSignature = DownloadAsset & { signatureUrl?: string }

// Nexus API 响应类型
interface NexusReleaseAsset {
  id: string
  releaseId: string
  platform: 'darwin' | 'win32' | 'linux'
  arch: 'x64' | 'arm64' | 'universal'
  filename: string
  sourceType: 'github' | 'upload'
  fileKey: string | null
  downloadUrl: string
  signatureUrl?: string | null
  size: number
  sha256: string | null
  contentType: string
  downloadCount: number
  createdAt: string
  updatedAt: string
}

interface ReleaseNotes {
  zh: string
  en: string
}

interface NexusRelease {
  id: string
  tag: string
  name: string
  channel: 'RELEASE' | 'BETA' | 'SNAPSHOT'
  version: string
  notes: ReleaseNotes
  notesHtml?: ReleaseNotes | null
  status: 'draft' | 'published' | 'archived'
  publishedAt: string | null
  minAppVersion?: string | null
  isCritical: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
  assets?: NexusReleaseAsset[]
}

function resolveReleaseLocale(): 'zh' | 'en' {
  const locale = appSetting?.lang?.locale || (hasNavigator() ? navigator.language : 'en')
  return locale.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

function resolveReleaseNotes(notes: ReleaseNotes, locale: 'zh' | 'en'): string {
  return notes[locale] || notes.en || notes.zh
}

function resolveReleaseNotesHtml(
  notesHtml: ReleaseNotes | null | undefined,
  notes: ReleaseNotes,
  locale: 'zh' | 'en'
): string {
  if (notesHtml) {
    return notesHtml[locale] || notesHtml.en || notesHtml.zh
  }
  return resolveReleaseNotes(notes, locale)
}

interface NexusLatestResponse {
  release: NexusRelease | null
  message?: string
}

export class OfficialUpdateProvider extends UpdateProvider {
  readonly name = 'Official Website'
  readonly type = UpdateProviderType.OFFICIAL
  private readonly apiUrl = 'https://tuff.tagzxia.com/api/releases'
  private readonly timeout = 10000

  // 检查是否可以处理该配置
  canHandle(config: UpdateSourceConfig): boolean {
    return config.type === UpdateProviderType.OFFICIAL
  }

  // 将 AppPreviewChannel 转换为 Nexus API 的 channel 参数
  private mapChannelToApi(channel: AppPreviewChannel): string {
    const channelMap: Record<AppPreviewChannel, string> = {
      [AppPreviewChannel.RELEASE]: 'RELEASE',
      [AppPreviewChannel.BETA]: 'BETA',
      [AppPreviewChannel.SNAPSHOT]: 'SNAPSHOT'
    }
    return channelMap[channel] || 'RELEASE'
  }

  // 将 Nexus release 转换为 GitHubRelease 格式（兼容现有接口）
  private mapNexusToGitHubRelease(nexusRelease: NexusRelease): GitHubRelease {
    const locale = resolveReleaseLocale()
    const releaseNotes = resolveReleaseNotesHtml(nexusRelease.notesHtml, nexusRelease.notes, locale)

    return {
      tag_name: nexusRelease.tag,
      name: nexusRelease.name,
      body: releaseNotes,
      published_at: nexusRelease.publishedAt || nexusRelease.createdAt,
      assets: (nexusRelease.assets || []).map((asset) => ({
        name: asset.filename,
        url: asset.downloadUrl,
        browser_download_url: asset.downloadUrl,
        size: asset.size,
        content_type: asset.contentType,
        // 扩展字段
        platform: asset.platform,
        arch: asset.arch,
        sha256: asset.sha256,
        signatureUrl: asset.signatureUrl ?? undefined,
        sourceType: asset.sourceType
      })),
      // 扩展字段
      isCritical: nexusRelease.isCritical,
      minAppVersion: nexusRelease.minAppVersion,
      channel: nexusRelease.channel
    } as GitHubRelease
  }

  // 获取最新版本信息
  async fetchLatestRelease(channel: AppPreviewChannel): Promise<GitHubRelease> {
    try {
      const apiChannel = this.mapChannelToApi(channel)
      const platform = this.getCurrentPlatform()
      if (platform === 'unsupported') {
        throw this.createError(
          UpdateErrorType.API_ERROR,
          `Unsupported runtime platform: ${typeof process !== 'undefined' ? process.platform : 'unknown'}`
        )
      }

      const response = await this.request<NexusLatestResponse>({
        method: 'GET',
        url: `${this.apiUrl}/latest`,
        query: {
          channel: apiChannel,
          platform
        },
        timeoutMs: this.timeout,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'TalexTouch-Updater/2.0'
        }
      })

      if (response.status !== 200) {
        throw this.createError(
          UpdateErrorType.API_ERROR,
          `Official API returned status ${response.status}`,
          { response }
        )
      }

      const data: NexusLatestResponse = response.data

      if (!data.release) {
        throw this.createError(
          UpdateErrorType.API_ERROR,
          data.message || `No releases found for channel: ${channel}`
        )
      }

      // 转换为 GitHubRelease 格式
      const release = this.mapNexusToGitHubRelease(data.release)

      // 验证 Release 数据
      this.validateRelease(release)

      return release
    } catch (error: unknown) {
      const maybeError =
        error && typeof error === 'object' ? (error as { type?: unknown }) : undefined

      if (maybeError?.type) {
        throw error
      }

      if (this.isRequestTimeout(error)) {
        throw this.createError(
          UpdateErrorType.TIMEOUT_ERROR,
          'Request to Official API timed out',
          error
        )
      }

      const statusCode = this.getRequestStatusCode(error)
      if (typeof statusCode === 'number') {
        if (statusCode >= 500) {
          throw this.createError(UpdateErrorType.API_ERROR, 'Official API server error', error)
        } else if (statusCode === 404) {
          throw this.createError(UpdateErrorType.API_ERROR, 'Release not found', error)
        } else {
          throw this.createError(
            UpdateErrorType.API_ERROR,
            `Official API error: ${statusCode ?? 'unknown'}`,
            error
          )
        }
      }

      if (error instanceof Error) {
        throw this.createError(
          UpdateErrorType.NETWORK_ERROR,
          'Unable to connect to Official API',
          error
        )
      }

      throw this.createError(
        UpdateErrorType.UNKNOWN_ERROR,
        'Unknown error occurred while fetching releases',
        error
      )
    }
  }

  // 获取下载资源列表
  getDownloadAssets(release: GitHubRelease): DownloadAsset[] {
    if (!release.assets || !Array.isArray(release.assets)) {
      return []
    }

    return release.assets.flatMap((asset) => {
      const assetData = asset as OfficialReleaseAsset
      const name = assetData.name || asset.name
      const url = assetData.browser_download_url || assetData.url || asset.url
      const target = resolveUpdateAssetTarget(name, {
        platform: assetData.platform,
        arch: assetData.arch
      })
      if (!target) {
        console.warn(`[OfficialUpdateProvider] Skip unsupported asset target: ${name}`)
        return []
      }
      const normalized: DownloadAssetWithSignature = {
        name,
        url,
        size: assetData.size ?? asset.size ?? 0,
        platform: target.platform,
        arch: target.arch,
        checksum: assetData.sha256 || undefined,
        signatureUrl: assetData.signatureUrl || (url ? `${url}.sig` : undefined)
      }
      return [normalized]
    })
  }

  // 健康检查
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.request({
        method: 'GET',
        url: `${this.apiUrl}/latest`,
        query: { channel: 'RELEASE' },
        timeoutMs: 5000,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'TalexTouch-Updater/2.0'
        }
      })
      return response.status === 200
    } catch (error) {
      console.warn('[OfficialUpdateProvider] Health check failed:', error)
      return false
    }
  }

  // 获取服务器状态
  async getServerStatus(): Promise<{
    available: boolean
    message: string
    estimatedLaunchDate?: string
    reason?: string
  }> {
    try {
      const response = await this.request<{
        available?: boolean
        message?: string
        estimatedLaunchDate?: string
        reason?: string
      }>({
        method: 'GET',
        url: `${this.apiUrl}/status`,
        timeoutMs: 5000,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'TalexTouch-Updater/2.0'
        }
      })

      if (response.status !== 200) {
        return {
          available: false,
          message: 'Official update server is unavailable',
          reason: `status endpoint returned ${response.status}`
        }
      }

      const payload = response.data ?? {}
      const available = payload.available === true
      return {
        available,
        message:
          payload.message ||
          (available
            ? 'Official update server is available'
            : 'Official update server is unavailable'),
        estimatedLaunchDate: payload.estimatedLaunchDate,
        reason: available ? undefined : payload.reason || 'status endpoint unavailable'
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return {
        available: false,
        message: 'Official update server is unavailable',
        reason
      }
    }
  }

  // 获取服务器信息
  async getServerInfo(): Promise<{
    name: string
    version: string
    location: string
    features: string[]
    unavailable?: boolean
    reason?: string
  }> {
    try {
      const response = await this.request<{
        name?: string
        version?: string
        location?: string
        features?: string[]
      }>({
        method: 'GET',
        url: `${this.apiUrl}/info`,
        timeoutMs: 5000,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'TalexTouch-Updater/2.0'
        }
      })

      if (response.status !== 200) {
        return {
          name: 'Unavailable',
          version: 'unavailable',
          location: 'unavailable',
          features: [],
          unavailable: true,
          reason: `info endpoint returned ${response.status}`
        }
      }

      const payload = response.data ?? {}
      return {
        name: payload.name || 'TalexTouch Official Update Server',
        version: payload.version || 'unknown',
        location: payload.location || 'unknown',
        features: Array.isArray(payload.features) ? payload.features : []
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return {
        name: 'Unavailable',
        version: 'unavailable',
        location: 'unavailable',
        features: [],
        unavailable: true,
        reason
      }
    }
  }

  // 检查服务器维护状态
  async checkMaintenanceStatus(): Promise<{
    inMaintenance: boolean
    maintenanceMessage?: string
    estimatedEndTime?: string
    unavailable?: boolean
    reason?: string
  }> {
    try {
      const response = await this.request<{
        inMaintenance?: boolean
        maintenanceMessage?: string
        estimatedEndTime?: string
      }>({
        method: 'GET',
        url: `${this.apiUrl}/maintenance`,
        timeoutMs: 5000,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'TalexTouch-Updater/2.0'
        }
      })

      if (response.status !== 200) {
        return {
          inMaintenance: false,
          unavailable: true,
          reason: `maintenance endpoint returned ${response.status}`
        }
      }

      const payload = response.data ?? {}
      return {
        inMaintenance: payload.inMaintenance === true,
        maintenanceMessage: payload.maintenanceMessage,
        estimatedEndTime: payload.estimatedEndTime
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return {
        inMaintenance: false,
        unavailable: true,
        reason
      }
    }
  }

  // 获取服务器负载
  async getServerLoad(): Promise<{
    cpu: number
    memory: number
    network: number
    status: 'healthy' | 'warning' | 'critical' | 'unavailable'
    reason?: string
  }> {
    try {
      const response = await this.request<{
        cpu?: number
        memory?: number
        network?: number
        status?: 'healthy' | 'warning' | 'critical'
      }>({
        method: 'GET',
        url: `${this.apiUrl}/metrics/load`,
        timeoutMs: 5000,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'TalexTouch-Updater/2.0'
        }
      })

      if (response.status !== 200) {
        return {
          cpu: -1,
          memory: -1,
          network: -1,
          status: 'unavailable',
          reason: `load endpoint returned ${response.status}`
        }
      }

      const payload = response.data ?? {}
      return {
        cpu: typeof payload.cpu === 'number' ? payload.cpu : -1,
        memory: typeof payload.memory === 'number' ? payload.memory : -1,
        network: typeof payload.network === 'number' ? payload.network : -1,
        status: payload.status || 'healthy'
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return {
        cpu: -1,
        memory: -1,
        network: -1,
        status: 'unavailable',
        reason
      }
    }
  }
}
