// @ts-ignore - talex-touch:information is a virtual module injected at build time
import information from 'talex-touch:information'

export interface BuildInfo {
  version: string
  buildTime: number
  buildIdentifier: string
  buildType: 'beta' | 'snapshot' | 'release'
  channel: 'RELEASE' | 'SNAPSHOT' | 'BETA' | 'UNKNOWN'
  isSnapshot: boolean
  isBeta: boolean
  isRelease: boolean
  gitCommitHash?: string
  officialSignature?: string
  hasOfficialKey: boolean
  refuse?: boolean
}

/**
 * 获取构建信息
 */
export function getBuildInfo(): BuildInfo {
  return information as BuildInfo
}

/**
 * 获取构建类型显示名称
 */
export function getBuildTypeDisplayName(): string {
  const info = getBuildInfo()

  if (info.isBeta) {
    return 'BETA'
  } else if (info.isSnapshot) {
    return 'SNAPSHOT'
  } else if (info.isRelease) {
    return 'RELEASE'
  }

  return 'UNKNOWN'
}

/**
 * 获取完整的版本字符串（包含构建类型）
 */
export function getFullVersionString(): string {
  const info = getBuildInfo()
  const typeDisplay = getBuildTypeDisplayName()

  if (info.isRelease) {
    return `v${info.version}`
  }

  return `v${info.version}-${typeDisplay}`
}

/**
 * 检查是否为开发版本（非正式版）
 */
export function isDevelopmentBuild(): boolean {
  const info = getBuildInfo()
  return info.isBeta || info.isSnapshot
}

/**
 * 获取构建时间的格式化字符串
 */
export function getBuildTimeString(): string {
  const info = getBuildInfo()
  return new Date(info.buildTime).toLocaleString()
}

/**
 * 获取构建标识符
 */
export function getBuildIdentifier(): string {
  const info = getBuildInfo()
  return info.buildIdentifier || 'unknown'
}

/**
 * 检查是否为官方构建
 */
export function isOfficialBuild(): boolean {
  const info = getBuildInfo()
  // 如果没有密钥，默认为非官方构建
  if (!info.hasOfficialKey) {
    return false
  }
  // 如果有签名，说明是官方构建
  return !!info.officialSignature
}
