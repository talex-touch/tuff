import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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
const PRECOMPUTED_MANIFEST_DEMO_LOADER_PREFIX = '../nexus-demo-loader:'
const PRECOMPUTED_MANIFEST_DEMO_COMPONENT_RE = /(?:^|\/)components\/content\/demos\//
const PRECOMPUTED_MANIFEST_STATIC_ASSET_RE = /\.(?:css|ttf|woff2?|jpg|jpeg|png|svg|webp)$/i
const PRECOMPUTED_MANIFEST_BUCKETS = ['scripts', 'styles', 'preload']
const VAR_NAME_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$'

function indexToVarName(index) {
  let n = index
  let out = ''
  do {
    out = VAR_NAME_ALPHABET[n % VAR_NAME_ALPHABET.length] + out
    n = Math.floor(n / VAR_NAME_ALPHABET.length) - 1
  } while (n >= 0)
  return `_${out}`
}

export function classifyPrecomputedDependency(key, entrypointSet) {
  if (entrypointSet.has(key))
    return 'keep'
  if (key.startsWith(PRECOMPUTED_MANIFEST_DEMO_LOADER_PREFIX))
    return 'demo-loader'
  if (PRECOMPUTED_MANIFEST_DEMO_COMPONENT_RE.test(key))
    return 'demo-component'
  if (PRECOMPUTED_MANIFEST_STATIC_ASSET_RE.test(key))
    return 'static-asset'
  return 'keep'
}

/**
 * Rebuilds `client.precomputed.mjs` from the parsed manifest object instead of slicing its
 * minified source: Vite/Nitro hoists shared asset descriptor objects (`e={...}`) inside
 * property values, so deleting a demo key by string slicing would break later references.
 *
 * `vue-bundle-renderer` only looks up keys present in `entrypoints` or registered via
 * `ssrContext.modules` during SSR; client-only demo loaders, demo SFCs (never bundled into
 * the Worker), and top-level static asset keys (`.css`, fonts, images) are unreachable at
 * Worker runtime because every `.vue`/`.js` entry already carries its flattened `styles`
 * and `preload` maps.
 */
export function serializePrecomputedClientManifest(manifest) {
  const dependencies = manifest?.dependencies && typeof manifest.dependencies === 'object'
    ? manifest.dependencies
    : {}
  const entrypoints = Array.isArray(manifest?.entrypoints) ? manifest.entrypoints : []
  const entrypointSet = new Set(entrypoints)

  const retainedEntries = []
  let removedDemoLoaders = 0
  let removedDemoComponents = 0
  let removedStaticAssets = 0
  let removedPrefetchMaps = 0

  for (const [key, entry] of Object.entries(dependencies)) {
    const classification = classifyPrecomputedDependency(key, entrypointSet)
    if (classification === 'demo-loader') {
      removedDemoLoaders++
      continue
    }
    if (classification === 'demo-component') {
      removedDemoComponents++
      continue
    }
    if (classification === 'static-asset') {
      removedStaticAssets++
      continue
    }
    if (entry && typeof entry === 'object' && 'prefetch' in entry)
      removedPrefetchMaps++
    retainedEntries.push([key, entry])
  }

  const leafCounts = new Map()
  const leafJsonByObject = new WeakMap()
  for (const [, entry] of retainedEntries) {
    if (!entry || typeof entry !== 'object')
      continue
    for (const bucket of PRECOMPUTED_MANIFEST_BUCKETS) {
      const map = entry[bucket]
      if (!map || typeof map !== 'object')
        continue
      for (const value of Object.values(map)) {
        if (!value || typeof value !== 'object')
          continue
        let json = leafJsonByObject.get(value)
        if (!json) {
          json = JSON.stringify(value)
          leafJsonByObject.set(value, json)
        }
        leafCounts.set(json, (leafCounts.get(json) ?? 0) + 1)
      }
    }
  }

  const jsonToVar = new Map()
  const declarations = []
  let varIndex = 0
  for (const [json, count] of [...leafCounts.entries()].sort((a, b) => b[1] - a[1])) {
    if (count < 2)
      continue
    const name = indexToVarName(varIndex++)
    jsonToVar.set(json, name)
    declarations.push(`${name}=${json}`)
  }

  const serializedEntries = retainedEntries.map(([key, entry]) => {
    const buckets = PRECOMPUTED_MANIFEST_BUCKETS.map((bucket) => {
      const map = entry && typeof entry === 'object' && entry[bucket] && typeof entry[bucket] === 'object'
        ? entry[bucket]
        : {}
      const pairs = Object.entries(map).map(([assetKey, value]) => {
        const json = value && typeof value === 'object'
          ? (leafJsonByObject.get(value) ?? JSON.stringify(value))
          : JSON.stringify(value)
        const ref = jsonToVar.get(json) ?? json
        return `${JSON.stringify(assetKey)}:${ref}`
      })
      return `${bucket}:{${pairs.join(',')}}`
    })
    return `${JSON.stringify(key)}:{${buckets.join(',')}}`
  })

  const prefix = declarations.length ? `const ${declarations.join(',')};` : ''
  const source = `${prefix}export default{dependencies:{${serializedEntries.join(',')}},entrypoints:${JSON.stringify(entrypoints)},modules:{}};`

  return {
    source,
    keptDependencies: retainedEntries.length,
    removedDemoLoaders,
    removedDemoComponents,
    removedStaticAssets,
    removedPrefetchMaps,
  }
}

export async function trimPrecomputedClientManifest(root = workerRoot) {
  const manifestPath = walkFiles(root).find(file => file.endsWith('/chunks/build/client.precomputed.mjs'))
  if (!manifestPath)
    return null

  const original = readFileSync(manifestPath, 'utf8')
  const moduleUrl = `${pathToFileURL(manifestPath).href}?t=${Date.now()}`
  const loaded = await import(moduleUrl)
  const manifest = loaded?.default
  if (!manifest || typeof manifest !== 'object' || !manifest.dependencies)
    throw new Error(`precomputed manifest default export is invalid: ${manifestPath}`)

  const result = serializePrecomputedClientManifest(manifest)
  writeFileSync(manifestPath, result.source)
  const removedBytes = Buffer.byteLength(original) - Buffer.byteLength(result.source)
  console.log(
    `[nexus-content-assets] trimmed client precomputed manifest: ${result.removedDemoLoaders} demo loaders, ${result.removedDemoComponents} demo components, ${result.removedStaticAssets} static asset keys, ${result.removedPrefetchMaps} prefetch maps (${result.keptDependencies} kept); ${removedBytes} bytes removed`,
  )
  return { ...result, removedBytes }
}

async function main() {
  trimDuplicateSqliteWasm()
  trimPrerenderedClientSqlDumps()
  await trimPrecomputedClientManifest()

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
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
