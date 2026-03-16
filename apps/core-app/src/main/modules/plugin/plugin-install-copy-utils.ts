import path from 'node:path'
import fse from 'fs-extra'

const NODE_MODULES_DIR = 'node_modules'

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

export function shouldSkipNodeModulesPath(filePath: string): boolean {
  return /(^|\/)node_modules(\/|$)/.test(normalizePath(filePath))
}

export async function removeNodeModulesDirs(rootDir: string): Promise<string[]> {
  const removed: string[] = []

  async function walk(currentDir: string): Promise<void> {
    const entries = await fse.readdir(currentDir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const fullPath = path.join(currentDir, entry.name)
      if (entry.name === NODE_MODULES_DIR) {
        await fse.remove(fullPath)
        removed.push(fullPath)
        continue
      }
      await walk(fullPath)
    }
  }

  await walk(rootDir)
  return removed
}
