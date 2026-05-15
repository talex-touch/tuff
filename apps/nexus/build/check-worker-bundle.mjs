import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const nexusRoot = join(currentDir, '..')
const distRoot = join(nexusRoot, 'dist')
const workerRoot = join(distRoot, '_worker.js')
const routesJsonPath = join(distRoot, '_routes.json')

const expectedStaticRoutes = [
  '/',
  '/next',
  '/docs',
  '/pricing',
  '/license',
  '/privacy',
  '/protocol',
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

function checkRoutes() {
  const routesJson = readRoutesJson()
  if (!routesJson) {
    return {
      ok: false,
      message: 'dist/_routes.json is missing. Run `pnpm -C "apps/nexus" run build` first.',
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

if (!existsSync(workerRoot)) {
  console.error('[nexus-worker-bundle] dist/_worker.js is missing. Run `pnpm -C "apps/nexus" run build` first.')
  process.exit(1)
}

const { executableFiles, totalBytes } = analyzeWorkerFiles()
const routeCheck = checkRoutes()
const suspiciousFindings = checkSuspiciousPatterns(executableFiles)

console.log(`[nexus-worker-bundle] executable_js=${formatBytes(totalBytes)} files=${executableFiles.length}`)
console.log('[nexus-worker-bundle] top_chunks=')
for (const file of executableFiles.slice(0, 10))
  console.log(`  ${formatBytes(file.bytes).padStart(10)}  ${file.relativePath}`)

console.log(`[nexus-worker-bundle] ${routeCheck.message}`)

if (suspiciousFindings.length) {
  console.error('[nexus-worker-bundle] suspicious server imports found:')
  for (const finding of suspiciousFindings)
    console.error(`  ${finding.label}: ${finding.file}`)
}

if (!routeCheck.ok || suspiciousFindings.length)
  process.exit(1)
