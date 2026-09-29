import type { FileScanOptions } from '@talex-touch/utils/common/file-scan-constants'
import type { FileFilterReason } from '@talex-touch/utils/common/file-filter-service'
import fs from 'node:fs/promises'
import path from 'node:path'
import { CONTEXT_DEPENDENT_BLACKLISTED_DIRS } from '@talex-touch/utils/common/file-scan-constants'
import { fileFilterService } from '@talex-touch/utils/common/file-filter-service'

/**
 * One level of the file index's directory rule. Context-dependent names such as `build` and
 * `dist` are excluded only beside a project marker; unconditional names need no directory read.
 * Kept in a worker-safe module because the full-scan worker cannot import Electron-facing utils.
 */
export async function getDirectoryLevelExclusionReason(
  directoryPath: string,
  readdir: (directoryPath: string) => Promise<string[]> = (target) => fs.readdir(target),
  options?: FileScanOptions
): Promise<FileFilterReason | null> {
  const directoryName = path.basename(directoryPath).toLowerCase()
  let siblingNames: string[] | undefined = []
  if (CONTEXT_DEPENDENT_BLACKLISTED_DIRS.has(directoryName)) {
    try {
      siblingNames = await readdir(path.dirname(directoryPath))
    } catch {
      siblingNames = undefined
    }
  }
  return fileFilterService.getTraversalExclusionReason(directoryPath, options, {
    siblingNames
  })
}

export async function getFileTraversalExclusionReason(
  filePath: string,
  readdir?: (directoryPath: string) => Promise<string[]>
): Promise<FileFilterReason | null> {
  let directoryPath = path.dirname(filePath)
  while (true) {
    const reason = await getDirectoryLevelExclusionReason(directoryPath, readdir)
    if (reason) return reason

    const parent = path.dirname(directoryPath)
    if (parent === directoryPath) return null
    directoryPath = parent
  }
}
