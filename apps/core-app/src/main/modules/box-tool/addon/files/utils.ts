import type { TuffItem } from '@core-box/tuff'
import type { FileScanOptions } from '@talex-touch/utils/common/file-scan-constants'
import type { files as filesSchema } from '../../../../db/schema'
import type { ScannedFileInfo } from './types'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { toTfileUrl } from '@talex-touch/utils/network'
import {
  isIndexableFile as globalIsIndexableFile,
  scanDirectory as globalScanDirectory
} from '@talex-touch/utils/common/file-scan-utils'
import { WHITELISTED_EXTENSIONS } from './constants'
import {
  THUMBNAIL_EXTENSIONS,
  VIDEO_THUMBNAIL_EXTENSIONS,
  normalizeExtension
} from './thumbnail-config'
import {
  QUICK_OPS_FILE_BASE64_ACTION_ID,
  QUICK_OPS_FILE_HASH_ACTION_ID
} from './quick-ops-file-actions'

const DIRECT_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'svg', 'gif', 'bmp', 'webp', 'ico'])

export function isIndexableFile(
  fullPath: string,
  extension: string,
  fileName: string,
  options?: FileScanOptions
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
  options?: FileScanOptions
): Promise<ScannedFileInfo[]> {
  // 使用全局扫描工具
  const globalFiles = await globalScanDirectory(dirPath, options, excludePaths)

  // 转换为本地 ScannedFileInfo 格式
  return globalFiles.map((file) => ({
    path: file.path,
    name: file.name,
    extension: file.extension,
    size: file.size,
    ctime: file.ctime,
    mtime: file.mtime
  }))
}

export function mapFileToTuffItem(
  file: typeof filesSchema.$inferSelect,
  _extensions: Record<string, string>,
  providerId: string,
  providerName: string,
  onMissingIcon?: (file: typeof filesSchema.$inferSelect) => void,
  onMissingThumbnail?: (file: typeof filesSchema.$inferSelect) => void
): TuffItem {
  const extension = normalizeExtension(file.extension || path.extname(file.name) || '')

  let icon: { type: 'file' | 'url' | 'class' | 'emoji'; value: string }

  if (_extensions.thumbnail) {
    // Use pre-generated thumbnail for fast display
    icon = {
      type: 'url',
      value: _extensions.thumbnail.startsWith('data:')
        ? _extensions.thumbnail
        : toTfileUrl(_extensions.thumbnail)
    }
  } else if (THUMBNAIL_EXTENSIONS.has(extension) && onMissingThumbnail) {
    // Prefer placeholder until thumbnail is ready to avoid blocking IO
    onMissingThumbnail?.(file)
    icon = {
      type: 'class',
      value: VIDEO_THUMBNAIL_EXTENSIONS.has(extension) ? 'i-ri-video-line' : 'i-ri-image-line'
    }
  } else if (DIRECT_IMAGE_EXTENSIONS.has(extension)) {
    icon = {
      type: 'file',
      value: file.path
    }
  } else if (_extensions.icon) {
    icon = {
      type: 'url',
      value: _extensions.icon.startsWith('data:') ? _extensions.icon : toTfileUrl(_extensions.icon)
    }
  } else {
    // Trigger lazy load if callback provided
    onMissingIcon?.(file)
    // Return default/empty icon while loading
    icon = {
      type: 'class',
      value: 'i-ri-file-line' // Default file icon
    }
  }

  return {
    id: file.path,
    source: {
      type: 'file',
      id: providerId,
      name: providerName
    },
    kind: 'file',
    render: {
      mode: 'default',
      basic: {
        title: file.name,
        subtitle: file.path,
        icon
      }
    },
    actions: [
      {
        id: 'open-file',
        type: 'open',
        label: 'Open',
        primary: true,
        payload: {
          path: file.path
        }
      },
      {
        id: 'open-folder',
        type: 'open',
        label: 'Open Folder',
        payload: {
          path: path.dirname(file.path)
        }
      },
      {
        id: QUICK_OPS_FILE_HASH_ACTION_ID,
        type: 'execute',
        label: 'Copy Hashes'
      },
      {
        id: QUICK_OPS_FILE_BASE64_ACTION_ID,
        type: 'execute',
        label: 'Copy Base64'
      },
      ...buildQuickOpsFilePathActions(file.path)
    ],
    meta: {
      file: {
        path: file.path,
        size: file.size ?? undefined,
        created_at: file.ctime.toISOString(),
        modified_at: file.mtime.toISOString(),
        extension: (file.extension || path.extname(file.name) || '')
          .replace(/^\./, '')
          .toLowerCase()
      }
    }
  }
}

function buildQuickOpsFilePathActions(filePath: string): NonNullable<TuffItem['actions']> {
  const windowsPath = convertWslPathToWindowsPath(filePath)
  const wslPath = convertWindowsPathToWslPath(filePath)
  const actions: NonNullable<TuffItem['actions']> = [
    {
      id: 'quick-ops-copy-file-path',
      type: 'copy',
      label: 'Copy Path',
      payload: {
        text: filePath
      }
    },
    {
      id: 'quick-ops-copy-shell-path',
      type: 'copy',
      label: 'Copy Shell Path',
      payload: {
        text: escapeShellPath(filePath)
      }
    },
    {
      id: 'quick-ops-copy-file-url',
      type: 'copy',
      label: 'Copy File URL',
      payload: {
        text: pathToFileURL(filePath).href
      }
    }
  ]

  if (windowsPath) {
    actions.push({
      id: 'quick-ops-copy-windows-path',
      type: 'copy',
      label: 'Copy Windows Path',
      payload: {
        text: windowsPath
      }
    })
  }

  if (wslPath) {
    actions.push({
      id: 'quick-ops-copy-wsl-path',
      type: 'copy',
      label: 'Copy WSL Path',
      payload: {
        text: wslPath
      }
    })
  }

  return actions
}

function escapeShellPath(filePath: string): string {
  return `'${filePath.replace(/'/g, "'\\''")}'`
}

function convertWindowsPathToWslPath(filePath: string): string | undefined {
  const match = /^([a-zA-Z]):[\\/](.*)$/.exec(filePath)
  if (!match) return undefined

  const drive = match[1].toLowerCase()
  const rest = match[2].replace(/\\/g, '/')
  return `/mnt/${drive}/${rest}`
}

function convertWslPathToWindowsPath(filePath: string): string | undefined {
  const match = /^\/mnt\/([a-zA-Z])(?:\/(.*))?$/.exec(filePath)
  if (!match) return undefined

  const drive = match[1].toUpperCase()
  const rest = match[2]?.replace(/\//g, '\\') ?? ''
  return rest ? `${drive}:\\${rest}` : `${drive}:\\`
}
