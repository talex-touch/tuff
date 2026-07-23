import path from 'node:path'
import { StorageList } from '@talex-touch/utils'
import { app } from 'electron'
import { getMainConfig } from '../storage'
import type { FileIndexSettings } from '../box-tool/addon/files/types'

export type FileAccessRootId =
  | 'documents'
  | 'downloads'
  | 'desktop'
  | 'music'
  | 'pictures'
  | 'videos'
  | 'applications'
  | 'extra'

export interface FileAccessRootDescriptor {
  id: FileAccessRootId
  label: string
  path: string
  required: boolean
  purpose: 'file-index' | 'app-index'
}

const DEFAULT_FILE_INDEX_PATHS = [
  'documents',
  'downloads',
  'desktop',
  'music',
  'pictures',
  'videos'
] as const

// macOS TCC only gates Documents/Downloads/Desktop. Music/Pictures/Movies are not
// permission-protected and are always readable, so only the TCC-gated folders (plus
// user-added extras) should count toward the "file access granted" summary.
const TCC_REQUIRED_FILE_INDEX_PATHS = new Set<(typeof DEFAULT_FILE_INDEX_PATHS)[number]>([
  'documents',
  'downloads',
  'desktop'
])

function normalizePath(rawPath: string): string {
  return path.resolve(rawPath.trim())
}

function readFileIndexExtraPaths(): string[] {
  try {
    const settings = getMainConfig(StorageList.FILE_INDEX_SETTINGS) as
      | Partial<FileIndexSettings>
      | undefined
    return Array.isArray(settings?.extraPaths)
      ? settings.extraPaths.filter((value): value is string => typeof value === 'string')
      : []
  } catch {
    return []
  }
}

function pushAppPath(
  roots: FileAccessRootDescriptor[],
  id: FileAccessRootId,
  label: string,
  pathName: (typeof DEFAULT_FILE_INDEX_PATHS)[number],
  required: boolean
): void {
  try {
    const resolved = app.getPath(pathName)
    if (!resolved) return

    roots.push({
      id,
      label,
      path: normalizePath(resolved),
      required,
      purpose: 'file-index'
    })
  } catch {
    // Ignore unavailable Electron paths and continue with remaining roots.
  }
}

export function getFileAccessRootDescriptors(
  platform: NodeJS.Platform = process.platform
): FileAccessRootDescriptor[] {
  const roots: FileAccessRootDescriptor[] = []

  if (platform === 'darwin') {
    for (const pathName of DEFAULT_FILE_INDEX_PATHS) {
      pushAppPath(roots, pathName, pathName, pathName, TCC_REQUIRED_FILE_INDEX_PATHS.has(pathName))
    }
  }

  if (platform === 'darwin') {
    roots.push({
      id: 'applications',
      label: 'applications',
      path: '/Applications',
      required: false,
      purpose: 'app-index'
    })
  }

  if (platform === 'win32') {
    const appData = process.env.ProgramData
    if (appData) {
      roots.push({
        id: 'applications',
        label: 'applications',
        path: normalizePath(appData),
        required: false,
        purpose: 'app-index'
      })
    }
  }

  for (const extraPath of readFileIndexExtraPaths()) {
    const trimmed = extraPath.trim()
    if (!trimmed) continue

    roots.push({
      id: 'extra',
      label: path.basename(trimmed) || trimmed,
      path: normalizePath(trimmed),
      required: true,
      purpose: 'file-index'
    })
  }

  const seen = new Set<string>()
  return roots.filter((root) => {
    const key = root.path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
