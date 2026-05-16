import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const nexusRoot = join(currentDir, '..')
const distRoot = join(nexusRoot, 'dist')
const nuxtRoot = join(distRoot, '_nuxt')

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

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function trimDuplicateSqliteWasm() {
  const canonicalFileName = readdirSync(nuxtRoot).find(file => /^sqlite3\.[A-Za-z0-9_-]+\.wasm$/.test(file))
  const duplicateFileName = readdirSync(nuxtRoot).find(file => /^sqlite3-[A-Za-z0-9_-]+\.wasm$/.test(file))
  const workerFileName = readdirSync(nuxtRoot).find(file => /^sqlite3-worker1-bundler-friendly-.*\.js$/.test(file))

  if (!canonicalFileName || !duplicateFileName || !workerFileName) {
    console.log('[nexus-content-assets] sqlite wasm trim skipped; expected assets were not found')
    return
  }

  const canonicalPath = join(nuxtRoot, canonicalFileName)
  const duplicatePath = join(nuxtRoot, duplicateFileName)
  const workerPath = join(nuxtRoot, workerFileName)

  if (sha256(canonicalPath) !== sha256(duplicatePath)) {
    console.warn('[nexus-content-assets] sqlite wasm trim skipped; candidate wasm files are not identical')
    return
  }

  let workerSource = readFileSync(workerPath, 'utf8')
  if (!workerSource.includes(duplicateFileName)) {
    console.log('[nexus-content-assets] sqlite wasm trim skipped; worker does not reference duplicate wasm')
    return
  }

  workerSource = workerSource.replaceAll(duplicateFileName, canonicalFileName)
  writeFileSync(workerPath, workerSource)
  rmSync(duplicatePath)

  console.log(`[nexus-content-assets] removed duplicate sqlite wasm ${duplicateFileName}; worker now uses ${canonicalFileName}`)
}

trimDuplicateSqliteWasm()

const remainingDuplicateWasm = walkFiles(nuxtRoot)
  .map(file => relative(nuxtRoot, file))
  .filter(file => /^sqlite3-[A-Za-z0-9_-]+\.wasm$/.test(file))

if (remainingDuplicateWasm.length) {
  console.error('[nexus-content-assets] duplicate sqlite wasm files remain:')
  for (const file of remainingDuplicateWasm)
    console.error(`  ${file}`)
  process.exit(1)
}
