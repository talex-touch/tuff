import type { TuffItem } from '@core-box/tuff'
import type { FileScanOptions } from '@talex-touch/utils/common/file-scan-constants'
import type { files as filesSchema } from '../../../../db/schema'
import type { ScannedFileInfo } from './types'
import path from 'node:path'
import {
  isIndexableFile as globalIsIndexableFile,
  scanDirectory as globalScanDirectory,
} from '@talex-touch/utils/common/file-scan-utils'
import { WHITELISTED_EXTENSIONS } from './constants'

export function isIndexableFile(
  fullPath: string,
  extension: string,
  fileName: string,
  options?: FileScanOptions,
): boolean {
  // 使用全局工具进行基础过滤
  if (!globalIsIndexableFile(fullPath, extension, fileName, options)) {
    return false
  }

  // 检查是否在白名单扩展名中（应用特定的白名单检查）
  if (!WHITELISTED_EXTENSIONS.has(extension)) {
    return false
  }

  return true
}

export async function scanDirectory(
  dirPath: string,
  excludePaths?: Set<string>,
  options?: FileScanOptions,
): Promise<ScannedFileInfo[]> {
  // 使用全局扫描工具
  const globalFiles = await globalScanDirectory(dirPath, options, excludePaths)

  // 转换为本地 ScannedFileInfo 格式
  return globalFiles.map(file => ({
    path: file.path,
    name: file.name,
    extension: file.extension,
    size: file.size,
    ctime: file.ctime,
    mtime: file.mtime,
  }))
}

export function mapFileToTuffItem(
  file: typeof filesSchema.$inferSelect,
  _extensions: Record<string, string>,
  providerId: string,
  providerName: string,
): TuffItem {
  return {
    id: file.path,
    source: {
      type: 'file',
      id: providerId,
      name: providerName,
    },
    kind: 'file',
    render: {
      mode: 'default',
      basic: {
        title: file.name,
        subtitle: file.path,
        icon: {
          type: 'file',
          value: file.path,
        },
      },
    },
    actions: [
      {
        id: 'open-file',
        type: 'open',
        label: 'Open',
        primary: true,
        payload: {
          path: file.path,
        },
      },
      {
        id: 'open-folder',
        type: 'open',
        label: 'Open Folder',
        payload: {
          path: path.dirname(file.path),
        },
      },
    ],
    meta: {
      file: {
        path: file.path,
        size: file.size ?? undefined,
        created_at: file.ctime.toISOString(),
        modified_at: file.mtime.toISOString(),
        extension: (file.extension || path.extname(file.name) || '')
          .replace(/^\./, '')
          .toLowerCase(),
      },
    },
  }
}
