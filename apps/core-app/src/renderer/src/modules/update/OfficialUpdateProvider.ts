import type { DownloadAsset, GitHubRelease, UpdateSourceConfig } from '@talex-touch/utils'
import type { AxiosRequestConfig } from 'axios'
import { AppPreviewChannel, UpdateErrorType, UpdateProviderType } from '@talex-touch/utils'
import axios from 'axios'
import { appSetting } from '~/modules/channel/storage'
import { UpdateProvider } from './UpdateProvider'

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
  const locale =
    appSetting?.lang?.locale || (typeof navigator !== 'undefined' ? navigator.language : 'en')
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
  private readonly apiUrl = 'https://tuff.talex.link/api/releases'
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

      const config: AxiosRequestConfig = {
        method: 'GET',
        url: `${this.apiUrl}/latest`,
        params: {
          channel: apiChannel,
          platform
        },
        timeout: this.timeout,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'TalexTouch-Updater/2.0'
        }
      }

      const response = await axios(config)

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
        error && typeof error === 'object'
          ? (error as {
              type?: unknown
              code?: unknown
              response?: { status?: number }
              request?: unknown
            })
          : undefined

      if (maybeError?.type) {
        throw error
      }

      const errorCode = typeof maybeError?.code === 'string' ? maybeError.code : undefined
      if (errorCode === 'ECONNABORTED' || errorCode === 'ETIMEDOUT') {
        throw this.createError(
          UpdateErrorType.TIMEOUT_ERROR,
          'Request to Official API timed out',
          error
        )
      }

      if (maybeError?.response) {
        const statusCode = maybeError.response?.status

        if (typeof statusCode === 'number' && statusCode >= 500) {
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

      if (maybeError?.request) {
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

    return release.assets.map((asset) => {
      const assetData = asset as OfficialReleaseAsset
      const name = assetData.name || asset.name
      const url = assetData.browser_download_url || assetData.url || asset.url
      const normalized: DownloadAssetWithSignature = {
        name,
        url,
        size: assetData.size ?? asset.size ?? 0,
        platform: assetData.platform || this.detectPlatform(name),
        arch: assetData.arch || this.detectArch(name),
        checksum: assetData.sha256 || undefined,
        signatureUrl: assetData.signatureUrl || (url ? `${url}.sig` : undefined)
      }
      return normalized
    })
  }

  // 健康检查
  async healthCheck(): Promise<boolean> {
    try {
      const config: AxiosRequestConfig = {
        method: 'GET',
        url: `${this.apiUrl}/latest`,
        params: { channel: 'RELEASE' },
        timeout: 5000,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'TalexTouch-Updater/2.0'
        }
      }

      const response = await axios(config)
      return response.status === 200
    } catch (error) {
      console.warn('[OfficialUpdateProvider] Health check failed:', error)
      return false
    }
  }

  // 检测平台
  private detectPlatform(filename: string): 'win32' | 'darwin' | 'linux' {
    const lower = filename.toLowerCase()

    if (lower.includes('win') || lower.includes('windows') || lower.includes('.exe')) {
      return 'win32'
    } else if (lower.includes('mac') || lower.includes('darwin') || lower.includes('.dmg')) {
      return 'darwin'
    } else if (
      lower.includes('linux') ||
      lower.includes('.deb') ||
      lower.includes('.rpm') ||
      lower.includes('.appimage')
    ) {
      return 'linux'
    }

    return process.platform as 'win32' | 'darwin' | 'linux'
  }

  // 检测架构
  private detectArch(filename: string): 'x64' | 'arm64' {
    const lower = filename.toLowerCase()

    if (lower.includes('arm64') || lower.includes('aarch64')) {
      return 'arm64'
    } else if (lower.includes('x64') || lower.includes('amd64') || lower.includes('x86_64')) {
      return 'x64'
    }

    return process.arch as 'x64' | 'arm64'
  }

  // 获取服务器状态
  async getServerStatus(): Promise<{
    available: boolean
    message: string
    estimatedLaunchDate?: string
  }> {
    const isHealthy = await this.healthCheck()
    return {
      available: isHealthy,
      message: isHealthy
        ? 'Official update server is available'
        : 'Official update server is temporarily unavailable'
    }
  }

  // 获取服务器信息
  async getServerInfo(): Promise<{
    name: string
    version: string
    location: string
    features: string[]
  }> {
    return {
      name: 'TalexTouch Official Update Server',
      version: '1.0.0',
      location: 'Cloudflare Global CDN',
      features: [
        'Faster download speeds',
        'Regional optimization',
        'GitHub + Upload dual mode',
        'Multi-channel releases (RELEASE/BETA/SNAPSHOT)',
        'Platform-specific assets',
        'SHA256 checksum verification'
      ]
    }
  }

  // 检查服务器维护状态
  async checkMaintenanceStatus(): Promise<{
    inMaintenance: boolean
    maintenanceMessage?: string
    estimatedEndTime?: string
  }> {
    return {
      inMaintenance: false,
      maintenanceMessage: undefined,
      estimatedEndTime: undefined
    }
  }

  // 获取服务器负载
  async getServerLoad(): Promise<{
    cpu: number
    memory: number
    network: number
    status: 'healthy' | 'warning' | 'critical'
  }> {
    return {
      cpu: 0,
      memory: 0,
      network: 0,
      status: 'healthy'
    }
  }
}
