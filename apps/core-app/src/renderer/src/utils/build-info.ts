// @ts-ignore
import information from 'talex-touch:information'

export interface BuildInfo {
  version: string
  buildTime: number
  buildType: 'beta' | 'snapshot' | 'release'
  isSnapshot: boolean
  isBeta: boolean
  isRelease: boolean
  signature?: any
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
