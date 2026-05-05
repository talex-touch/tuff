import type {
  AppPreviewChannel,
  CustomUpdateConfig,
  DownloadAsset,
  GitHubRelease,
  UpdateSourceConfig
} from '@talex-touch/utils'

type CustomDownloadEntry = {
  filename?: string
  name?: string
  url?: string
  size?: number
  checksum?: string
  hash?: string
  signatureUrl?: string
  sigUrl?: string
}

type CustomUpdatePayload = {
  version?: string
  downloads?: CustomDownloadEntry[]
  name?: string
  published_at?: string
  description?: string
  changelog?: string
}

type DownloadAssetWithSignature = DownloadAsset & {
  signatureUrl?: string
} & import('./platform-target').UpdateAssetTarget
import { UpdateErrorType, UpdateProviderType } from '@talex-touch/utils'
import { createRendererLogger } from '~/utils/renderer-log'
import { UpdateProvider } from './UpdateProvider'
import { compareUpdateAssetTargets, resolveUpdateAssetTarget } from './platform-target'

const customUpdateLog = createRendererLogger('CustomUpdateProvider')

export class CustomUpdateProvider extends UpdateProvider {
  readonly name: string
  readonly type = UpdateProviderType.CUSTOM
  private readonly apiUrl: string
  private readonly apiFormat: 'github' | 'custom'
  private readonly headers?: Record<string, string>
  private readonly timeout = 10000

  constructor(config: CustomUpdateConfig) {
    super()
    this.name = config.name
    this.apiUrl = config.url
    this.apiFormat = config.apiFormat
    this.headers = config.headers
  }

  // 检查是否可以处理该配置
  canHandle(config: UpdateSourceConfig): boolean {
    return config.type === UpdateProviderType.CUSTOM && config.url === this.apiUrl
  }

  // 获取最新版本信息
  async fetchLatestRelease(_channel: AppPreviewChannel): Promise<GitHubRelease> {
    try {
      const response = await this.request({
        method: 'GET',
        url: this.apiUrl,
        timeoutMs: this.timeout,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'TalexTouch-Updater/1.0',
          ...this.headers
        }
      })

      if (response.status !== 200) {
        throw this.createError(
          UpdateErrorType.API_ERROR,
          `Custom API returned status ${response.status}`,
          { response }
        )
      }

      const data = response.data

      if (this.apiFormat === 'github') {
        // 兼容GitHub API格式
        return this.parseGitHubFormat(data, _channel)
      } else {
        // 自定义格式
        return this.parseCustomFormat(data, _channel)
      }
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'type' in error) {
        throw error
      }

      if (this.isRequestTimeout(error)) {
        throw this.createError(
          UpdateErrorType.TIMEOUT_ERROR,
          'Request to custom API timed out',
          error
        )
      }

      const statusCode = this.getRequestStatusCode(error)
      if (typeof statusCode === 'number') {
        if (statusCode >= 500) {
          throw this.createError(UpdateErrorType.API_ERROR, 'Custom API server error', error)
        } else if (statusCode === 404) {
          throw this.createError(UpdateErrorType.API_ERROR, 'Custom API endpoint not found', error)
        } else if (statusCode === 401 || statusCode === 403) {
          throw this.createError(
            UpdateErrorType.API_ERROR,
            'Custom API authentication failed',
            error
          )
        } else {
          throw this.createError(
            UpdateErrorType.API_ERROR,
            `Custom API error: ${statusCode}`,
            error
          )
        }
      }

      if (error instanceof Error) {
        throw this.createError(
          UpdateErrorType.NETWORK_ERROR,
          'Unable to connect to custom API',
          error
        )
      }

      throw this.createError(
        UpdateErrorType.UNKNOWN_ERROR,
        'Unknown error occurred while fetching from custom API',
        error
      )
    }
  }

  // 获取下载资源列表
  getDownloadAssets(release: GitHubRelease): DownloadAsset[] {
    if (!release.assets || !Array.isArray(release.assets)) {
      return []
    }

    return release.assets
      .flatMap((asset) => {
        const target = resolveUpdateAssetTarget(asset.name)
        if (!target) {
          customUpdateLog.warn(`Skip unsupported asset target: ${asset.name}`)
          return []
        }
        const assetWithSignature = asset as DownloadAssetWithSignature
        const normalized: DownloadAssetWithSignature = {
          name: asset.name,
          url: asset.url,
          size: asset.size || 0,
          platform: target.platform,
          arch: target.arch,
          sourceArch: target.sourceArch,
          priority: target.priority,
          checksum: asset.checksum,
          signatureUrl: assetWithSignature.signatureUrl
        }
        return [normalized]
      })
      .sort((left, right) => compareUpdateAssetTargets(left, right))
  }

  // 健康检查
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.request({
        method: 'GET',
        url: this.apiUrl,
        timeoutMs: 5000,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'TalexTouch-Updater/1.0',
          ...this.headers
        }
      })
      return response.status === 200
    } catch (error) {
      customUpdateLog.warn('Health check failed', error)
      return false
    }
  }

  // 解析GitHub格式数据
  private parseGitHubFormat(data: unknown, channel: AppPreviewChannel): GitHubRelease {
    if (Array.isArray(data)) {
      // 多个发布版本
      const releases = data as GitHubRelease[]
      const channelReleases = this.filterByChannel(releases, channel)

      if (channelReleases.length === 0) {
        throw this.createError(
          UpdateErrorType.API_ERROR,
          `No releases found for channel: ${channel}`
        )
      }

      const latestRelease = channelReleases[0]
      this.validateRelease(latestRelease)
      return latestRelease
    }

    if (data && typeof data === 'object') {
      // 单个发布版本
      const release = data as GitHubRelease
      this.validateRelease(release)
      return release
    }

    throw this.createError(
      UpdateErrorType.PARSE_ERROR,
      'Invalid GitHub API format: expected release object or array'
    )
  }

  // 解析自定义格式数据
  private parseCustomFormat(data: unknown, _channel: AppPreviewChannel): GitHubRelease {
    // 自定义格式解析逻辑
    // 这里需要根据具体的API格式来实现
    if (!data || typeof data !== 'object') {
      throw this.createError(
        UpdateErrorType.PARSE_ERROR,
        'Invalid custom API format: payload is not an object'
      )
    }

    const payload = data as CustomUpdatePayload
    if (!payload.version || !Array.isArray(payload.downloads)) {
      throw this.createError(
        UpdateErrorType.PARSE_ERROR,
        'Invalid custom API format: missing required fields'
      )
    }

    const downloads = payload.downloads

    const release: GitHubRelease = {
      tag_name: payload.version,
      name: payload.name || payload.version,
      published_at: payload.published_at || new Date().toISOString(),
      body: payload.description || payload.changelog || '',
      assets: downloads.flatMap((download) => {
        const filename = download.filename || download.name || ''
        const url = download.url || ''
        const target = resolveUpdateAssetTarget(filename)
        if (!target) {
          customUpdateLog.warn(`Skip unsupported asset target: ${filename}`)
          return []
        }
        const asset: DownloadAssetWithSignature = {
          name: filename,
          url,
          size: typeof download.size === 'number' ? download.size : 0,
          platform: target.platform,
          arch: target.arch,
          sourceArch: target.sourceArch,
          priority: target.priority,
          checksum: download.checksum || download.hash,
          signatureUrl: download.signatureUrl || download.sigUrl
        }
        return [asset]
      })
    }

    this.validateRelease(release)
    return release
  }

  // 验证自定义API格式
  validateCustomFormat(data: unknown): boolean {
    try {
      if (!data || typeof data !== 'object') {
        return false
      }

      if (this.apiFormat === 'github') {
        if (Array.isArray(data)) {
          return true
        }
        const payload = data as { tag_name?: unknown; assets?: unknown }
        return typeof payload.tag_name === 'string' && Array.isArray(payload.assets)
      }

      const payload = data as { version?: unknown; downloads?: unknown }
      return typeof payload.version === 'string' && Array.isArray(payload.downloads)
    } catch {
      return false
    }
  }

  // 获取API信息
  getApiInfo(): {
    url: string
    format: string
    name: string
    hasAuth: boolean
  } {
    return {
      url: this.apiUrl,
      format: this.apiFormat,
      name: this.name,
      hasAuth: !!this.headers
    }
  }

  // 测试API连接
  async testConnection(): Promise<{
    success: boolean
    message: string
    responseTime?: number
  }> {
    const startTime = Date.now()

    try {
      const response = await this.request({
        method: 'HEAD',
        url: this.apiUrl,
        timeoutMs: 5000,
        headers: {
          'User-Agent': 'TalexTouch-Updater/1.0',
          ...this.headers
        },
        responseType: 'text'
      })
      const responseTime = Date.now() - startTime

      return {
        success: response.status === 200,
        message: `Connection successful (${response.status})`,
        responseTime
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Connection failed'
      return {
        success: false,
        message
      }
    }
  }
}
