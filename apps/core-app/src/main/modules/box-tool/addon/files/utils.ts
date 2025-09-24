import path from 'path'
import fs from 'fs/promises'
import { Dirent } from 'fs'
import { files as filesSchema } from '../../../../db/schema'
import { ScannedFileInfo } from './types'
import {
  BLACKLISTED_DIRS,
  BLACKLISTED_EXTENSIONS,
  BLACKLISTED_FILES_PREFIX,
  BLACKLISTED_FILES_SUFFIX,
  WHITELISTED_EXTENSIONS
} from './constants'
import { TuffItem } from '@core-box/tuff'

export function isIndexableFile(fullPath: string, extension: string, fileName: string): boolean {
  if (!extension) return false
  if (BLACKLISTED_EXTENSIONS.has(extension)) return false
  if (!WHITELISTED_EXTENSIONS.has(extension)) return false

  if (fileName) {
    const firstChar = fileName[0]
    const lastChar = fileName[fileName.length - 1]
    if (BLACKLISTED_FILES_PREFIX.has(firstChar)) return false
    if (BLACKLISTED_FILES_SUFFIX.has(lastChar)) return false
  }

  const segments = fullPath.split(path.sep)
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]
    if (!segment) continue
    if (segment.startsWith('.')) return false
    if (BLACKLISTED_DIRS.has(segment)) return false
  }

  return true
}

export async function scanDirectory(
  dirPath: string,
  excludePaths?: Set<string>
): Promise<ScannedFileInfo[]> {
  if (excludePaths?.has(dirPath)) {
    return []
  }

  const dirName = path.basename(dirPath)
  if (BLACKLISTED_DIRS.has(dirName) || dirName.startsWith('.')) {
    return []
  }

  let entries: Dirent[] = []
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true })
  } catch {
    // Ignore permission errors etc.
    return []
  }

  const files: ScannedFileInfo[] = []
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)

    if (excludePaths?.has(fullPath)) {
      continue
    }

    if (entry.isDirectory()) {
      files.push(...(await scanDirectory(fullPath, excludePaths)))
    } else if (entry.isFile()) {
      const fileName = entry.name
      const fileExtension = path.extname(fileName).toLowerCase()

      if (!isIndexableFile(fullPath, fileExtension, fileName)) {
        continue
      }

      try {
        const stats = await fs.stat(fullPath)
        files.push({
          path: fullPath,
          name: fileName,
          extension: fileExtension,
          size: stats.size,
          ctime: stats.birthtime ?? stats.ctime,
          mtime: stats.mtime
        })
      } catch (error) {
        console.error(`[FileProvider] Could not stat file ${fullPath}:`, error)
      }
    }
  }
  return files
}

export function mapFileToTuffItem(
  file: typeof filesSchema.$inferSelect,
  extensions: Record<string, string>,
  providerId: string,
  providerName: string
): TuffItem {
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
        icon: {
          type: 'base64',
          value: extensions.icon || ''
        }
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
      }
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
