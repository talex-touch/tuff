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

function verifyRequiredRootSqlDumps() {
  const contentRoot = join(distRoot, '__nuxt_content')
  if (!existsSync(contentRoot)) {
    console.log('[nexus-content-assets] root SQL dump verification skipped; __nuxt_content output is missing')
    return
  }

  const collections = readdirSync(contentRoot).filter((collectionName) => {
    return existsSync(join(contentRoot, collectionName, 'sql_dump.txt'))
  })
  if (!collections.length) {
    console.log('[nexus-content-assets] root SQL dump verification skipped; no __nuxt_content SQL dumps found')
    return
  }

  const verifiedDumps = []
  for (const collectionName of collections) {
    const rootFileName = `dump.${collectionName}.sql`
    const rootDumpPath = join(distRoot, rootFileName)
    const contentDumpPath = join(contentRoot, collectionName, 'sql_dump.txt')
    if (!existsSync(rootDumpPath)) {
      console.error(`[nexus-content-assets] required Cloudflare root SQL dump is missing: ${rootFileName}`)
      process.exit(1)
    }

    if (sha256(rootDumpPath) !== sha256(contentDumpPath)) {
      console.error(`[nexus-content-assets] root SQL dump does not match __nuxt_content dump: ${rootFileName}`)
      process.exit(1)
    }

    verifiedDumps.push(rootFileName)
  }

  console.log(`[nexus-content-assets] verified Cloudflare root SQL dumps: ${verifiedDumps.join(', ')}`)
}

trimDuplicateSqliteWasm()
verifyRequiredRootSqlDumps()

const remainingDuplicateWasm = walkFiles(nuxtRoot)
  .map(file => relative(nuxtRoot, file))
  .filter(file => /^sqlite3-[A-Za-z0-9_-]+\.wasm$/.test(file))

if (remainingDuplicateWasm.length) {
  console.error('[nexus-content-assets] duplicate sqlite wasm files remain:')
  for (const file of remainingDuplicateWasm)
    console.error(`  ${file}`)
  process.exit(1)
}
