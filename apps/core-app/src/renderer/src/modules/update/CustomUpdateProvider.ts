import axios, { AxiosRequestConfig } from 'axios'
import { UpdateProvider } from './UpdateProvider'
import {
  UpdateProviderType,
  UpdateSourceConfig,
  AppPreviewChannel,
  GitHubRelease,
  DownloadAsset,
  CustomUpdateConfig,
  UpdateErrorType
} from '@talex-touch/utils'

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
  async fetchLatestRelease(channel: AppPreviewChannel): Promise<GitHubRelease> {
    try {
      const config: AxiosRequestConfig = {
        method: 'GET',
        url: this.apiUrl,
        timeout: this.timeout,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'TalexTouch-Updater/1.0',
          ...this.headers
        }
      }

      const response = await axios(config)

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
        return this.parseGitHubFormat(data, channel)
      } else {
        // 自定义格式
        return this.parseCustomFormat(data, channel)
      }
    } catch (error) {
      if (error.type) {
        throw error
      }

      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        throw this.createError(
          UpdateErrorType.TIMEOUT_ERROR,
          'Request to custom API timed out',
          error
        )
      }

      if (error.response) {
        const statusCode = error.response.status

        if (statusCode >= 500) {
          throw this.createError(
            UpdateErrorType.API_ERROR,
            'Custom API server error',
            error
          )
        } else if (statusCode === 404) {
          throw this.createError(
            UpdateErrorType.API_ERROR,
            'Custom API endpoint not found',
            error
          )
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

      if (error.request) {
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

    return release.assets.map(asset => ({
      name: asset.name,
      url: asset.url,
      size: asset.size || 0,
      platform: this.detectPlatform(asset.name),
      arch: this.detectArch(asset.name),
      checksum: asset.checksum
    }))
  }

  // 健康检查
  async healthCheck(): Promise<boolean> {
    try {
      const config: AxiosRequestConfig = {
        method: 'GET',
        url: this.apiUrl,
        timeout: 5000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'TalexTouch-Updater/1.0',
          ...this.headers
        }
      }

      const response = await axios(config)
      return response.status === 200
    } catch (error) {
      console.warn('Custom API health check failed:', error)
      return false
    }
  }

  // 解析GitHub格式数据
  private parseGitHubFormat(data: any, channel: AppPreviewChannel): GitHubRelease {
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
    } else {
      // 单个发布版本
      const release = data as GitHubRelease
      this.validateRelease(release)
      return release
    }
  }

  // 解析自定义格式数据
  private parseCustomFormat(data: any, channel: AppPreviewChannel): GitHubRelease {
    // 自定义格式解析逻辑
    // 这里需要根据具体的API格式来实现

    if (!data.version || !data.downloads) {
      throw this.createError(
        UpdateErrorType.PARSE_ERROR,
        'Invalid custom API format: missing required fields'
      )
    }

    const release: GitHubRelease = {
      tag_name: data.version,
      name: data.name || data.version,
      published_at: data.published_at || new Date().toISOString(),
      body: data.description || data.changelog || '',
      assets: data.downloads.map((download: any) => ({
        name: download.filename || download.name,
        browser_download_url: download.url,
        url: download.url,
        size: download.size || 0,
        platform: this.detectPlatform(download.filename || download.name),
        arch: this.detectArch(download.filename || download.name),
        checksum: download.checksum || download.hash
      }))
    }

    this.validateRelease(release)
    return release
  }

  // 检测平台
  private detectPlatform(filename: string): 'win32' | 'darwin' | 'linux' {
    const lower = filename.toLowerCase()

    if (lower.includes('win') || lower.includes('windows') || lower.includes('.exe')) {
      return 'win32'
    } else if (lower.includes('mac') || lower.includes('darwin') || lower.includes('.dmg')) {
      return 'darwin'
    } else if (lower.includes('linux') || lower.includes('.deb') || lower.includes('.rpm') || lower.includes('.AppImage')) {
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

  // 验证自定义API格式
  validateCustomFormat(data: any): boolean {
    try {
      if (this.apiFormat === 'github') {
        return Array.isArray(data) || (data.tag_name && data.assets)
      } else {
        return data.version && data.downloads
      }
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
      const config: AxiosRequestConfig = {
        method: 'HEAD',
        url: this.apiUrl,
        timeout: 5000,
        headers: {
          'User-Agent': 'TalexTouch-Updater/1.0',
          ...this.headers
        }
      }

      const response = await axios(config)
      const responseTime = Date.now() - startTime

      return {
        success: response.status === 200,
        message: `Connection successful (${response.status})`,
        responseTime
      }
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Connection failed'
      }
    }
  }
}
