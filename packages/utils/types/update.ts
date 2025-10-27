// 更新源类型枚举
export enum UpdateProviderType {
  GITHUB = 'github',
  OFFICIAL = 'official',
  CUSTOM = 'custom'
}

// 更新源配置接口
export interface UpdateSourceConfig {
  type: UpdateProviderType
  name: string
  url?: string
  enabled: boolean
  priority: number
}

// 下载资源接口
export interface DownloadAsset {
  name: string
  url: string
  size: number
  platform: 'win32' | 'darwin' | 'linux'
  arch: 'x64' | 'arm64'
  checksum?: string
}

// GitHub Release接口（兼容GitHub API格式）
export interface GitHubRelease {
  tag_name: string
  name: string
  published_at: string
  body: string
  assets: DownloadAsset[]
}

// 更新检查结果接口
export interface UpdateCheckResult {
  hasUpdate: boolean
  release?: GitHubRelease
  error?: string
  source: string
}

// 自定义更新源配置
export interface CustomUpdateConfig {
  name: string
  url: string
  apiFormat: 'github' | 'custom'
  headers?: Record<string, string>
}

// 应用预览渠道枚举
export enum AppPreviewChannel {
  MASTER = 'master',
  SNAPSHOT = 'snapshot'
}

// 更新设置配置
export interface UpdateSettings {
  enabled: boolean
  frequency: 'startup' | 'daily' | 'weekly' | 'manual'
  source: UpdateSourceConfig
  crossChannel: boolean
  ignoredVersions: string[]
  customSources: CustomUpdateConfig[]
}

// 默认更新设置
export const defaultUpdateSettings: UpdateSettings = {
  enabled: true,
  frequency: 'startup',
  source: {
    type: UpdateProviderType.GITHUB,
    name: 'GitHub Releases',
    url: 'https://api.github.com/repos/talex-touch/tuff/releases',
    enabled: true,
    priority: 1
  },
  crossChannel: false,
  ignoredVersions: [],
  customSources: []
}

// 更新错误类型
export enum UpdateErrorType {
  NETWORK_ERROR = 'network_error',
  TIMEOUT_ERROR = 'timeout_error',
  API_ERROR = 'api_error',
  PARSE_ERROR = 'parse_error',
  VERSION_ERROR = 'version_error',
  UNKNOWN_ERROR = 'unknown_error'
}

// 更新错误接口
export interface UpdateError extends Error {
  type: UpdateErrorType
  code?: string
  statusCode?: number
}
