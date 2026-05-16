import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const nexusRoot = join(currentDir, '..')
const apiRoot = join(nexusRoot, 'server/api')

const forbiddenPathPatterns = [
  /(?:^|\/)__tests__(?:\/|$)/,
  /\.test\.ts$/,
  /\.api\.test\.ts$/,
  /(?:^|\/)test-utils\.ts$/,
]

function walkFiles(dir) {
  if (!existsSync(dir))
    return []

  const files = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      files.push(...walkFiles(fullPath))
      continue
    }
    if (stats.isFile())
      files.push(fullPath)
  }
  return files
}

const forbiddenFiles = walkFiles(apiRoot)
  .map(file => relative(apiRoot, file))
  .filter(file => forbiddenPathPatterns.some(pattern => pattern.test(file)))
  .sort()

if (forbiddenFiles.length) {
  console.error('[nexus-api-route-tree] test/dev files found under server/api:')
  for (const file of forbiddenFiles)
    console.error(`  ${file}`)
  process.exit(1)
}

console.log('[nexus-api-route-tree] server/api route tree verified')
