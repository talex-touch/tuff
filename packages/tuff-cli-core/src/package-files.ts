import type { PluginPackageEntry } from '@talex-touch/utils/plugin'
import fs from 'fs-extra'
import { globSync } from 'glob'
import path from 'pathe'

export function collectPackageEntries(root: string): PluginPackageEntry[] {
  return globSync('**/*', {
    cwd: root,
    dot: true,
    follow: false,
  }).map((relativePath) => {
    const normalizedPath = relativePath.replace(/\\/g, '/')
    const stats = fs.lstatSync(path.join(root, relativePath))
    const type: PluginPackageEntry['type'] = stats.isSymbolicLink()
      ? 'symlink'
      : stats.isDirectory()
        ? 'directory'
        : stats.isFile()
          ? 'file'
          : 'other'
    return {
      path: normalizedPath,
      type,
      size: stats.size,
    }
  })
}
