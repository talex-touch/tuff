import { gzipSync } from 'node:zlib'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { docsApiPrerenderRoutes, publicPrerenderRoutes } from './nexus-static-routes.mjs'

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
  maxDocsDetailHtmlBytes: 80 * 1024,
}

const expectedStaticRoutes = [
  ...publicPrerenderRoutes,
  '/en/docs',
  '/zh/docs',
  ...docsApiPrerenderRoutes,
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
const forbiddenClientAuthRuntimePatterns = [
  /nuxt-auth-app-side/,
  /useAuthState/,
  /navigateToAuthPages/,
  /SessionRequired/,
  /@sidebase\/nuxt-auth\/dist\/runtime\/plugin/,
]
const requiredWorkerRouteChunks = [
  {
    route: '/api/docs/page',
    pattern: /^chunks\/routes\/api\/docs\/page\.get\.mjs$/,
  },
  {
    route: '/api/auth/**',
    pattern: /^chunks\/routes\/api\/auth\/_\.\.\._\.mjs$/,
  },
  {
    route: '/api/auth/me',
    pattern: /^chunks\/routes\/api\/auth\/me\.get\.mjs$/,
  },
  {
    route: '/api/app-auth/device/start',
    pattern: /^chunks\/routes\/api\/app-auth\/device\/start\.post\.mjs$/,
  },
  {
    route: '/api/app-auth/device/poll',
    pattern: /^chunks\/routes\/api\/app-auth\/device\/poll\.get\.mjs$/,
  },
  {
    route: '/api/app-auth/device/approve',
    pattern: /^chunks\/routes\/api\/app-auth\/device\/approve\.post\.mjs$/,
  },
]
const htmlBoundaryChecks = [
  {
    label: 'docs HTML pulled non-doc CSS',
    routePattern: /^(?:en|zh)\/docs\//,
    cssPattern: /(?:^|\.)(?:store|dashboard)\.|ProviderRegistry|governance|TuffLanding|PluginMetaHeader|AuthVisualShell|AuthLegalFooter/i,
  },
  {
    label: 'store HTML pulled docs/dashboard/landing CSS',
    routePattern: /^store\/index\.html$/,
    cssPattern: /docs\.|(?:^|\.)(?:dashboard)\.|ProviderRegistry|governance|TuffLanding|AuthVisualShell|AuthLegalFooter/i,
  },
  {
    label: 'landing HTML pulled docs/store/dashboard CSS',
    routePattern: /^(?:index\.html|new\/index\.html)$/,
    cssPattern: /docs\.|(?:^|\.)store\.|(?:^|\.)dashboard\.|ProviderRegistry|governance|PluginMetaHeader|AuthVisualShell|AuthLegalFooter/i,
  },
  {
    label: 'auth HTML pulled docs/store/dashboard/landing CSS',
    routePattern: /^(?:login|sign-in|forgot-password|verify-waiting|device-auth)\/index\.html$/,
    cssPattern: /docs\.|(?:^|\.)store\.|(?:^|\.)dashboard\.|ProviderRegistry|governance|TuffLanding|PluginMetaHeader/i,
  },
]
const htmlInitialAssetBudgets = [
  {
    label: 'docs initial assets',
    routePattern: /^(?:en|zh)\/docs\/.+\/index\.html$/,
    maxJsCount: 16,
    maxJsBytes: 620 * 1024,
    maxCssCount: 7,
    maxCssBytes: 400 * 1024,
  },
  {
    label: 'store initial assets',
    routePattern: /^store\/index\.html$/,
    maxJsCount: 42,
    maxJsBytes: 820 * 1024,
    maxCssCount: 18,
    maxCssBytes: 420 * 1024,
  },
  {
    label: 'landing initial assets',
    routePattern: /^(?:index\.html|new\/index\.html)$/,
    maxJsCount: 38,
    maxJsBytes: 860 * 1024,
    maxCssCount: 20,
    maxCssBytes: 420 * 1024,
  },
  {
    label: 'auth initial assets',
    routePattern: /^(?:login|sign-in|forgot-password|verify-waiting|device-auth)\/index\.html$/,
    maxJsCount: 26,
    maxJsBytes: 720 * 1024,
    maxCssCount: 11,
    maxCssBytes: 380 * 1024,
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

function routeToDistPath(route) {
  if (route === '/')
    return 'index.html'
  if (route.startsWith('/api/'))
    return route.slice(1)
  return `${route.replace(/^\//, '').replace(/\/$/, '')}/index.html`
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

function checkDuplicateSqliteWasm(distFiles) {
  const duplicateWasmFiles = distFiles
    .filter(file => /^_nuxt\/sqlite3-[A-Za-z0-9_-]+\.wasm$/.test(file.relativePath))
    .map(file => file.relativePath)

  return duplicateWasmFiles
}

function checkDuplicateRootSqlDumps(distFiles) {
  return distFiles
    .filter(file => /^dump\.[A-Za-z0-9_-]+\.sql$/.test(file.relativePath))
    .map(file => file.relativePath)
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

function checkStaticRouteFiles() {
  return expectedStaticRoutes
    .map(route => ({
      route,
      relativePath: routeToDistPath(route),
    }))
    .filter(route => !existsSync(join(distRoot, route.relativePath)))
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

function checkClientSidebaseAuthRuntime(distFiles) {
  const findings = []
  const clientRuntimeFiles = distFiles
    .filter(file => /^_nuxt\/.+\.(?:js|mjs)$/.test(file.relativePath) || file.relativePath === 'sw.js')
    .filter(file => !file.relativePath.endsWith('.map'))

  for (const file of clientRuntimeFiles) {
    const source = readFileSync(file.file, 'utf8')
    const matches = forbiddenClientAuthRuntimePatterns
      .filter(pattern => pattern.test(source))
      .map(pattern => pattern.source)

    if (matches.length) {
      findings.push({
        file: file.relativePath,
        patterns: matches,
      })
    }
  }

  return findings
}

function checkRequiredWorkerRouteChunks(files) {
  const routeChunkFiles = files
    .filter(file => file.relativePath.startsWith('chunks/routes/'))
    .map(file => file.relativePath)

  return requiredWorkerRouteChunks
    .filter(route => !routeChunkFiles.some(file => route.pattern.test(file)))
}

function isDocsRootHtml(relativePath) {
  return /^(?:en|zh)\/docs\/(?:index\/)?index\.html$/.test(relativePath)
}

function isDocsDetailHtml(relativePath) {
  return /^(?:en|zh)\/docs\/.+\/index\.html$/.test(relativePath) && !isDocsRootHtml(relativePath)
}

function checkDocsDetailHtmlPayload(distFiles) {
  const findings = []
  const docsDetailHtmlFiles = distFiles.filter(file => isDocsDetailHtml(file.relativePath))

  for (const file of docsDetailHtmlFiles) {
    const source = readFileSync(file.file, 'utf8')
    const issues = []

    if (file.bytes > distBudget.maxDocsDetailHtmlBytes)
      issues.push(`html ${formatBytes(file.bytes)} > ${formatBytes(distBudget.maxDocsDetailHtmlBytes)}`)
    if (source.includes('/api/docs/navigation'))
      issues.push('contains navigation API payload')
    if (source.includes('"body"') || source.includes('bodyHtml') || source.includes('bodyMarkdown'))
      issues.push('contains full docs body payload')

    if (issues.length) {
      findings.push({
        file: file.relativePath,
        issues,
      })
    }
  }

  return findings
}

function extractCssAssets(source) {
  return Array.from(new Set(Array.from(source.matchAll(/href="\/_nuxt\/([^"]+\.css)"/g), match => match[1])))
}

function extractJsAssets(source) {
  return Array.from(new Set(Array.from(source.matchAll(/(?:href|src)="\/_nuxt\/([^"]+\.js)"/g), match => match[1])))
}

function getAssetStats(assets) {
  const missingAssets = []
  const bytes = assets.reduce((total, asset) => {
    const assetPath = join(distRoot, '_nuxt', asset)
    if (!existsSync(assetPath)) {
      missingAssets.push(asset)
      return total
    }
    return total + statSync(assetPath).size
  }, 0)

  return {
    bytes,
    missingAssets,
  }
}

function checkHtmlCssBoundaries(distFiles) {
  const findings = []
  const htmlFiles = distFiles.filter(file => file.relativePath.endsWith('.html'))

  for (const file of htmlFiles) {
    const checks = htmlBoundaryChecks.filter(check => check.routePattern.test(file.relativePath))
    if (!checks.length)
      continue

    const source = readFileSync(file.file, 'utf8')
    const cssAssets = extractCssAssets(source)

    for (const check of checks) {
      const forbiddenAssets = cssAssets.filter(asset => check.cssPattern.test(asset))
      if (forbiddenAssets.length) {
        findings.push({
          label: check.label,
          file: file.relativePath,
          assets: forbiddenAssets,
        })
      }
    }
  }

  return findings
}

function checkHtmlInitialAssetBudgets(distFiles) {
  const findings = []
  const htmlFiles = distFiles.filter(file => file.relativePath.endsWith('.html'))

  for (const file of htmlFiles) {
    const budgets = htmlInitialAssetBudgets.filter(budget => budget.routePattern.test(file.relativePath))
    if (!budgets.length)
      continue

    const source = readFileSync(file.file, 'utf8')
    const jsAssets = extractJsAssets(source)
    const cssAssets = extractCssAssets(source)
    const jsStats = getAssetStats(jsAssets)
    const cssStats = getAssetStats(cssAssets)

    for (const budget of budgets) {
      const issues = []
      if (jsStats.missingAssets.length)
        issues.push(`missing js assets ${jsStats.missingAssets.join(', ')}`)
      if (cssStats.missingAssets.length)
        issues.push(`missing css assets ${cssStats.missingAssets.join(', ')}`)
      if (jsAssets.length > budget.maxJsCount)
        issues.push(`js assets ${jsAssets.length} > ${budget.maxJsCount}`)
      if (jsStats.bytes > budget.maxJsBytes)
        issues.push(`js ${formatBytes(jsStats.bytes)} > ${formatBytes(budget.maxJsBytes)}`)
      if (cssAssets.length > budget.maxCssCount)
        issues.push(`css assets ${cssAssets.length} > ${budget.maxCssCount}`)
      if (cssStats.bytes > budget.maxCssBytes)
        issues.push(`css ${formatBytes(cssStats.bytes)} > ${formatBytes(budget.maxCssBytes)}`)

      if (issues.length) {
        findings.push({
          label: budget.label,
          file: file.relativePath,
          issues,
        })
      }
    }
  }

  return findings
}

function countHtmlInitialAssetBudgetRoutes(distFiles) {
  return distFiles
    .filter(file => file.relativePath.endsWith('.html'))
    .filter(file => htmlInitialAssetBudgets.some(budget => budget.routePattern.test(file.relativePath)))
    .length
}

if (!existsSync(workerRoot)) {
  console.error('[nexus-worker-bundle] dist/_worker.js is missing. Run `pnpm -C "apps/nexus" run build` first.')
  process.exit(1)
}

const { executableFiles, totalBytes } = analyzeWorkerFiles()
const workerGzipBytes = getWorkerGzipBytes(executableFiles)
const { files: distFiles, totalBytes: distTotalBytes } = analyzeDistFiles()
const routeCheck = checkRoutes()
const missingStaticRouteFiles = checkStaticRouteFiles()
const suspiciousFindings = checkSuspiciousPatterns(executableFiles)
const demoWorkerChunks = checkDemoWorkerChunks(executableFiles)
const forbiddenRouteChunks = checkForbiddenRouteChunks(executableFiles)
const forbiddenServiceWorkerPrecache = checkServiceWorkerPrecache()
const clientSidebaseAuthRuntimeFindings = checkClientSidebaseAuthRuntime(distFiles)
const missingWorkerRouteChunks = checkRequiredWorkerRouteChunks(executableFiles)
const duplicateSqliteWasm = checkDuplicateSqliteWasm(distFiles)
const duplicateRootSqlDumps = checkDuplicateRootSqlDumps(distFiles)
const docsDetailHtmlPayloadFindings = checkDocsDetailHtmlPayload(distFiles)
const htmlCssBoundaryFindings = checkHtmlCssBoundaries(distFiles)
const htmlInitialAssetBudgetFindings = checkHtmlInitialAssetBudgets(distFiles)
const htmlInitialAssetBudgetRouteCount = countHtmlInitialAssetBudgetRoutes(distFiles)
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
console.log(`[nexus-dist-budget] Static route files verified: ${expectedStaticRoutes.length - missingStaticRouteFiles.length}/${expectedStaticRoutes.length}`)
console.log(`[nexus-dist-budget] Initial asset budgets verified: ${htmlInitialAssetBudgetRouteCount} routes / ${htmlInitialAssetBudgets.length} families`)

if (missingStaticRouteFiles.length) {
  console.error('[nexus-dist-budget] missing static route files:')
  for (const route of missingStaticRouteFiles)
    console.error(`  ${route.route} -> ${route.relativePath}`)
}

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

if (clientSidebaseAuthRuntimeFindings.length) {
  console.error('[nexus-dist-budget] sidebase app-side auth runtime found in client assets:')
  for (const finding of clientSidebaseAuthRuntimeFindings)
    console.error(`  ${finding.file}: ${finding.patterns.join(', ')}`)
}

if (missingWorkerRouteChunks.length) {
  console.error('[nexus-worker-bundle] required runtime route chunks are missing:')
  for (const route of missingWorkerRouteChunks)
    console.error(`  ${route.route}: ${route.pattern}`)
}

if (duplicateSqliteWasm.length) {
  console.error('[nexus-dist-budget] duplicate sqlite wasm files found:')
  for (const file of duplicateSqliteWasm)
    console.error(`  ${file}`)
}

if (duplicateRootSqlDumps.length) {
  console.error('[nexus-dist-budget] duplicate root SQL dump files found:')
  for (const file of duplicateRootSqlDumps)
    console.error(`  ${file}`)
}

if (docsDetailHtmlPayloadFindings.length) {
  console.error('[nexus-dist-budget] docs detail HTML payload violations:')
  for (const finding of docsDetailHtmlPayloadFindings)
    console.error(`  ${finding.file}: ${finding.issues.join(', ')}`)
}

if (htmlCssBoundaryFindings.length) {
  console.error('[nexus-dist-budget] page CSS boundary violations:')
  for (const finding of htmlCssBoundaryFindings)
    console.error(`  ${finding.label}: ${finding.file} -> ${finding.assets.join(', ')}`)
}

if (htmlInitialAssetBudgetFindings.length) {
  console.error('[nexus-dist-budget] page initial asset budget violations:')
  for (const finding of htmlInitialAssetBudgetFindings)
    console.error(`  ${finding.label}: ${finding.file} -> ${finding.issues.join(', ')}`)
}

if (sizeFindings.length) {
  console.error('[nexus-dist-budget] size budget violations:')
  for (const finding of sizeFindings)
    console.error(`  ${finding}`)
}

if (!routeCheck.ok || missingStaticRouteFiles.length || suspiciousFindings.length || demoWorkerChunks.length || forbiddenRouteChunks.length || forbiddenServiceWorkerPrecache.length || clientSidebaseAuthRuntimeFindings.length || missingWorkerRouteChunks.length || duplicateSqliteWasm.length || duplicateRootSqlDumps.length || docsDetailHtmlPayloadFindings.length || htmlCssBoundaryFindings.length || htmlInitialAssetBudgetFindings.length || sizeFindings.length)
  process.exit(1)
