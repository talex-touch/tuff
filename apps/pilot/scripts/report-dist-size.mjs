import { readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import process from 'node:process'

const DIST_DIR = 'dist'
const NUXT_DIR = join(DIST_DIR, '_nuxt')

function walkFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath))
      continue
    }
    files.push(fullPath)
  }
  return files
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function safeStat(path) {
  try {
    return statSync(path)
  }
  catch {
    return null
  }
}

const distStat = safeStat(DIST_DIR)
const nuxtStat = safeStat(NUXT_DIR)

if (!distStat || !distStat.isDirectory()) {
  console.error('[report-dist-size] dist directory not found. Run `pnpm generate` first.')
  process.exit(1)
}

if (!nuxtStat || !nuxtStat.isDirectory()) {
  console.error('[report-dist-size] dist/_nuxt directory not found. Run `pnpm generate` first.')
  process.exit(1)
}

const files = walkFiles(NUXT_DIR)
const extTotals = new Map()
const typedFiles = []
let totalBytes = 0

for (const filePath of files) {
  const fileStat = statSync(filePath)
  const bytes = fileStat.size
  totalBytes += bytes
  const ext = extname(filePath).toLowerCase() || 'unknown'
  extTotals.set(ext, (extTotals.get(ext) || 0) + bytes)
  typedFiles.push({
    path: relative(DIST_DIR, filePath),
    bytes,
    ext,
  })
}

typedFiles.sort((a, b) => b.bytes - a.bytes)

console.log('=== Pilot dist/_nuxt size report ===')
console.log(`Total files: ${files.length}`)
console.log(`Total size: ${formatBytes(totalBytes)}`)
console.log('')

console.log('By extension:')
for (const [ext, bytes] of [...extTotals.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`- ${ext.padEnd(8)} ${formatBytes(bytes)}`)
}

console.log('')
console.log('Top 20 largest assets:')
for (const item of typedFiles.slice(0, 20)) {
  console.log(`- ${formatBytes(item.bytes).padStart(10)}  ${item.path}`)
}
