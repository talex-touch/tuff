import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const nexusRoot = join(currentDir, '..')
const distRoot = join(nexusRoot, 'dist')
const nuxtRoot = join(distRoot, '_nuxt')
const workerRoot = join(distRoot, '_worker.js')

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

function trimPrerenderedClientSqlDumps() {
  const contentRoot = join(distRoot, '__nuxt_content')
  const collections = readdirSync(distRoot)
    .map(fileName => fileName.match(/^dump\.([A-Za-z0-9_-]+)\.sql$/)?.[1])
    .filter(Boolean)
  if (!collections.length)
    throw new Error('[nexus-content-assets] required Cloudflare root SQL dumps are missing')

  const verifiedDumps = []
  let removedBytes = 0
  for (const collectionName of collections) {
    const rootFileName = `dump.${collectionName}.sql`
    const rootDumpPath = join(distRoot, rootFileName)
    const contentDumpPath = join(contentRoot, collectionName, 'sql_dump.txt')
    if (!existsSync(rootDumpPath) || statSync(rootDumpPath).size === 0)
      throw new Error(`[nexus-content-assets] required Cloudflare root SQL dump is missing or empty: ${rootFileName}`)

    if (existsSync(contentDumpPath)) {
      if (sha256(rootDumpPath) !== sha256(contentDumpPath))
        throw new Error(`[nexus-content-assets] root SQL dump does not match __nuxt_content dump: ${rootFileName}`)

      removedBytes += statSync(contentDumpPath).size
      rmSync(contentDumpPath)
      const collectionRoot = dirname(contentDumpPath)
      if (!readdirSync(collectionRoot).length)
        rmSync(collectionRoot, { recursive: true })
    }

    verifiedDumps.push(rootFileName)
  }

  if (existsSync(contentRoot) && !readdirSync(contentRoot).length)
    rmSync(contentRoot, { recursive: true })

  console.log(`[nexus-content-assets] verified Cloudflare root SQL dumps: ${verifiedDumps.join(', ')}`)
  console.log(`[nexus-content-assets] removed prerendered client SQL dumps: ${removedBytes} bytes`)
}
function findMatchingBrace(source, openingIndex) {
  let depth = 0
  let quote = null
  let escaped = false

  for (let index = openingIndex; index < source.length; index++) {
    const character = source[index]
    if (quote) {
      if (escaped)
        escaped = false
      else if (character === '\\')
        escaped = true
      else if (character === quote)
        quote = null
      continue
    }

    if (character === '"' || character === '\'' || character === '`') {
      quote = character
      continue
    }
    if (character === '{') {
      depth++
      continue
    }
    if (character === '}') {
      depth--
      if (depth === 0)
        return index
    }
  }

  throw new Error(`unclosed object starting at ${openingIndex}`)
}

function trimTopLevelProperties(source, marker, keyPrefix) {
  const markerIndex = source.indexOf(marker)
  if (markerIndex === -1)
    throw new Error(`precomputed manifest marker is missing: ${marker}`)

  const openingIndex = markerIndex + marker.length - 1
  const closingIndex = findMatchingBrace(source, openingIndex)
  const removals = []
  let depth = 1
  let index = openingIndex + 1

  while (index < closingIndex) {
    const character = source[index]
    if (character === '"' || character === '\'' || character === '`') {
      const quote = character
      let end = index + 1
      let escaped = false
      while (end < closingIndex) {
        const value = source[end]
        if (escaped)
          escaped = false
        else if (value === '\\')
          escaped = true
        else if (value === quote)
          break
        end++
      }

      const key = source.slice(index + 1, end)
      if (depth === 1 && quote === '"' && key.startsWith(keyPrefix)) {
        let valueStart = end + 1
        while (/\s/.test(source[valueStart] ?? ''))
          valueStart++
        if (source[valueStart] !== ':') {
          index = end + 1
          continue
        }
        valueStart++
        while (/\s/.test(source[valueStart] ?? ''))
          valueStart++
        if (source[valueStart] !== '{')
          throw new Error(`precomputed demo property is not an object: ${key}`)

        let propertyEnd = findMatchingBrace(source, valueStart) + 1
        while (/\s/.test(source[propertyEnd] ?? ''))
          propertyEnd++
        if (source[propertyEnd] === ',')
          propertyEnd++
        removals.push([index, propertyEnd])
        index = propertyEnd
        continue
      }

      index = end + 1
      continue
    }

    if (character === '{')
      depth++
    else if (character === '}')
      depth--
    index++
  }

  for (let index = removals.length - 1; index >= 0; index--) {
    const [start, end] = removals[index]
    source = source.slice(0, start) + source.slice(end)
  }
  return { source, removed: removals.length }
}

function replaceObjectSection(source, marker, replacement) {
  const markerIndex = source.indexOf(marker)
  if (markerIndex === -1)
    throw new Error(`precomputed manifest marker is missing: ${marker}`)
  const openingIndex = markerIndex + marker.length - 1
  const closingIndex = findMatchingBrace(source, openingIndex)
  return source.slice(0, openingIndex) + replacement + source.slice(closingIndex + 1)
}
function replaceLastObjectSection(source, marker, replacement) {
  const markerIndex = source.lastIndexOf(marker)
  if (markerIndex === -1)
    throw new Error(`precomputed manifest marker is missing: ${marker}`)
  const openingIndex = markerIndex + marker.length - 1
  const closingIndex = findMatchingBrace(source, openingIndex)
  return source.slice(0, openingIndex) + replacement + source.slice(closingIndex + 1)
}
function removeObjectProperties(source, marker) {
  let removed = 0
  let markerIndex = source.indexOf(marker)
  while (markerIndex !== -1) {
    const openingIndex = markerIndex + marker.length - 1
    const closingIndex = findMatchingBrace(source, openingIndex)
    let trailingIndex = closingIndex + 1
    while (/\s/.test(source[trailingIndex] ?? ''))
      trailingIndex++

    const hasTrailingComma = source[trailingIndex] === ','
    let start = markerIndex
    const end = hasTrailingComma ? trailingIndex + 1 : trailingIndex
    if (!hasTrailingComma) {
      let previousIndex = markerIndex - 1
      while (/\s/.test(source[previousIndex] ?? ''))
        previousIndex--
      if (source[previousIndex] === ',')
        start = previousIndex
    }

    source = source.slice(0, start) + source.slice(end)
    removed++
    markerIndex = source.indexOf(marker, start)
  }
  return { source, removed }
}

function trimPrecomputedClientManifest() {
  const manifestPath = walkFiles(workerRoot).find(file => file.endsWith('/chunks/build/client.precomputed.mjs'))
  if (!manifestPath)
    return

  const original = readFileSync(manifestPath, 'utf8')
  let source = original
  const trimmedDependencies = trimTopLevelProperties(source, 'dependencies:{', '../nexus-demo-loader:')
  source = trimmedDependencies.source
  source = replaceLastObjectSection(source, 'modules:{', '{}')
  const trimmedPrefetch = removeObjectProperties(source, 'prefetch:{')
  source = trimmedPrefetch.source

  if (source === original)
    return
  writeFileSync(manifestPath, source)
  console.log(`[nexus-content-assets] trimmed client precomputed manifest: ${trimmedDependencies.removed} demo loaders, ${trimmedPrefetch.removed} prefetch maps; ${Buffer.byteLength(original) - Buffer.byteLength(source)} bytes removed`)
}


trimDuplicateSqliteWasm()
trimPrerenderedClientSqlDumps()
trimPrecomputedClientManifest()

const remainingDuplicateWasm = walkFiles(nuxtRoot)
  .map(file => relative(nuxtRoot, file))
  .filter(file => /^sqlite3-[A-Za-z0-9_-]+\.wasm$/.test(file))

if (remainingDuplicateWasm.length) {
  console.error('[nexus-content-assets] duplicate sqlite wasm files remain:')
  for (const file of remainingDuplicateWasm)
    console.error(`  ${file}`)
  process.exit(1)
}

const remainingClientSqlDumps = walkFiles(distRoot)
  .map(file => relative(distRoot, file))
  .filter(file => /^__nuxt_content\/[A-Za-z0-9_-]+\/sql_dump\.txt$/.test(file))

if (remainingClientSqlDumps.length) {
  console.error('[nexus-content-assets] prerendered client SQL dumps remain:')
  for (const file of remainingClientSqlDumps)
    console.error(`  ${file}`)
  process.exit(1)
}
