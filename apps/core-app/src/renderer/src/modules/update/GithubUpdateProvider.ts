import type {
  AppPreviewChannel,
  DownloadAsset,
  GitHubRelease,
  UpdateSourceConfig
} from '@talex-touch/utils'
import type { AxiosRequestConfig } from 'axios'
import { UpdateErrorType, UpdateProviderType, UPDATE_GITHUB_RELEASES_API } from '@talex-touch/utils'
import axios from 'axios'
import { UpdateProvider } from './UpdateProvider'

type GitHubApiAsset = {
  name?: string
  browser_download_url?: string
  url?: string
  size?: number
}

export class GithubUpdateProvider extends UpdateProvider {
  readonly name = 'GitHub Releases'
  readonly type = UpdateProviderType.GITHUB
  private readonly apiUrl = UPDATE_GITHUB_RELEASES_API
  private readonly timeout = 8000

  // 检查是否可以处理该配置
  canHandle(config: UpdateSourceConfig): boolean {
    return config.type === UpdateProviderType.GITHUB
  }

  // 获取最新版本信息
  async fetchLatestRelease(channel: AppPreviewChannel): Promise<GitHubRelease> {
    const maxRetries = 3
    let attempt = 0

    while (attempt < maxRetries) {
      try {
        // Import rate limit manager
        const { rateLimitManager } = await import('./RateLimitManager')

        // Check if API call is allowed
        if (!rateLimitManager.isAllowed('github')) {
          const timeUntilReset = rateLimitManager.getTimeUntilReset('github')
          throw this.createError(
            UpdateErrorType.API_ERROR,
            `Rate limit exceeded. Try again in ${rateLimitManager.getTimeUntilResetString('github')}`,
            { retryAfter: timeUntilReset }
          )
        }

        const config: AxiosRequestConfig = {
          method: 'GET',
          url: this.apiUrl,
          timeout: this.timeout,
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'TalexTouch-Updater/1.0'
          }
        }

        const response = await axios(config)

        // Update rate limit information from response headers
        const headerEntries = Object.entries(response.headers)
        const normalizedHeaders = headerEntries.reduce<Record<string, string>>(
          (acc, [key, value]) => {
            if (Array.isArray(value)) {
              acc[key] = value.join(',')
            } else if (value !== undefined && value !== null) {
              acc[key] = String(value)
            }
            return acc
          },
          {}
        )
        rateLimitManager.updateRateLimit('github', normalizedHeaders)

        if (response.status !== 200) {
          throw this.createError(
            UpdateErrorType.API_ERROR,
            `GitHub API returned status ${response.status}`,
            { response }
          )
        }

        const releases: GitHubRelease[] = response.data

        if (!releases || !Array.isArray(releases)) {
          throw this.createError(
            UpdateErrorType.PARSE_ERROR,
            'Invalid response format from GitHub API'
          )
        }

        // 过滤指定渠道的版本
        const channelReleases = this.filterByChannel(releases, channel)

        if (channelReleases.length === 0) {
          throw this.createError(
            UpdateErrorType.API_ERROR,
            `No releases found for channel: ${channel}`
          )
        }

        // 获取最新版本（第一个）
        const latestRelease = channelReleases[0]

        // 验证Release数据
        this.validateRelease(latestRelease)

        return latestRelease
      } catch (error) {
        attempt++

        // Check if this is a retryable error
        const isRetryable = this.isRetryableError(error)

        if (isRetryable && attempt < maxRetries) {
          // Import rate limit manager for backoff calculation
          const { rateLimitManager } = await import('./RateLimitManager')

          // Calculate backoff delay
          const baseDelay = 2000 // 2 seconds
          const maxDelay = 60000 // 1 minute
          const delay = rateLimitManager.calculateBackoffDelay(attempt - 1, baseDelay, maxDelay)

          console.warn(
            `[GithubUpdateProvider] Attempt ${attempt} failed, retrying in ${delay}ms:`,
            error instanceof Error ? error.message : String(error)
          )

          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, delay))
          continue
        }

        if (this.isUpdateError(error)) {
          throw error // 重新抛出已知错误
        }

        if (
          axios.isAxiosError(error) &&
          (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')
        ) {
          throw this.createError(
            UpdateErrorType.TIMEOUT_ERROR,
            'Request to GitHub API timed out',
            error
          )
        }

        if (axios.isAxiosError(error) && error.response) {
          const statusCode = error.response.status

          if (statusCode >= 500) {
            throw this.createError(UpdateErrorType.API_ERROR, 'GitHub API server error', error)
          } else if (statusCode === 404) {
            throw this.createError(UpdateErrorType.API_ERROR, 'Repository not found', error)
          } else if (statusCode === 403) {
            throw this.createError(
              UpdateErrorType.API_ERROR,
              'GitHub API rate limit exceeded',
              error
            )
          } else {
            throw this.createError(
              UpdateErrorType.API_ERROR,
              `GitHub API error: ${statusCode}`,
              error
            )
          }
        }

        if (axios.isAxiosError(error) && error.request) {
          throw this.createError(
            UpdateErrorType.NETWORK_ERROR,
            'Unable to connect to GitHub API',
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

    // If we get here, all retries failed
    throw this.createError(UpdateErrorType.API_ERROR, 'All retry attempts failed', {
      attempts: maxRetries
    })
  }

  // 获取下载资源列表
  getDownloadAssets(release: GitHubRelease): DownloadAsset[] {
    if (!release.assets || !Array.isArray(release.assets)) {
      return []
    }

    const assets = release.assets as GitHubApiAsset[]
    const signatureMap = new Map<string, string>()

    for (const asset of assets) {
      const name = String(asset.name || '')
      if (this.isSignatureAsset(name)) {
        const url = asset.browser_download_url || asset.url
        if (url) {
          signatureMap.set(this.normalizeAssetKey(this.stripSignatureSuffix(name)), url)
        }
      }
    }

    return assets
      .filter((asset) => {
        const name = asset.name ?? ''
        return name.length > 0 && !this.isSignatureAsset(name) && !this.isChecksumAsset(name)
      })
      .map((asset) => {
        const name = asset.name ?? ''
        const signatureUrl = signatureMap.get(this.normalizeAssetKey(name))
        return {
          name,
          url: asset.browser_download_url || asset.url || '',
          size: asset.size || 0,
          platform: this.detectPlatform(name),
          arch: this.detectArch(name),
          checksum: this.extractChecksum(asset),
          signatureUrl
        }
      })
  }

  // 健康检查
  async healthCheck(): Promise<boolean> {
    try {
      const config: AxiosRequestConfig = {
        method: 'GET',
        url: 'https://api.github.com',
        timeout: 5000,
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'TalexTouch-Updater/1.0'
        }
      }

      const response = await axios(config)
      return response.status === 200
    } catch (error) {
      console.warn('GitHub health check failed:', error)
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
      lower.includes('.AppImage')
    ) {
      return 'linux'
    }

    // 默认返回当前平台
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

    // 默认返回当前架构
    return process.arch as 'x64' | 'arm64'
  }

  // 提取校验和
  private extractChecksum(asset: GitHubApiAsset): string | undefined {
    // 尝试从文件名或描述中提取校验和
    const filename = (asset.name ?? '').toLowerCase()
    if (!filename) {
      return undefined
    }

    if (filename.includes('.sha256') || filename.includes('.sha1') || filename.includes('.md5')) {
      return asset.browser_download_url || asset.url
    }

    return undefined
  }

  private isSignatureAsset(filename: string): boolean {
    const lower = filename.toLowerCase()
    return lower.endsWith('.sig') || lower.endsWith('.sig.txt') || lower.endsWith('.asc')
  }

  private stripSignatureSuffix(filename: string): string {
    return filename.replace(/\.(sig|asc)(\.txt)?$/i, '')
  }

  private isChecksumAsset(filename: string): boolean {
    const lower = filename.toLowerCase()
    return (
      lower.endsWith('.sha256') ||
      lower.endsWith('.sha1') ||
      lower.endsWith('.md5') ||
      lower.endsWith('.sha256.txt') ||
      lower.endsWith('.sha1.txt') ||
      lower.endsWith('.md5.txt') ||
      lower.endsWith('.sha256sum') ||
      lower.endsWith('.sha1sum') ||
      lower.endsWith('.md5sum')
    )
  }

  private normalizeAssetKey(filename: string): string {
    return filename.toLowerCase()
  }

  // 获取发布说明摘要
  getReleaseSummary(release: GitHubRelease): string {
    if (!release.body) {
      return 'No release notes available'
    }

    // 提取前几行作为摘要
    const lines = release.body.split('\n').filter((line) => line.trim())
    const summary = lines.slice(0, 3).join('\n')

    return summary.length > 200 ? `${summary.substring(0, 200)}...` : summary
  }

  // 获取发布标签
  getReleaseTags(release: GitHubRelease): string[] {
    const tags: string[] = []

    // 从标签名中提取版本信息
    const version = this.formatVersion(release.tag_name)
    tags.push(version)

    // 从发布说明中提取标签
    if (release.body) {
      const body = release.body.toLowerCase()

      if (body.includes('bug fix') || body.includes('bugfix')) {
        tags.push('bugfix')
      }
      if (body.includes('feature') || body.includes('new feature')) {
        tags.push('feature')
      }
      if (body.includes('breaking change') || body.includes('breaking')) {
        tags.push('breaking')
      }
      if (body.includes('security') || body.includes('vulnerability')) {
        tags.push('security')
      }
    }

    return tags
  }

  // 检查是否为预发布版本
  isPrerelease(release: GitHubRelease): boolean {
    return 'prerelease' in release && release.prerelease === true
  }

  // 获取发布日期
  getReleaseDate(release: GitHubRelease): Date {
    return new Date(release.published_at)
  }

  // 格式化发布日期
  formatReleaseDate(release: GitHubRelease): string {
    const date = this.getReleaseDate(release)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  // 检查错误是否可重试
  private isRetryableError(error: unknown): boolean {
    // Network errors are retryable
    if (axios.isAxiosError(error)) {
      if (
        error.code === 'ECONNABORTED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND'
      ) {
        return true
      }

      // Server errors (5xx) are retryable
      if (error.response && error.response.status >= 500) {
        return true
      }

      // Rate limit errors are retryable
      if (error.response && error.response.status === 403) {
        return true
      }

      // Network connectivity issues are retryable
      if (error.request && !error.response) {
        return true
      }
    }

    return false
  }

  private isUpdateError(error: unknown): error is { type: UpdateErrorType } {
    return typeof error === 'object' && error !== null && 'type' in error
  }
}
