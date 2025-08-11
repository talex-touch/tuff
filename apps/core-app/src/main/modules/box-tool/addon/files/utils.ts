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

export async function scanDirectory(dirPath: string): Promise<ScannedFileInfo[]> {
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

    if (entry.isDirectory()) {
      files.push(...(await scanDirectory(fullPath)))
    } else if (entry.isFile()) {
      const fileName = entry.name
      const fileExtension = path.extname(fileName).toLowerCase()

      // Blacklist checks
      if (
        BLACKLISTED_FILES_PREFIX.has(fileName[0]) ||
        BLACKLISTED_FILES_SUFFIX.has(fileName[fileName.length - 1]) ||
        BLACKLISTED_EXTENSIONS.has(fileExtension)
      ) {
        continue
      }

      // Whitelist check
      if (WHITELISTED_EXTENSIONS.has(fileExtension)) {
        try {
          const stats = await fs.stat(fullPath)
          files.push({
            path: fullPath,
            name: fileName,
            mtime: stats.mtime
          })
        } catch {
          console.error(`[FileProvider] Could not stat file ${fullPath}:`)
        }
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
      }
    ],
    meta: {
      file: {
        path: file.path
      }
    }
  }
}
