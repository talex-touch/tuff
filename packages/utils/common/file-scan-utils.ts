/**
 * 通用文件扫描工具函数
 * 提供统一的文件过滤和扫描逻辑，支持跨平台（Windows、macOS、Linux）
 *
 * @fileoverview 跨平台文件扫描工具集
 * @author Talex Touch Team
 * @version 1.0.0
 */

import pathBrowserify from "path-browserify";
import type { FileScanOptions } from "./file-scan-constants";
import { hasWindow } from "../env";
import { fileFilterService } from "./file-filter-service";
import { DEFAULT_SCAN_OPTIONS } from "./file-scan-constants";

const path = (() => {
  if (hasWindow()) {
    return pathBrowserify;
  }

  const nodeRequire = typeof require === "function" ? require : null;
  if (nodeRequire) {
    try {
      return nodeRequire("node:path");
    } catch {
      return pathBrowserify;
    }
  }

  return pathBrowserify;
})();

// 重新导出类型
export type { FileScanOptions };

/**
 * 判断某个路径段是否为应被整体跳过的媒体库 package（如 *.photoslibrary）。
 * 大小写不敏感 —— 这正是旧 Photos Library 放行逻辑被绕过、导致衍生图/缓存被错误索引的根因。
 */

/**
 * 扫描文件信息接口
 *
 * @interface ScannedFileInfo
 * @description 表示扫描到的文件信息
 */
export interface ScannedFileInfo {
  /** 文件的完整路径 */
  path: string;
  /** 文件名（不包含路径） */
  name: string;
  /** 文件扩展名（包含点号，如 '.txt'） */
  extension: string;
  /** 文件大小（字节） */
  size: number;
  /** 文件创建时间 */
  ctime: Date;
  /** 文件修改时间 */
  mtime: Date;
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
  return (
    fileFilterService.getIndexExclusionReason(
      {
        path: fullPath,
        name: fileName,
        extension,
      },
      options,
    ) === null
  );
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
  // 选项只在入口合并一次，避免每层递归重复展开生成垃圾对象
  const opts = { ...DEFAULT_SCAN_OPTIONS, ...options };
  const files: ScannedFileInfo[] = [];
  await scanDirectoryInto(dirPath, opts, excludePaths, 0, files);
  return files;
}

// ---- scanDirectory 内部实现与工具 ----

/**
 * 递归深度上限，防止异常深的目录树或软链环导致的栈/耗时失控
 */
const MAX_SCAN_DEPTH = 24;

/**
 * 单个目录内并发 stat 文件的上限。文件是叶子操作（不再递归），
 * 因此该并发不会与目录递归相互抢占而死锁
 */
const FILE_STAT_CONCURRENCY = 32;

/**
 * 惰性并缓存 node:fs/promises 模块引用。
 * 大规模扫描下避免“每个目录 + 每个文件”都重复执行一次动态 import 的微任务开销；
 * 仍保持动态 import（而非顶层静态 import），因为本模块也会被打包到浏览器/渲染端，
 * 那里没有 node:fs。
 */
let fsPromisesPromise: Promise<typeof import("node:fs/promises")> | null = null;
function getFsPromises(): Promise<typeof import("node:fs/promises")> {
  if (!fsPromisesPromise) {
    fsPromisesPromise = import("node:fs/promises");
  }
  return fsPromisesPromise;
}

/**
 * 以固定并发量遍历执行异步任务的轻量池（共享游标，无递归不会死锁）
 */
async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      if (item === undefined) continue;
      await task(item);
    }
  });
  await Promise.all(workers);
}

/**
 * scanDirectory 的递归核心：命中文件直接 push 进共享的 out 数组，
 * 避免 files.push(...subFiles) 这种展开累积（超大数组会触达参数个数上限并产生拷贝）
 */
async function scanDirectoryInto(
  dirPath: string,
  opts: FileScanOptions,
  excludePaths: Set<string> | undefined,
  depth: number,
  out: ScannedFileInfo[],
): Promise<void> {
  if (depth > MAX_SCAN_DEPTH) return;
  if (excludePaths?.has(dirPath)) return;
  if (fileFilterService.getTraversalExclusionReason(dirPath, opts)) return;

  const fs = await getFsPromises();

  // Use a literal option at the call site so TypeScript retains the Dirent[] overload.
  const entries = await fs
    .readdir(dirPath, { withFileTypes: true })
    .catch(() => null);
  if (!entries) return;

  const subDirs: string[] = [];
  const fileEntries: Array<{
    fullPath: string;
    fileName: string;
    extension: string;
  }> = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (excludePaths?.has(fullPath)) continue;

    if (entry.isDirectory()) {
      subDirs.push(fullPath);
      continue;
    }
    if (!entry.isFile()) continue;

    const fileName = entry.name;
    const extension = path.extname(fileName).toLowerCase();
    if (!isIndexableFile(fullPath, extension, fileName, opts)) continue;
    fileEntries.push({ fullPath, fileName, extension });
  }

  await mapWithConcurrency(
    fileEntries,
    FILE_STAT_CONCURRENCY,
    async ({ fullPath, fileName, extension }) => {
      try {
        const stats = await fs.stat(fullPath);
        out.push({
          path: fullPath,
          name: fileName,
          extension,
          size: stats.size,
          ctime: stats.birthtime ?? stats.ctime,
          mtime: stats.mtime,
        });
      } catch (error) {
        console.error(
          `[FileScanUtils] Could not stat file ${fullPath}:`,
          error,
        );
      }
    },
  );

  // Traverse serially to keep aggregate filesystem concurrency bounded.
  for (const subDir of subDirs) {
    await scanDirectoryInto(subDir, opts, excludePaths, depth + 1, out);
  }
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
  const allFiles: ScannedFileInfo[] = [];

  for (const dirPath of dirPaths) {
    try {
      const files = await scanDirectory(dirPath, options, excludePaths);
      allFiles.push(...files);
    } catch (error) {
      console.error(
        `[FileScanUtils] Error scanning directory ${dirPath}:`,
        error,
      );
    }
  }

  return allFiles;
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
export function createScanOptions(
  customOptions: Partial<FileScanOptions> = {},
): FileScanOptions {
  return { ...DEFAULT_SCAN_OPTIONS, ...customOptions };
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
export function createStrictScanOptions(
  customOptions: Partial<FileScanOptions> = {},
): FileScanOptions {
  return { ...DEFAULT_SCAN_OPTIONS, strictMode: true, ...customOptions };
}
