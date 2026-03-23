import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_IGNORE_DIRS, TARGET_CODE_EXTENSIONS } from './scan-config.mjs'

export function normalizeRelativePath(fromRoot, filePath) {
  return path.relative(fromRoot, filePath).replace(/\\/g, '/')
}

export function shouldIgnoreDir(dirName, ignoreDirs = DEFAULT_IGNORE_DIRS) {
  return ignoreDirs.has(dirName)
}

export function isTargetFile(fileName, targetExtensions = TARGET_CODE_EXTENSIONS, includeDts = false) {
  return targetExtensions.has(path.extname(fileName)) || (includeDts && fileName.endsWith('.d.ts'))
}

export function walk(rootDir, options = {}, result = []) {
  const {
    ignoreDirs = DEFAULT_IGNORE_DIRS,
    targetExtensions = TARGET_CODE_EXTENSIONS,
    includeDts = false,
  } = options

  if (!fs.existsSync(rootDir)) {
    return result
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true })
  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      if (shouldIgnoreDir(entry.name, ignoreDirs)) {
        continue
      }
      walk(absolutePath, options, result)
      continue
    }

    if (!isTargetFile(entry.name, targetExtensions, includeDts)) {
      continue
    }
    result.push(absolutePath)
  }

  return result
}
