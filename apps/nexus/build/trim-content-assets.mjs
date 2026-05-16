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

function replaceJsonObjectEntry(source, key) {
  const quotedKey = JSON.stringify(key)
  const keyIndex = source.indexOf(`${quotedKey}:`)
  if (keyIndex === -1)
    return source

  let cursor = keyIndex + quotedKey.length + 1
  while (/\s/.test(source[cursor]))
    cursor += 1

  if (source[cursor] !== '{')
    return source

  let depth = 0
  let inString = false
  let escaped = false
  for (let index = cursor; index < source.length; index += 1) {
    const char = source[index]
    if (inString) {
      if (escaped) {
        escaped = false
      }
      else if (char === '\\') {
        escaped = true
      }
      else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') {
      depth += 1
      continue
    }
    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        let removeStart = keyIndex
        let removeEnd = index + 1

        let before = removeStart - 1
        while (before >= 0 && /\s/.test(source[before]))
          before -= 1

        let after = removeEnd
        while (after < source.length && /\s/.test(source[after]))
          after += 1

        if (source[before] === ',') {
          removeStart = before
        }
        else if (source[after] === ',') {
          removeEnd = after + 1
        }

        return `${source.slice(0, removeStart)}${source.slice(removeEnd)}`
      }
    }
  }

  return source
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

function trimDuplicateRootSqlDumps() {
  const contentRoot = join(distRoot, '__nuxt_content')
  if (!existsSync(contentRoot)) {
    console.log('[nexus-content-assets] root SQL dump trim skipped; __nuxt_content output is missing')
    return
  }

  const rootSqlDumps = readdirSync(distRoot).filter(file => /^dump\.[A-Za-z0-9_-]+\.sql$/.test(file))
  if (!rootSqlDumps.length) {
    console.log('[nexus-content-assets] root SQL dump trim skipped; no root dump.*.sql files found')
    return
  }

  const removedDumps = []
  for (const rootFileName of rootSqlDumps) {
    const collectionName = rootFileName.match(/^dump\.([A-Za-z0-9_-]+)\.sql$/)?.[1]
    if (!collectionName)
      continue

    const rootDumpPath = join(distRoot, rootFileName)
    const contentDumpPath = join(contentRoot, collectionName, 'sql_dump.txt')
    if (!existsSync(contentDumpPath)) {
      console.warn(`[nexus-content-assets] root SQL dump trim skipped for ${rootFileName}; matching __nuxt_content dump is missing`)
      continue
    }

    if (sha256(rootDumpPath) !== sha256(contentDumpPath)) {
      console.warn(`[nexus-content-assets] root SQL dump trim skipped for ${rootFileName}; dump files are not identical`)
      continue
    }

    rmSync(rootDumpPath)
    removedDumps.push(rootFileName)
  }

  if (!removedDumps.length)
    return

  const routesJsonPath = join(distRoot, '_routes.json')
  if (existsSync(routesJsonPath)) {
    const routesJson = JSON.parse(readFileSync(routesJsonPath, 'utf8'))
    if (Array.isArray(routesJson.exclude))
      routesJson.exclude = routesJson.exclude.filter(route => !removedDumps.includes(route.replace(/^\//, '')))
    writeFileSync(routesJsonPath, `${JSON.stringify(routesJson, null, 2)}\n`)
  }

  for (const file of walkFiles(join(distRoot, '_worker.js')).filter(file => /\.(?:mjs|js)$/.test(file) && !file.endsWith('.map'))) {
    let source = readFileSync(file, 'utf8')
    const originalSource = source
    for (const rootFileName of removedDumps)
      source = replaceJsonObjectEntry(source, `/${rootFileName}`)
    if (source !== originalSource)
      writeFileSync(file, source)
  }

  console.log(`[nexus-content-assets] removed duplicate root SQL dumps: ${removedDumps.join(', ')}`)
}

trimDuplicateSqliteWasm()
trimDuplicateRootSqlDumps()

const remainingDuplicateWasm = walkFiles(nuxtRoot)
  .map(file => relative(nuxtRoot, file))
  .filter(file => /^sqlite3-[A-Za-z0-9_-]+\.wasm$/.test(file))

if (remainingDuplicateWasm.length) {
  console.error('[nexus-content-assets] duplicate sqlite wasm files remain:')
  for (const file of remainingDuplicateWasm)
    console.error(`  ${file}`)
  process.exit(1)
}

const remainingRootSqlDumps = walkFiles(distRoot)
  .map(file => relative(distRoot, file))
  .filter(file => /^dump\.[A-Za-z0-9_-]+\.sql$/.test(file))

if (remainingRootSqlDumps.length) {
  console.error('[nexus-content-assets] duplicate root SQL dump files remain:')
  for (const file of remainingRootSqlDumps)
    console.error(`  ${file}`)
  process.exit(1)
}
