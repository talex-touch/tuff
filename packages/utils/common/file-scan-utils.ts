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
 * 读取当前运行时平台。浏览器/渲染端没有 process，这里按 env 模块同样的方式
 * 从 globalThis 取，避免裸引用 process 在打包到 web 时炸掉。
 */
function resolveFsPlatform(): string {
  const platform = (globalThis as { process?: { platform?: unknown } }).process?.platform;
  return typeof platform === "string" ? platform : "";
}

const FS_PLATFORM = resolveFsPlatform();

/**
 * 文件索引唯一的路径归一入口。
 *
 * macOS 的 readdir 返回 NFD（分解式）Unicode，而剪贴板/配置/用户输入通常是 NFC。
 * 同一个文件因此会以两种字节序列进入索引：DB 查不中、reconcile 判成「磁盘上没有」
 * 然后删掉，重扫又插回来。所有进入文件索引的路径（扫描结果、watcher 事件、
 * 配置的 extraPaths、手动添加）都必须先过这里，DB 比较才是同类相比。
 *
 * **只在 darwin 归一。** APFS/HFS+ 两种形式都能解析到同一个文件，所以改写 id 是安全的；
 * ext4/NTFS 是字节精确的，把 NFD 文件按 NFC 存进索引会导致 stat 报 ENOENT
 * → 被清理闸门删掉 → 重扫再加回来的抖动循环，归一后的 extraPaths 甚至可能 readdir 失败。
 * 非 darwin 一律原样返回。
 *
 * 只做 Unicode 归一：不解析、不改大小写、不动分隔符。
 *
 * @param rawPath - 原始路径
 * @param platform - 目标平台，默认当前运行时；测试与「已知来自 macOS 的历史数据」显式传入
 * @since 1.0.0
 */
export function normalizeFsPath(
  rawPath: string,
  platform: string = FS_PLATFORM,
): string {
  if (typeof rawPath !== "string" || platform !== "darwin") {
    return rawPath;
  }
  return rawPath.normalize("NFC");
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
  await scanDirectoryInto(
    dirPath,
    opts,
    excludePaths,
    0,
    files,
    createScanDirectoryStats(),
  );
  return files;
}

export interface ScanDirectoryBatchOptions {
  batchSize?: number;
  signal?: AbortSignal;
}

/**
 * 一次扫描的产出计数。
 *
 * `errorCount > 0` 表示这次扫描「看不全」——目录读不动（TCC 撤权、卷被拔掉、
 * 根目录被改名）或文件 stat 失败。调用方据此区分「目录真的空了」与
 * 「我们读不到目录」，后者绝不能被当成删除依据。
 */
export interface ScanDirectoryStats {
  /** 成功 stat 并产出的文件数 */
  entryCount: number;
  /** 读目录 + stat 文件的失败次数 */
  errorCount: number;
}

interface ScanDirectoryBatchSink {
  batchSize: number;
  signal?: AbortSignal;
  flushChain: Promise<void>;
  onBatch: (batch: ScannedFileInfo[]) => Promise<void>;
}

function createScanDirectoryStats(): ScanDirectoryStats {
  return { entryCount: 0, errorCount: 0 };
}

export async function scanDirectoryBatches(
  dirPath: string,
  onBatch: (batch: ScannedFileInfo[]) => Promise<void>,
  options: FileScanOptions = DEFAULT_SCAN_OPTIONS,
  excludePaths?: Set<string>,
  batchOptions: ScanDirectoryBatchOptions = {},
): Promise<ScanDirectoryStats> {
  const opts = { ...DEFAULT_SCAN_OPTIONS, ...options };
  const pending: ScannedFileInfo[] = [];
  const stats = createScanDirectoryStats();
  const sink: ScanDirectoryBatchSink = {
    batchSize: Math.max(1, Math.floor(batchOptions.batchSize ?? 500)),
    signal: batchOptions.signal,
    flushChain: Promise.resolve(),
    onBatch,
  };
  sink.signal?.throwIfAborted();
  await scanDirectoryInto(dirPath, opts, excludePaths, 0, pending, stats, sink);
  if (pending.length > 0) {
    const batch = pending.splice(0, pending.length);
    sink.flushChain = sink.flushChain.then(
      async () => await sink.onBatch(batch),
    );
  }
  await sink.flushChain;
  sink.signal?.throwIfAborted();
  return stats;
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
  stats: ScanDirectoryStats,
  sink?: ScanDirectoryBatchSink,
): Promise<void> {
  sink?.signal?.throwIfAborted();
  if (depth > MAX_SCAN_DEPTH) return;
  if (excludePaths?.has(dirPath)) return;
  if (fileFilterService.getTraversalExclusionReason(dirPath, opts)) return;

  const fs = await getFsPromises();

  // Use a literal option at the call site so TypeScript retains the Dirent[] overload.
  // 读不动的目录必须被计数：静默返回空列表会让上层把「没权限」当成「空目录」，
  // 进而按空扫描结果删索引。
  const entries = await fs
    .readdir(dirPath, { withFileTypes: true })
    .catch(() => null);
  if (!entries) {
    stats.errorCount += 1;
    return;
  }

  const subDirs: string[] = [];
  const fileEntries: Array<{
    fullPath: string;
    fileName: string;
    extension: string;
  }> = [];

  for (const entry of entries) {
    sink?.signal?.throwIfAborted();
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
      sink?.signal?.throwIfAborted();
      try {
        const fileStats = await fs.stat(fullPath);
        // 唯一的路径入库口径（见 normalizeFsPath）：stat 用原始路径，
        // 入索引的一律是 NFC。
        out.push({
          path: normalizeFsPath(fullPath),
          name: normalizeFsPath(fileName),
          extension,
          size: fileStats.size,
          ctime: fileStats.birthtime ?? fileStats.ctime,
          mtime: fileStats.mtime,
        });
        stats.entryCount += 1;
        if (sink && out.length >= sink.batchSize) {
          const batch = out.splice(0, sink.batchSize);
          sink.flushChain = sink.flushChain.then(
            async () => await sink.onBatch(batch),
          );
          await sink.flushChain;
          sink.signal?.throwIfAborted();
        }
      } catch (error) {
        if (sink?.signal?.aborted) {
          throw sink.signal.reason ?? error;
        }
        stats.errorCount += 1;
        console.error(
          `[FileScanUtils] Could not stat file ${fullPath}:`,
          error,
        );
      }
    },
  );

  // Traverse serially to keep aggregate filesystem concurrency bounded.
  for (const subDir of subDirs) {
    await scanDirectoryInto(
      subDir,
      opts,
      excludePaths,
      depth + 1,
      out,
      stats,
      sink,
    );
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
