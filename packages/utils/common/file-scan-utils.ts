/**
 * 通用文件扫描工具函数
 * 提供统一的文件过滤和扫描逻辑，支持跨平台（Windows、macOS、Linux）
 *
 * @fileoverview 跨平台文件扫描工具集
 * @author Talex Touch Team
 * @version 1.0.0
 */

import type { FileScanOptions } from './file-scan-constants'
import { hasWindow } from '../env'
import {
  BASE_BLACKLISTED_DIRS,
  BLACKLISTED_EXTENSIONS,
  BLACKLISTED_FILE_PREFIXES,
  BLACKLISTED_FILE_SUFFIXES,
  DEFAULT_SCAN_OPTIONS,

  PATH_PATTERNS,
  PHOTOS_LIBRARY_CONFIG,
  PLATFORM,
} from './file-scan-constants'

const path = (() => {
  if (!hasWindow()) {
    return require('node:path')
  }
  try {
    return require('path-browserify')
  }
  catch {
    return require('node:path')
  }
})()

// 重新导出类型
export type { FileScanOptions }

/**
 * 扫描文件信息接口
 *
 * @interface ScannedFileInfo
 * @description 表示扫描到的文件信息
 */
export interface ScannedFileInfo {
  /** 文件的完整路径 */
  path: string
  /** 文件名（不包含路径） */
  name: string
  /** 文件扩展名（包含点号，如 '.txt'） */
  extension: string
  /** 文件大小（字节） */
  size: number
  /** 文件创建时间 */
  ctime: Date
  /** 文件修改时间 */
  mtime: Date
}

/**
 * 检查文件是否可被索引
 *
 * @function isIndexableFile
 * @description 根据文件路径、扩展名、文件名和扫描选项判断文件是否应该被索引
 * @param fullPath - 完整文件路径
 * @param extension - 文件扩展名（包含点号，如 '.txt'）
 * @param fileName - 文件名（不包含路径）
 * @param options - 扫描选项配置，可选
 * @returns 如果文件可被索引返回 true，否则返回 false
 *
 * @example
 * ```typescript
 * // 基础用法
 * const isIndexable = isIndexableFile('/path/to/file.txt', '.txt', 'file.txt')
 *
 * // 使用自定义选项
 * const customOptions = createScanOptions({
 *   enablePhotosLibraryFilter: true,
 *   customBlacklistedDirs: new Set(['my-custom-dir'])
 * })
 * const isIndexable = isIndexableFile('/path/to/file.txt', '.txt', 'file.txt', customOptions)
 * ```
 *
 * @since 1.0.0
 */
export function isIndexableFile(
  fullPath: string,
  extension: string,
  fileName: string,
  options: FileScanOptions = DEFAULT_SCAN_OPTIONS,
): boolean {
  // 合并选项
  const opts = { ...DEFAULT_SCAN_OPTIONS, ...options }

  // 基础检查
  if (!extension)
    return false

  // 检查扩展名黑名单
  const blacklistedExtensions = new Set([
    ...BLACKLISTED_EXTENSIONS,
    ...(opts.customBlacklistedExtensions || []),
  ])

  if (blacklistedExtensions.has(extension))
    return false

  // 检查文件名前缀和后缀
  if (fileName) {
    const firstChar = fileName[0]
    const lastChar = fileName[fileName.length - 1]

    if (BLACKLISTED_FILE_PREFIXES.has(firstChar))
      return false
    if (BLACKLISTED_FILE_SUFFIXES.has(lastChar))
      return false
  }

  // Photos Library 智能过滤（仅 macOS）
  if (opts.enablePhotosLibraryFilter && PLATFORM.IS_MACOS && fullPath.includes('Photos Library.photoslibrary')) {
    if (!isPhotosLibraryPathAllowed(fullPath)) {
      return false
    }
  }

  // 系统路径过滤
  if (opts.enableSystemPathFilter && isSystemPath(fullPath)) {
    return false
  }

  // 开发路径过滤
  if (opts.enableDevPathFilter && isDevPath(fullPath)) {
    return false
  }

  // 缓存路径过滤
  if (opts.enableCachePathFilter && isCachePath(fullPath)) {
    return false
  }

  // 目录黑名单检查
  const blacklistedDirs = new Set([
    ...BASE_BLACKLISTED_DIRS,
    ...(opts.customBlacklistedDirs || []),
  ])

  const segments = fullPath.split(path.sep)
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]
    if (!segment)
      continue
    if (segment.startsWith('.'))
      return false
    if (blacklistedDirs.has(segment))
      return false
  }

  // 自定义排除路径检查
  if (opts.customExcludePaths?.has(fullPath)) {
    return false
  }

  return true
}

/**
 * 检查 Photos Library 路径是否允许扫描
 *
 * @function isPhotosLibraryPathAllowed
 * @description 检查给定的 Photos Library 路径是否在允许扫描的范围内
 * @param fullPath - 完整文件路径
 * @returns 如果路径允许扫描返回 true，否则返回 false
 * @private
 * @since 1.0.0
 */
function isPhotosLibraryPathAllowed(fullPath: string): boolean {
  const config = PHOTOS_LIBRARY_CONFIG

  // 检查允许的子目录
  for (const allowedPath of config.PATH_PATTERNS.ALLOWED) {
    if (fullPath.includes(allowedPath)) {
      return true
    }
  }

  // 检查禁止的子目录
  for (const blockedPath of config.PATH_PATTERNS.BLOCKED) {
    if (fullPath.includes(blockedPath)) {
      return false
    }
  }

  // 默认允许（可能是根目录或其他未明确禁止的目录）
  return true
}

/**
 * 检查是否为系统路径
 *
 * @function isSystemPath
 * @description 检查给定路径是否为系统路径（跨平台）
 * @param fullPath - 完整文件路径
 * @returns 如果是系统路径返回 true，否则返回 false
 * @private
 * @since 1.0.0
 */
function isSystemPath(fullPath: string): boolean {
  return PATH_PATTERNS.SYSTEM_PATHS.some(pattern => pattern.test(fullPath))
}

/**
 * 检查是否为开发路径
 *
 * @function isDevPath
 * @description 检查给定路径是否为开发相关路径
 * @param fullPath - 完整文件路径
 * @returns 如果是开发路径返回 true，否则返回 false
 * @private
 * @since 1.0.0
 */
function isDevPath(fullPath: string): boolean {
  return PATH_PATTERNS.DEV_PATHS.some(pattern => pattern.test(fullPath))
}

/**
 * 检查是否为缓存路径
 *
 * @function isCachePath
 * @description 检查给定路径是否为缓存路径（跨平台）
 * @param fullPath - 完整文件路径
 * @returns 如果是缓存路径返回 true，否则返回 false
 * @private
 * @since 1.0.0
 */
function isCachePath(fullPath: string): boolean {
  return PATH_PATTERNS.CACHE_PATHS.some(pattern => pattern.test(fullPath))
}

/**
 * 扫描目录获取文件列表
 *
 * @function scanDirectory
 * @description 递归扫描指定目录，返回符合过滤条件的文件列表
 * @param dirPath - 要扫描的目录路径
 * @param options - 扫描选项配置，可选
 * @param excludePaths - 排除路径集合，可选
 * @returns Promise<ScannedFileInfo[]> 扫描到的文件信息列表
 *
 * @example
 * ```typescript
 * // 基础用法
 * const files = await scanDirectory('/path/to/scan')
 *
 * // 使用自定义选项
 * const customOptions = createScanOptions({
 *   enablePhotosLibraryFilter: true,
 *   customBlacklistedDirs: new Set(['my-custom-dir'])
 * })
 * const files = await scanDirectory('/path/to/scan', customOptions)
 *
 * // 排除特定路径
 * const excludePaths = new Set(['/path/to/exclude'])
 * const files = await scanDirectory('/path/to/scan', undefined, excludePaths)
 * ```
 *
 * @throws {Error} 当目录不存在或无法访问时，会静默返回空数组
 * @since 1.0.0
 */
export async function scanDirectory(
  dirPath: string,
  options: FileScanOptions = DEFAULT_SCAN_OPTIONS,
  excludePaths?: Set<string>,
): Promise<ScannedFileInfo[]> {
  const opts = { ...DEFAULT_SCAN_OPTIONS, ...options }

  // 检查是否在排除路径中
  if (excludePaths?.has(dirPath)) {
    return []
  }

  // 检查目录名是否在黑名单中
  const dirName = path.basename(dirPath)
  const blacklistedDirs = new Set([
    ...BASE_BLACKLISTED_DIRS,
    ...(opts.customBlacklistedDirs || []),
  ])

  if (blacklistedDirs.has(dirName) || dirName.startsWith('.')) {
    return []
  }

  // 检查是否为系统/开发/缓存路径
  if (opts.enableSystemPathFilter && isSystemPath(dirPath)) {
    return []
  }

  if (opts.enableDevPathFilter && isDevPath(dirPath)) {
    return []
  }

  if (opts.enableCachePathFilter && isCachePath(dirPath)) {
    return []
  }

  // 读取目录
  let entries: any[] = []
  try {
    const fs = await import('node:fs/promises')
    entries = await fs.readdir(dirPath, { withFileTypes: true })
  }
  catch {
    // 忽略权限错误等
    return []
  }

  const files: ScannedFileInfo[] = []

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)

    if (excludePaths?.has(fullPath)) {
      continue
    }

    if (entry.isDirectory()) {
      // 递归扫描子目录
      const subFiles = await scanDirectory(fullPath, opts, excludePaths)
      files.push(...subFiles)
    }
    else if (entry.isFile()) {
      const fileName = entry.name
      const fileExtension = path.extname(fileName).toLowerCase()

      // 检查文件是否可索引
      if (!isIndexableFile(fullPath, fileExtension, fileName, opts)) {
        continue
      }

      try {
        const fs = await import('node:fs/promises')
        const stats = await fs.stat(fullPath)
        files.push({
          path: fullPath,
          name: fileName,
          extension: fileExtension,
          size: stats.size,
          ctime: stats.birthtime ?? stats.ctime,
          mtime: stats.mtime,
        })
      }
      catch (error) {
        console.error(`[FileScanUtils] Could not stat file ${fullPath}:`, error)
      }
    }
  }

  return files
}

/**
 * 批量扫描多个目录
 *
 * @function scanDirectories
 * @description 批量扫描多个目录，返回所有符合过滤条件的文件列表
 * @param dirPaths - 要扫描的目录路径数组
 * @param options - 扫描选项配置，可选
 * @param excludePaths - 排除路径集合，可选
 * @returns Promise<ScannedFileInfo[]> 所有目录扫描到的文件信息列表
 *
 * @example
 * ```typescript
 * // 扫描多个目录
 * const dirPaths = ['/path/to/scan1', '/path/to/scan2', '/path/to/scan3']
 * const files = await scanDirectories(dirPaths)
 *
 * // 使用自定义选项
 * const customOptions = createScanOptions({
 *   enablePhotosLibraryFilter: true
 * })
 * const files = await scanDirectories(dirPaths, customOptions)
 * ```
 *
 * @throws {Error} 当某个目录扫描失败时，会记录错误但继续扫描其他目录
 * @since 1.0.0
 */
export async function scanDirectories(
  dirPaths: string[],
  options: FileScanOptions = DEFAULT_SCAN_OPTIONS,
  excludePaths?: Set<string>,
): Promise<ScannedFileInfo[]> {
  const allFiles: ScannedFileInfo[] = []

  for (const dirPath of dirPaths) {
    try {
      const files = await scanDirectory(dirPath, options, excludePaths)
      allFiles.push(...files)
    }
    catch (error) {
      console.error(`[FileScanUtils] Error scanning directory ${dirPath}:`, error)
    }
  }

  return allFiles
}

/**
 * 创建自定义扫描选项
 *
 * @function createScanOptions
 * @description 基于默认选项创建自定义扫描配置
 * @param customOptions - 自定义选项配置
 * @returns FileScanOptions 合并后的扫描选项
 *
 * @example
 * ```typescript
 * // 创建自定义选项
 * const customOptions = createScanOptions({
 *   enablePhotosLibraryFilter: true,
 *   customBlacklistedDirs: new Set(['my-custom-dir']),
 *   strictMode: false
 * })
 *
 * // 使用自定义选项扫描
 * const files = await scanDirectory('/path', undefined, customOptions)
 * ```
 *
 * @since 1.0.0
 */
export function createScanOptions(customOptions: Partial<FileScanOptions> = {}): FileScanOptions {
  return { ...DEFAULT_SCAN_OPTIONS, ...customOptions }
}

/**
 * 创建严格模式扫描选项
 *
 * @function createStrictScanOptions
 * @description 创建启用严格模式的扫描配置
 * @param customOptions - 额外的自定义选项配置
 * @returns FileScanOptions 严格模式扫描选项
 *
 * @example
 * ```typescript
 * // 创建严格模式选项
 * const strictOptions = createStrictScanOptions({
 *   customBlacklistedDirs: new Set(['additional-dir'])
 * })
 *
 * // 使用严格模式扫描
 * const files = await scanDirectory('/path', undefined, strictOptions)
 * ```
 *
 * @since 1.0.0
 */
export function createStrictScanOptions(customOptions: Partial<FileScanOptions> = {}): FileScanOptions {
  return { ...DEFAULT_SCAN_OPTIONS, strictMode: true, ...customOptions }
}
