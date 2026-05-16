import { gzipSync } from 'node:zlib'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const nexusRoot = join(currentDir, '..')
const distRoot = join(nexusRoot, 'dist')
const workerRoot = join(distRoot, '_worker.js')
const routesJsonPath = join(distRoot, '_routes.json')
const serviceWorkerPath = join(distRoot, 'sw.js')
const oneMiB = 1024 * 1024
const distBudget = {
  maxTotalBytes: 60 * oneMiB,
  maxFileBytes: 20 * oneMiB,
  maxWorkerExecutableBytes: 20 * oneMiB,
  maxWorkerGzipBytes: 2.7 * oneMiB,
}

const expectedStaticRoutes = [
  '/',
  '/next',
  '/docs',
  '/pricing',
  '/license',
  '/privacy',
  '/protocol',
  '/updates',
  '/store',
  '/sign-in',
  '/forgot-password',
  '/verify-waiting',
  '/device-auth',
  '/api/docs/component-sync',
  '/api/docs/navigation',
  '/api/docs/sidebar-components',
]

const suspiciousServerPatterns = [
  {
    label: '@talex-touch/tuff-intelligence root barrel',
    pattern: /@talex-touch\/tuff-intelligence(?!\/light|\/types\/intelligence)/,
  },
  {
    label: 'tuff-intelligence runtime barrel',
    pattern: /packages\/tuff-intelligence\/src\/index\.ts/,
  },
]
const allowedDemoWorkerChunks = new Set(['TuffDemoWrapper'])
const forbiddenRouteChunkPatterns = [
  /(?:^|\/)__tests__(?:\/|$)/,
  /\.api\.test\.mjs$/,
  /(?:^|\/)test-utils\.mjs$/,
  /(?:^|\/)provider-registry-test-utils\.mjs$/,
  /(?:^|\/)hero-v\d+-/,
  /(?:^|\/)flip-overlay-stack-/,
  /(?:^|\/)apitable-/,
]
const forbiddenServiceWorkerPrecachePatterns = [
  /__nuxt_content\//,
  /dump\.[^"']+\.sql/,
  /sqlite3[^"']*/,
  /\.wasm/,
]

function formatBytes(bytes) {
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`
}

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

function readRoutesJson() {
  if (!existsSync(routesJsonPath)) {
    return null
  }

  return JSON.parse(readFileSync(routesJsonPath, 'utf8'))
}

function analyzeWorkerFiles() {
  const executableFiles = walkFiles(workerRoot)
    .filter(file => /\.(?:mjs|js)$/.test(file))
    .filter(file => !file.endsWith('.map'))
    .map((file) => {
      const bytes = statSync(file).size
      return {
        file,
        relativePath: relative(workerRoot, file),
        bytes,
      }
    })
    .sort((a, b) => b.bytes - a.bytes)

  const totalBytes = executableFiles.reduce((sum, file) => sum + file.bytes, 0)
  return { executableFiles, totalBytes }
}

function analyzeDistFiles() {
  const files = walkFiles(distRoot)
    .map((file) => {
      const bytes = statSync(file).size
      return {
        file,
        relativePath: relative(distRoot, file),
        bytes,
      }
    })
    .sort((a, b) => b.bytes - a.bytes)

  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0)
  return { files, totalBytes }
}

function getWorkerGzipBytes(files) {
  const source = files.map(file => readFileSync(file.file)).join('\n')
  return gzipSync(source, { level: 9 }).byteLength
}

function checkSizeBudgets(distFiles, distTotalBytes, workerTotalBytes, workerGzipBytes) {
  const findings = []
  if (distTotalBytes > distBudget.maxTotalBytes) {
    findings.push(`dist total ${formatBytes(distTotalBytes)} exceeds ${formatBytes(distBudget.maxTotalBytes)}`)
  }

  const oversizedFiles = distFiles.filter(file => file.bytes > distBudget.maxFileBytes)
  for (const file of oversizedFiles) {
    findings.push(`dist file ${file.relativePath} is ${formatBytes(file.bytes)} > ${formatBytes(distBudget.maxFileBytes)}`)
  }

  if (workerTotalBytes > distBudget.maxWorkerExecutableBytes) {
    findings.push(`Worker executable JS ${formatBytes(workerTotalBytes)} exceeds ${formatBytes(distBudget.maxWorkerExecutableBytes)}`)
  }

  if (workerGzipBytes > distBudget.maxWorkerGzipBytes) {
    findings.push(`Worker gzip ${formatBytes(workerGzipBytes)} exceeds ${formatBytes(distBudget.maxWorkerGzipBytes)}`)
  }

  return findings
}

function checkRoutes() {
  const routesJson = readRoutesJson()
  if (!routesJson) {
    return {
      ok: true,
      message: 'dist/_routes.json is missing; static route exclusion check skipped.',
    }
  }

  const excluded = new Set(Array.isArray(routesJson.exclude) ? routesJson.exclude : [])
  const missing = expectedStaticRoutes.filter(route => !excluded.has(route))

  return {
    ok: missing.length === 0,
    message: missing.length
      ? `Missing static route exclusions: ${missing.join(', ')}`
      : `Static route exclusions verified: ${expectedStaticRoutes.length}`,
  }
}

function checkSuspiciousPatterns(files) {
  const findings = []

  for (const file of files) {
    const source = readFileSync(file.file, 'utf8')
    for (const check of suspiciousServerPatterns) {
      if (check.pattern.test(source)) {
        findings.push({
          label: check.label,
          file: file.relativePath,
        })
      }
    }
  }

  return findings
}

function getChunkBaseName(file) {
  return file.relativePath
    .split('/')
    .pop()
    ?.replace(/-[A-Za-z0-9_-]+\.mjs$/, '')
    .replace(/\.mjs$/, '')
}

function checkDemoWorkerChunks(files) {
  return files
    .filter(file => file.relativePath.startsWith('chunks/build/'))
    .filter(file => file.relativePath.endsWith('.mjs'))
    .filter((file) => {
      const baseName = getChunkBaseName(file)
      return baseName?.includes('Demo') && !allowedDemoWorkerChunks.has(baseName)
    })
    .map(file => file.relativePath)
}

function checkForbiddenRouteChunks(files) {
  return files
    .filter(file => file.relativePath.startsWith('chunks/routes/'))
    .filter(file => forbiddenRouteChunkPatterns.some(pattern => pattern.test(file.relativePath)))
    .map(file => file.relativePath)
}

function checkServiceWorkerPrecache() {
  if (!existsSync(serviceWorkerPath))
    return []

  const source = readFileSync(serviceWorkerPath, 'utf8')
  const matches = new Set()
  for (const pattern of forbiddenServiceWorkerPrecachePatterns) {
    for (const match of source.matchAll(new RegExp(`url:[\"'][^\"']*${pattern.source}[^\"']*[\"']`, 'g')))
      matches.add(match[0])
  }

  return Array.from(matches).sort()
}

if (!existsSync(workerRoot)) {
  console.error('[nexus-worker-bundle] dist/_worker.js is missing. Run `pnpm -C "apps/nexus" run build` first.')
  process.exit(1)
}

const { executableFiles, totalBytes } = analyzeWorkerFiles()
const workerGzipBytes = getWorkerGzipBytes(executableFiles)
const { files: distFiles, totalBytes: distTotalBytes } = analyzeDistFiles()
const routeCheck = checkRoutes()
const suspiciousFindings = checkSuspiciousPatterns(executableFiles)
const demoWorkerChunks = checkDemoWorkerChunks(executableFiles)
const forbiddenRouteChunks = checkForbiddenRouteChunks(executableFiles)
const forbiddenServiceWorkerPrecache = checkServiceWorkerPrecache()
const sizeFindings = checkSizeBudgets(distFiles, distTotalBytes, totalBytes, workerGzipBytes)

console.log(`[nexus-worker-bundle] executable_js=${formatBytes(totalBytes)} files=${executableFiles.length}`)
console.log(`[nexus-worker-bundle] executable_gzip=${formatBytes(workerGzipBytes)}`)
console.log('[nexus-worker-bundle] top_chunks=')
for (const file of executableFiles.slice(0, 10))
  console.log(`  ${formatBytes(file.bytes).padStart(10)}  ${file.relativePath}`)

console.log(`[nexus-dist-budget] total=${formatBytes(distTotalBytes)} files=${distFiles.length}`)
console.log('[nexus-dist-budget] top_files=')
for (const file of distFiles.slice(0, 10))
  console.log(`  ${formatBytes(file.bytes).padStart(10)}  ${file.relativePath}`)

console.log(`[nexus-worker-bundle] ${routeCheck.message}`)

if (suspiciousFindings.length) {
  console.error('[nexus-worker-bundle] suspicious server imports found:')
  for (const finding of suspiciousFindings)
    console.error(`  ${finding.label}: ${finding.file}`)
}

if (demoWorkerChunks.length) {
  console.error('[nexus-worker-bundle] demo implementation chunks found in Worker:')
  for (const chunk of demoWorkerChunks)
    console.error(`  ${chunk}`)
}

if (forbiddenRouteChunks.length) {
  console.error('[nexus-worker-bundle] test/dev route chunks found in Worker:')
  for (const chunk of forbiddenRouteChunks)
    console.error(`  ${chunk}`)
}

if (forbiddenServiceWorkerPrecache.length) {
  console.error('[nexus-worker-bundle] oversized content runtime assets found in service worker precache:')
  for (const asset of forbiddenServiceWorkerPrecache)
    console.error(`  ${asset}`)
}

if (sizeFindings.length) {
  console.error('[nexus-dist-budget] size budget violations:')
  for (const finding of sizeFindings)
    console.error(`  ${finding}`)
}

if (!routeCheck.ok || suspiciousFindings.length || demoWorkerChunks.length || forbiddenRouteChunks.length || forbiddenServiceWorkerPrecache.length || sizeFindings.length)
  process.exit(1)
