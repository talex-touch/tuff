import type {
  DownloadAsset,
  GitHubRelease,
  UpdateError,
  UpdateProviderType,
  UpdateSourceConfig,
} from '@talex-touch/utils'
import {
  AppPreviewChannel,
  UpdateErrorType,
} from '@talex-touch/utils'

// 更新源抽象基类
export abstract class UpdateProvider {
  abstract readonly name: string
  abstract readonly type: UpdateProviderType

  // 检查是否可以处理该配置
  abstract canHandle(config: UpdateSourceConfig): boolean

  // 获取最新版本信息
  abstract fetchLatestRelease(channel: AppPreviewChannel): Promise<GitHubRelease>

  // 获取下载资源列表
  abstract getDownloadAssets(release: GitHubRelease): DownloadAsset[]

  // 健康检查（可选）
  async healthCheck?(): Promise<boolean>

  // 创建更新错误
  protected createError(type: UpdateErrorType, message: string, originalError?: any): UpdateError {
    const error = new Error(message) as UpdateError
    error.type = type

    if (originalError) {
      if (originalError.code) {
        error.code = originalError.code
      }
      if (originalError.response?.status) {
        error.statusCode = originalError.response.status
      }
    }

    return error
  }

  // 验证配置
  protected validateConfig(config: UpdateSourceConfig): void {
    if (!config.enabled) {
      throw this.createError(UpdateErrorType.API_ERROR, 'Update source is disabled')
    }

    if (config.type !== this.type) {
      throw this.createError(
        UpdateErrorType.API_ERROR,
        `Invalid provider type: expected ${this.type}, got ${config.type}`,
      )
    }
  }

  // 格式化版本号
  protected formatVersion(version: string): string {
    // 移除 'v' 前缀（如果存在）
    return version.startsWith('v') ? version.substring(1) : version
  }

  // 比较版本号
  protected compareVersions(version1: string, version2: string): number {
    const v1 = this.formatVersion(version1)
    const v2 = this.formatVersion(version2)

    // 简单的版本比较逻辑
    const parts1 = v1.split('.').map(Number)
    const parts2 = v2.split('.').map(Number)

    const maxLength = Math.max(parts1.length, parts2.length)

    for (let i = 0; i < maxLength; i++) {
      const part1 = parts1[i] || 0
      const part2 = parts2[i] || 0

      if (part1 > part2)
        return 1
      if (part1 < part2)
        return -1
    }

    return 0
  }

  // 检查是否为更新版本
  protected isNewerVersion(newVersion: string, currentVersion: string): boolean {
    return this.compareVersions(newVersion, currentVersion) > 0
  }

  // 根据渠道过滤版本
  protected filterByChannel(
    releases: GitHubRelease[],
    channel: AppPreviewChannel,
  ): GitHubRelease[] {
    return releases.filter((release) => {
      const tagName = release.tag_name.toLowerCase()

      if (channel === AppPreviewChannel.SNAPSHOT) {
        return (
          tagName.includes('snapshot') || tagName.includes('beta') || tagName.includes('alpha')
        )
      }

      if (channel === AppPreviewChannel.BETA) {
        return tagName.includes('beta') && !tagName.includes('snapshot')
      }

      return (
        !tagName.includes('snapshot')
        && !tagName.includes('beta')
        && !tagName.includes('alpha')
      )
    })
  }

  // 获取当前平台
  protected getCurrentPlatform(): string {
    return process.platform
  }

  // 获取当前架构
  protected getCurrentArch(): string {
    return process.arch
  }

  // 根据平台和架构过滤资源
  protected filterAssetsByPlatform(assets: DownloadAsset[]): DownloadAsset[] {
    const platform = this.getCurrentPlatform()
    const arch = this.getCurrentArch()

    return assets.filter((asset) => {
      // 平台匹配
      const platformMatch = asset.platform === platform

      // 架构匹配
      const archMatch = asset.arch === arch

      return platformMatch && archMatch
    })
  }

  // 获取最佳匹配的资源
  protected getBestAsset(assets: DownloadAsset[]): DownloadAsset | null {
    const platformAssets = this.filterAssetsByPlatform(assets)

    if (platformAssets.length === 0) {
      return null
    }

    // 返回第一个匹配的资源（可以扩展为更智能的选择逻辑）
    return platformAssets[0]
  }

  // 解析版本标签
  protected parseVersionTag(tagName: string): { version: string, channel: AppPreviewChannel } {
    const tag = tagName.toLowerCase()

    if (tag.includes('snapshot') || tag.includes('alpha')) {
      return {
        version: tagName,
        channel: AppPreviewChannel.SNAPSHOT,
      }
    }
    if (tag.includes('beta')) {
      return {
        version: tagName,
        channel: AppPreviewChannel.BETA,
      }
    }

    return {
      version: tagName,
      channel: AppPreviewChannel.RELEASE,
    }
  }

  // 验证下载资源
  protected validateAsset(asset: DownloadAsset): void {
    if (!asset.name || !asset.url || !asset.size) {
      throw this.createError(UpdateErrorType.PARSE_ERROR, 'Invalid asset: missing required fields')
    }

    if (asset.size <= 0) {
      throw this.createError(UpdateErrorType.PARSE_ERROR, 'Invalid asset: invalid size')
    }

    if (!asset.url.startsWith('http')) {
      throw this.createError(UpdateErrorType.PARSE_ERROR, 'Invalid asset: invalid URL')
    }
  }

  // 验证Release数据
  protected validateRelease(release: GitHubRelease): void {
    if (!release.tag_name || !release.name || !release.published_at) {
      throw this.createError(
        UpdateErrorType.PARSE_ERROR,
        'Invalid release: missing required fields',
      )
    }

    if (!release.assets || !Array.isArray(release.assets)) {
      throw this.createError(
        UpdateErrorType.PARSE_ERROR,
        'Invalid release: missing or invalid assets',
      )
    }

    // 验证每个资源
    release.assets.forEach(asset => this.validateAsset(asset))
  }
}
