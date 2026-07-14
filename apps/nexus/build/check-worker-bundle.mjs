import { Buffer } from 'node:buffer'
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
const authHandlerPath = join(nexusRoot, 'server/api/auth/[...].ts')
const oneMiB = 1024 * 1024
const allowWorkerSourceMaps = isEnvFlagEnabled(process.env.NUXT_ENABLE_NITRO_SOURCEMAP)
const distBudget = {
  maxTotalBytes: 60 * oneMiB,
  maxFileBytes: 20 * oneMiB,
  maxWorkerExecutableBytes: 20 * oneMiB,
  maxWorkerGzipBytes: 2.7 * oneMiB,
  maxDocsDetailHtmlBytes: 80 * 1024,
}
const clientChunkBudget = {
  initialMaxBytes: 420_000,
  heavyBytes: 500_000,
  maxBytes: 600_000,
}
const sharedEntryCssBudget = {
  maxBytes: 278_000,
  maxGzipBytes: 50_000,
}
const forbiddenSharedEntryIconTokens = [
  ['i-cib', 'apple'],
  ['i-cib', 'linux'],
  ['i-cib', 'safari'],
  ['i-cib', 'microsoft-edge'],
  ['i-carbon', 'fingerprint-recognition'],
  ['i-simple-icons', 'snowflake'],
  ['i-carbon', 'logo-figma'],
  ['i-carbon', 'tool-kit'],
  ['i-carbon', 'machine-learning-model'],
  ['i-carbon', 'circle-dash'],
  ['i-carbon', 'color-palette'],
].map(parts => parts.join('-'))
const sharedEntryAliasedIconBudgets = [
  { token: 'i-carbon-settings', maxRuleBytes: 600 },
  { token: 'i-carbon-fire', maxRuleBytes: 750 },
  { token: 'i-ri-settings-3-line', maxRuleBytes: 600 },
  { token: 'i-ri-settings-3-fill', maxRuleBytes: 550 },
  { token: 'i-carbon-data-vis-1', maxRuleBytes: 500 },
  { token: 'i-carbon-deployment-pattern', maxRuleBytes: 650 },
  { token: 'i-carbon-queued', maxRuleBytes: 600 },
  { token: 'i-carbon-ai-status', maxRuleBytes: 750 },
]

const expectedStaticRoutes = [
  ...publicPrerenderRoutes,
  '/en/docs',
  '/zh/docs',
  ...docsApiPrerenderRoutes,
]
const expectedStaticRoutePatterns = ['/en/docs/*', '/zh/docs/*']
const workerOwnedAppRoutes = [
  '/dashboard',
  '/dashboard/team',
  '/dashboard/admin/provider-registry',
  '/dashboard/admin/governance',
  '/auth/app-callback',
  '/auth/stepup-callback',
  '/auth/admin-bootstrap',
  '/team/join',
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
  /_nuxt\/(?!builds\/)/,
  /(?:en|zh)\/docs/,
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
const forbiddenClientContentDatabaseAssetPatterns = [
  /^_nuxt\/sqlite3(?:[.-][^/]+)?\.wasm$/i,
  /^_nuxt\/sqlite3-worker1-bundler-friendly-[^/]+\.js$/i,
]
const forbiddenClientContentDatabaseRuntimePatterns = [
  /sqlite3ApiConfig/,
  /OPFS sqlite3_vfs/,
  /Database integrity check failed, rebuilding database/,
  /\.oo1\.DB\(/,
]
const forbiddenDocsInitialLifecyclePatterns = [
  /addEventListener\(["']beforeunload/,
  /h\(window,["']beforeunload/,
  /useEventListener\(window,\s*["']beforeunload/,
]
const forbiddenRemoteFontPatterns = [
  /@import(?:url)?\(?["']?https:\/\/fonts\.googleapis\.com/i,
  /url\(["']?https:\/\/fonts\.gstatic\.com/i,
  /<link[^>]+href=["'][^"']*fonts\.(?:googleapis|gstatic)\.com/i,
]
const forbiddenUnprefixedAttributifyPatterns = [
  /\[(?:background|blur|border|content|duration|font|justify|m|opacity|position|shadow|size|text|w)~=/,
]
const forbiddenLandingImagePrefetchPattern = /<link\b(?=[^>]*\brel=(["'])prefetch\1)(?=[^>]*\bas=(["'])image\2)[^>]*>/gi

function isEnvFlagEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase())
}
const forbiddenLandingDeferredImagePattern = /\/_nuxt\/(?:calendar|notion|spotify|vscode)\.[A-Za-z0-9_-]+\.jpg/g
const forbiddenLandingShowcaseVideoPattern = /\/shots\/(?:SearchApp|SearchFileImmediately|PluginTranslate)\.mp4/g
const landingInitialHtmlFiles = [
  'index.html',
  'new/index.html',
  'next/index.html',
]
const requiredContentCollections = ['app', 'docs', 'guides']
const requiredWorkerRouteChunks = [
  {
    route: '/api/docs/page',
    pattern: /^chunks\/routes\/api\/docs\/page\.get\.mjs$/,
  },
  {
    route: '/api/docs/navigation',
    pattern: /^chunks\/routes\/api\/docs\/navigation\/_locale\/_scope_\.get\.mjs$/,
  },
  {
    route: '/api/docs/navigation/:locale/:scope',
    pattern: /^chunks\/routes\/api\/docs\/navigation\/_locale\/_scope_\.get\.mjs$/,
  },
  {
    route: '/api/docs/sidebar-components',
    pattern: /^chunks\/routes\/api\/docs\/sidebar-components\/_locale_\.get\.mjs$/,
  },
  {
    route: '/api/docs/sidebar-components/:locale',
    pattern: /^chunks\/routes\/api\/docs\/sidebar-components\/_locale_\.get\.mjs$/,
  },
  {
    route: '/api/docs/search',
    pattern: /^chunks\/routes\/api\/docs\/search\/_locale_\.get\.mjs$/,
  },
  {
    route: '/api/docs/search/:locale',
    pattern: /^chunks\/routes\/api\/docs\/search\/_locale_\.get\.mjs$/,
  },
  {
    route: '/api/content/policy',
    pattern: /^chunks\/routes\/api\/content\/policy\.get\.mjs$/,
  },
  {
    route: '/api/docs/view:get',
    pattern: /^chunks\/routes\/api\/docs\/view\.get\.mjs$/,
  },
  {
    route: '/api/docs/view:post',
    pattern: /^chunks\/routes\/api\/docs\/view\.post\.mjs$/,
  },
  {
    route: '/api/docs/feedback:get',
    pattern: /^chunks\/routes\/api\/docs\/feedback\.get\.mjs$/,
  },
  {
    route: '/api/docs/feedback:post',
    pattern: /^chunks\/routes\/api\/docs\/feedback\.post\.mjs$/,
  },
  {
    route: '/api/docs/comments:get',
    pattern: /^chunks\/routes\/api\/docs\/comments\.get\.mjs$/,
  },
  {
    route: '/api/docs/comments:post',
    pattern: /^chunks\/routes\/api\/docs\/comments\.post\.mjs$/,
  },
  {
    route: '/api/docs/engagement',
    pattern: /^chunks\/routes\/api\/docs\/engagement\.post\.mjs$/,
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
  {
    route: '/api/dashboard/plugins',
    pattern: /^chunks\/routes\/api\/dashboard\/plugins\.get\.mjs$/,
  },
  {
    route: '/api/dashboard/team',
    pattern: /^chunks\/routes\/api\/dashboard\/team\.get\.mjs$/,
  },
  {
    route: '/api/dashboard/provider-registry/providers',
    pattern: /^chunks\/routes\/api\/dashboard\/provider-registry\/providers\.get\.mjs$/,
  },
  {
    route: '/api/dashboard/governance/summary',
    pattern: /^chunks\/routes\/api\/dashboard\/governance\/summary\.get\.mjs$/,
  },
  {
    route: '/api/dashboard/storage/status',
    pattern: /^chunks\/routes\/api\/dashboard\/storage\/status\.get\.mjs$/,
  },
  {
    route: '/api/dashboard/telemetry/me',
    pattern: /^chunks\/routes\/api\/dashboard\/telemetry\/me\.get\.mjs$/,
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
    routePattern: /^(?:index\.html|new\/index\.html|next\/index\.html)$/,
    cssPattern: /docs\.|(?:^|\.)store\.|(?:^|\.)dashboard\.|ProviderRegistry|governance|PluginMetaHeader|AuthVisualShell|AuthLegalFooter/i,
  },
  {
    label: 'public info HTML pulled app-surface CSS',
    routePattern: /^(?:pricing|license|privacy|protocol|updates)\/index\.html$/,
    cssPattern: /(?:^|\.)store\.|(?:^|\.)dashboard\.|ProviderRegistry|governance|PluginMetaHeader|AuthVisualShell|AuthLegalFooter|TuffLanding|TuffHome|CoreBoxMock|TuffShowcase/i,
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
    maxJsGzipBytes: 205 * 1024,
    maxCssCount: 7,
    maxCssBytes: 400 * 1024,
    maxCssGzipBytes: 78 * 1024,
  },
  {
    label: 'store initial assets',
    routePattern: /^store\/index\.html$/,
    maxJsCount: 42,
    maxJsBytes: 820 * 1024,
    maxJsGzipBytes: 260 * 1024,
    maxCssCount: 18,
    maxCssBytes: 420 * 1024,
    maxCssGzipBytes: 82 * 1024,
  },
  {
    label: 'landing initial assets',
    routePattern: /^(?:index\.html|new\/index\.html|next\/index\.html)$/,
    maxJsCount: 38,
    maxJsBytes: 860 * 1024,
    maxJsGzipBytes: 285 * 1024,
    maxCssCount: 20,
    maxCssBytes: 420 * 1024,
    maxCssGzipBytes: 86 * 1024,
  },
  {
    label: 'public info initial assets',
    routePattern: /^(?:pricing|license|privacy|protocol|updates)\/index\.html$/,
    maxJsCount: 20,
    maxJsBytes: 560 * 1024,
    maxJsGzipBytes: 195 * 1024,
    maxCssCount: 9,
    maxCssBytes: 340 * 1024,
    maxCssGzipBytes: 72 * 1024,
  },
  {
    label: 'auth initial assets',
    routePattern: /^(?:login|sign-in|forgot-password|verify-waiting|device-auth)\/index\.html$/,
    maxJsCount: 26,
    maxJsBytes: 720 * 1024,
    maxJsGzipBytes: 235 * 1024,
    maxCssCount: 11,
    maxCssBytes: 380 * 1024,
    maxCssGzipBytes: 76 * 1024,
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

function checkClientContentDatabaseRuntime(distFiles) {
  const findings = []

  for (const file of distFiles) {
    const assetPatterns = forbiddenClientContentDatabaseAssetPatterns
      .filter(pattern => pattern.test(file.relativePath))
      .map(pattern => pattern.source)

    if (assetPatterns.length) {
      findings.push({
        file: file.relativePath,
        patterns: assetPatterns,
      })
      continue
    }

    if (!/^_nuxt\/[^/]+\.js$/.test(file.relativePath))
      continue

    const source = readFileSync(file.file, 'utf8')
    const runtimePatterns = forbiddenClientContentDatabaseRuntimePatterns
      .filter(pattern => pattern.test(source))
      .map(pattern => pattern.source)

    if (runtimePatterns.length) {
      findings.push({
        file: file.relativePath,
        patterns: runtimePatterns,
      })
    }
  }

  return findings
}

function checkWorkerSourceMaps(distFiles) {
  const sourceMaps = distFiles
    .filter(file => /^_worker\.js\/.*\.map$/.test(file.relativePath))
    .map(file => file.relativePath)

  return {
    retained: sourceMaps,
    findings: allowWorkerSourceMaps ? [] : sourceMaps,
  }
}

function checkRequiredRootSqlDumps(distFiles) {
  const distFileByPath = new Map(distFiles.map(file => [file.relativePath, file]))
  const findings = []
  const clientContentDumps = distFiles.filter(file => /^__nuxt_content\/[A-Za-z0-9_-]+\/sql_dump\.txt$/.test(file.relativePath))

  for (const contentDump of clientContentDumps)
    findings.push(`prerendered client SQL dump must be trimmed: ${contentDump.relativePath}`)

  for (const collectionName of requiredContentCollections) {
    const rootPath = `dump.${collectionName}.sql`
    const rootDump = distFileByPath.get(rootPath)
    if (!rootDump || rootDump.bytes === 0)
      findings.push(`${rootPath} is missing or empty`)
  }

  const routesPath = join(distRoot, '_routes.json')
  if (!existsSync(routesPath)) {
    findings.push('_routes.json is missing')
  }
  else {
    const routes = JSON.parse(readFileSync(routesPath, 'utf8'))
    const excludedRoutes = new Set(Array.isArray(routes.exclude) ? routes.exclude : [])
    for (const collectionName of requiredContentCollections) {
      const runtimePath = `/__nuxt_content/${collectionName}/sql_dump.txt`
      if (!excludedRoutes.has(runtimePath))
        findings.push(`${runtimePath} is not excluded from the Worker in _routes.json`)
    }
  }

  return { checked: requiredContentCollections.length, findings }
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
  const missingPatterns = expectedStaticRoutePatterns.filter(route => !excluded.has(route))

  return {
    ok: missing.length === 0 && missingPatterns.length === 0,
    message: missing.length || missingPatterns.length
      ? `Missing static route exclusions: ${[...missing, ...missingPatterns].join(', ')}`
      : `Static route exclusions verified: ${expectedStaticRoutes.length} routes + ${expectedStaticRoutePatterns.length} patterns`,
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

function checkWorkerOwnedAppRoutes() {
  const routesJson = readRoutesJson()
  const excluded = new Set(routesJson && Array.isArray(routesJson.exclude) ? routesJson.exclude : [])

  return workerOwnedAppRoutes
    .map(route => ({
      route,
      relativePath: routeToDistPath(route),
      isExcludedStaticRoute: excluded.has(route),
      hasStaticHtml: existsSync(join(distRoot, routeToDistPath(route))),
    }))
    .filter(route => route.isExcludedStaticRoute || route.hasStaticHtml)
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

function checkRemoteFontReferences(distFiles) {
  const findings = []
  const styleFiles = distFiles.filter(file => /\.(?:css|html)$/.test(file.relativePath))

  for (const file of styleFiles) {
    const source = readFileSync(file.file, 'utf8')
    const patterns = forbiddenRemoteFontPatterns
      .filter(pattern => pattern.test(source))
      .map(pattern => pattern.source)

    if (patterns.length) {
      findings.push({
        file: file.relativePath,
        patterns,
      })
    }
  }

  return findings
}

function checkUnprefixedAttributifyLeaks(distFiles) {
  const findings = []
  const cssFiles = distFiles.filter(file => /^_nuxt\/[^/]+\.css$/.test(file.relativePath))

  for (const file of cssFiles) {
    const source = readFileSync(file.file, 'utf8')
    const patterns = forbiddenUnprefixedAttributifyPatterns
      .filter(pattern => pattern.test(source))
      .map(pattern => pattern.source)

    if (patterns.length) {
      findings.push({
        file: file.relativePath,
        patterns,
      })
    }
  }

  return findings
}

function checkAuthHandlerSingleton() {
  const findings = []

  if (!existsSync(authHandlerPath))
    return ['server/api/auth/[...].ts is missing']

  const source = readFileSync(authHandlerPath, 'utf8')
  const requiredSnippets = [
    'const createRequestAuthEvent = () => createAuthEvent()',
    'let cachedAuthHandler',
    'function getCachedAuthHandler()',
    'cachedAuthHandler ??= NuxtAuthHandler(getAuthOptions())',
    'const authHandler = getCachedAuthHandler()',
  ]
  const forbiddenSnippets = [
    'NuxtAuthHandler(getAuthOptions(event))',
    'function getAuthOptions(event',
  ]

  for (const snippet of requiredSnippets) {
    if (!source.includes(snippet))
      findings.push(`missing auth singleton source marker: ${snippet}`)
  }

  for (const snippet of forbiddenSnippets) {
    if (source.includes(snippet))
      findings.push(`forbidden per-request auth handler marker found: ${snippet}`)
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

function checkDocsInitialLifecycleBlockers(distFiles) {
  const findings = []
  const sourceCache = new Map()
  const docsDetailHtmlFiles = distFiles.filter(file => isDocsDetailHtml(file.relativePath))

  for (const file of docsDetailHtmlFiles) {
    const htmlSource = readFileSync(file.file, 'utf8')
    const jsAssets = extractJsAssets(htmlSource)

    for (const asset of jsAssets) {
      const assetPath = join(distRoot, '_nuxt', asset)
      if (!existsSync(assetPath))
        continue

      let source = sourceCache.get(asset)
      if (!source) {
        source = readFileSync(assetPath, 'utf8')
        sourceCache.set(asset, source)
      }

      const matches = forbiddenDocsInitialLifecyclePatterns
        .filter(pattern => pattern.test(source))
        .map(pattern => pattern.source)

      if (matches.length) {
        findings.push({
          file: file.relativePath,
          asset,
          patterns: matches,
        })
      }
    }
  }

  return {
    checkedRoutes: docsDetailHtmlFiles.length,
    findings,
  }
}

function extractCssAssets(source) {
  return Array.from(new Set(Array.from(source.matchAll(/href="\/_nuxt\/([^"]+\.css)"/g), match => match[1])))
}

function extractJsAssets(source) {
  return Array.from(new Set(Array.from(source.matchAll(/(?:href|src)="\/_nuxt\/([^"]+\.js)"/g), match => match[1])))
}

const assetStatsCache = new Map()

function getAssetStat(asset) {
  const cached = assetStatsCache.get(asset)
  if (cached)
    return cached

  const source = readFileSync(join(distRoot, '_nuxt', asset))
  const stats = {
    bytes: source.byteLength,
    gzipBytes: gzipSync(source).byteLength,
  }
  assetStatsCache.set(asset, stats)
  return stats
}

function getAssetStats(assets) {
  const missingAssets = []
  let bytes = 0
  let gzipBytes = 0

  for (const asset of assets) {
    const assetPath = join(distRoot, '_nuxt', asset)
    if (!existsSync(assetPath)) {
      missingAssets.push(asset)
      continue
    }

    const stats = getAssetStat(asset)
    bytes += stats.bytes
    gzipBytes += stats.gzipBytes
  }

  return {
    bytes,
    gzipBytes,
    missingAssets,
  }
}

function checkSharedEntryCssBudget(distFiles) {
  const entryFiles = distFiles.filter(file => /^_nuxt\/entry\.[^/]+\.css$/.test(file.relativePath))
  const findings = []

  if (entryFiles.length !== 1) {
    findings.push(`expected 1 shared entry CSS asset, found ${entryFiles.length}`)
    return { entry: null, findings }
  }

  const entry = entryFiles[0]
  const stats = getAssetStat(entry.relativePath.replace(/^_nuxt\//, ''))
  const source = readFileSync(join(distRoot, entry.relativePath), 'utf8')
  const rules = source.match(/[^{}]+\{[^{}]*\}/g) ?? []

  if (stats.bytes > sharedEntryCssBudget.maxBytes)
    findings.push(`shared entry CSS ${formatBytes(stats.bytes)} > ${formatBytes(sharedEntryCssBudget.maxBytes)}`)
  if (stats.gzipBytes > sharedEntryCssBudget.maxGzipBytes)
    findings.push(`shared entry CSS gzip ${formatBytes(stats.gzipBytes)} > ${formatBytes(sharedEntryCssBudget.maxGzipBytes)}`)
  for (const token of forbiddenSharedEntryIconTokens) {
    if (source.includes(token))
      findings.push(`oversized icon selector returned to shared entry CSS: ${token}`)
  }
  for (const { token, maxRuleBytes } of sharedEntryAliasedIconBudgets) {
    const rule = rules.find((candidate) => {
      const selector = candidate.slice(0, candidate.indexOf('{'))
      return candidate.includes('--un-icon:')
        && selector.split(',').some(part => part.trim() === `.${token}`)
    })
    if (!rule) {
      findings.push(`aliased icon selector missing from shared entry CSS: ${token}`)
      continue
    }
    const ruleBytes = Buffer.byteLength(rule)
    if (ruleBytes > maxRuleBytes)
      findings.push(`aliased icon selector ${token} is ${formatBytes(ruleBytes)} > ${formatBytes(maxRuleBytes)}`)
  }

  return {
    entry: {
      asset: entry.relativePath,
      ...stats,
    },
    findings,
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
      if (jsStats.gzipBytes > budget.maxJsGzipBytes)
        issues.push(`js gzip ${formatBytes(jsStats.gzipBytes)} > ${formatBytes(budget.maxJsGzipBytes)}`)
      if (cssAssets.length > budget.maxCssCount)
        issues.push(`css assets ${cssAssets.length} > ${budget.maxCssCount}`)
      if (cssStats.bytes > budget.maxCssBytes)
        issues.push(`css ${formatBytes(cssStats.bytes)} > ${formatBytes(budget.maxCssBytes)}`)
      if (cssStats.gzipBytes > budget.maxCssGzipBytes)
        issues.push(`css gzip ${formatBytes(cssStats.gzipBytes)} > ${formatBytes(budget.maxCssGzipBytes)}`)

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

function checkLandingImagePrefetches() {
  const findings = []

  for (const relativePath of landingInitialHtmlFiles) {
    const file = join(distRoot, relativePath)
    if (!existsSync(file))
      continue

    const source = readFileSync(file, 'utf8')
    const matches = source.match(forbiddenLandingImagePrefetchPattern) ?? []
    if (matches.length)
      findings.push({ file: relativePath, count: matches.length })
  }

  return findings
}

function checkLandingDeferredImageReferences() {
  const findings = []

  for (const relativePath of landingInitialHtmlFiles) {
    const file = join(distRoot, relativePath)
    if (!existsSync(file))
      continue

    const source = readFileSync(file, 'utf8')
    const matches = source.match(forbiddenLandingDeferredImagePattern) ?? []
    if (matches.length)
      findings.push({ file: relativePath, count: matches.length })
  }

  return findings
}

function checkLandingShowcaseVideoReferences() {
  const findings = []

  for (const relativePath of landingInitialHtmlFiles) {
    const file = join(distRoot, relativePath)
    if (!existsSync(file))
      continue

    const source = readFileSync(file, 'utf8')
    const matches = source.match(forbiddenLandingShowcaseVideoPattern) ?? []
    if (matches.length)
      findings.push({ file: relativePath, count: matches.length })
  }

  return findings
}

function checkClientChunkBudgets(distFiles) {
  const clientChunks = distFiles.filter(file => /^_nuxt\/[^/]+\.js$/.test(file.relativePath))
  const heavyChunks = clientChunks.filter(file => file.bytes > clientChunkBudget.heavyBytes)
  const directlyReferencedAssets = new Set()

  for (const file of distFiles.filter(file => file.relativePath.endsWith('.html'))) {
    const source = readFileSync(file.file, 'utf8')
    for (const asset of extractJsAssets(source))
      directlyReferencedAssets.add(asset)
  }

  const findings = []
  for (const chunk of clientChunks) {
    if (chunk.bytes > clientChunkBudget.maxBytes)
      findings.push(`${chunk.relativePath} is ${formatBytes(chunk.bytes)} > ${formatBytes(clientChunkBudget.maxBytes)}`)
  }

  const directlyReferencedHeavyChunks = heavyChunks.filter((chunk) => {
    const asset = chunk.relativePath.replace(/^_nuxt\//, '')
    return directlyReferencedAssets.has(asset)
  })
  for (const chunk of directlyReferencedHeavyChunks)
    findings.push(`${chunk.relativePath} is a heavy chunk referenced by prerendered HTML`)

  const oversizedInitialChunks = clientChunks.filter((chunk) => {
    const asset = chunk.relativePath.replace(/^_nuxt\//, '')
    return directlyReferencedAssets.has(asset) && chunk.bytes > clientChunkBudget.initialMaxBytes
  })
  for (const chunk of oversizedInitialChunks)
    findings.push(`${chunk.relativePath} is an initial chunk ${formatBytes(chunk.bytes)} > ${formatBytes(clientChunkBudget.initialMaxBytes)}`)

  return {
    heavyChunks,
    directlyReferencedHeavyChunks,
    oversizedInitialChunks,
    findings,
  }
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
const workerOwnedAppRouteFindings = checkWorkerOwnedAppRoutes()
const suspiciousFindings = checkSuspiciousPatterns(executableFiles)
const demoWorkerChunks = checkDemoWorkerChunks(executableFiles)
const forbiddenRouteChunks = checkForbiddenRouteChunks(executableFiles)
const forbiddenServiceWorkerPrecache = checkServiceWorkerPrecache()
const clientSidebaseAuthRuntimeFindings = checkClientSidebaseAuthRuntime(distFiles)
const remoteFontReferenceFindings = checkRemoteFontReferences(distFiles)
const unprefixedAttributifyFindings = checkUnprefixedAttributifyLeaks(distFiles)
const authHandlerSingletonFindings = checkAuthHandlerSingleton()
const missingWorkerRouteChunks = checkRequiredWorkerRouteChunks(executableFiles)
const workerSourceMapCheck = checkWorkerSourceMaps(distFiles)
const clientContentDatabaseRuntimeFindings = checkClientContentDatabaseRuntime(distFiles)
const rootSqlDumpCheck = checkRequiredRootSqlDumps(distFiles)
const docsDetailHtmlPayloadFindings = checkDocsDetailHtmlPayload(distFiles)
const docsInitialLifecycleCheck = checkDocsInitialLifecycleBlockers(distFiles)
const htmlCssBoundaryFindings = checkHtmlCssBoundaries(distFiles)
const htmlInitialAssetBudgetFindings = checkHtmlInitialAssetBudgets(distFiles)
const sharedEntryCssCheck = checkSharedEntryCssBudget(distFiles)
const landingImagePrefetchFindings = checkLandingImagePrefetches()
const landingDeferredImageFindings = checkLandingDeferredImageReferences()
const landingShowcaseVideoFindings = checkLandingShowcaseVideoReferences()
const clientChunkCheck = checkClientChunkBudgets(distFiles)
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
console.log(`[nexus-dist-budget] Worker-owned app routes verified: ${workerOwnedAppRoutes.length - workerOwnedAppRouteFindings.length}/${workerOwnedAppRoutes.length}`)
console.log('[nexus-dist-budget] Auth handler singleton verified')
console.log(`[nexus-dist-budget] Worker source maps verified: ${workerSourceMapCheck.retained.length} retained (explicit=${allowWorkerSourceMaps})`)
console.log('[nexus-dist-budget] Client Content SQLite runtime verified: 0 assets / runtime markers')
console.log(`[nexus-dist-budget] Cloudflare root SQL dumps verified: ${rootSqlDumpCheck.checked - rootSqlDumpCheck.findings.length}/${rootSqlDumpCheck.checked}`)
console.log(`[nexus-dist-budget] Docs initial lifecycle blockers verified: ${docsInitialLifecycleCheck.checkedRoutes} routes`)
console.log(`[nexus-dist-budget] Initial asset budgets verified: ${htmlInitialAssetBudgetRouteCount} routes / ${htmlInitialAssetBudgets.length} families`)
if (sharedEntryCssCheck.entry) {
  console.log(`[nexus-dist-budget] Shared entry CSS verified: ${formatBytes(sharedEntryCssCheck.entry.bytes)} / ${formatBytes(sharedEntryCssCheck.entry.gzipBytes)} gzip`)
}
console.log(`[nexus-dist-budget] Landing image prefetch hints verified: ${landingInitialHtmlFiles.length - landingImagePrefetchFindings.length}/${landingInitialHtmlFiles.length}`)
console.log(`[nexus-dist-budget] Landing deferred image references verified: ${landingInitialHtmlFiles.length - landingDeferredImageFindings.length}/${landingInitialHtmlFiles.length}`)
console.log(`[nexus-dist-budget] Landing showcase video references verified: ${landingInitialHtmlFiles.length - landingShowcaseVideoFindings.length}/${landingInitialHtmlFiles.length}`)
console.log(`[nexus-dist-budget] Client chunk budgets verified: ${clientChunkCheck.heavyChunks.length} heavy chunks / ${clientChunkCheck.directlyReferencedHeavyChunks.length} direct heavy HTML references / ${clientChunkCheck.oversizedInitialChunks.length} oversized initial chunks`)

if (missingStaticRouteFiles.length) {
  console.error('[nexus-dist-budget] missing static route files:')
  for (const route of missingStaticRouteFiles)
    console.error(`  ${route.route} -> ${route.relativePath}`)
}

if (workerOwnedAppRouteFindings.length) {
  console.error('[nexus-dist-budget] worker-owned app routes were emitted as static routes:')
  for (const route of workerOwnedAppRouteFindings)
    console.error(`  ${route.route} -> ${route.relativePath} (excluded=${route.isExcludedStaticRoute}, html=${route.hasStaticHtml})`)
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

if (remoteFontReferenceFindings.length) {
  console.error('[nexus-dist-budget] remote font references found in production HTML/CSS:')
  for (const finding of remoteFontReferenceFindings)
    console.error(`  ${finding.file}: ${finding.patterns.join(', ')}`)
}

if (unprefixedAttributifyFindings.length) {
  console.error('[nexus-dist-budget] unprefixed Attributify selectors leaked into production CSS:')
  for (const finding of unprefixedAttributifyFindings)
    console.error(`  ${finding.file}: ${finding.patterns.join(', ')}`)
}

if (authHandlerSingletonFindings.length) {
  console.error('[nexus-dist-budget] auth handler singleton guard failed:')
  for (const finding of authHandlerSingletonFindings)
    console.error(`  ${finding}`)
}

if (missingWorkerRouteChunks.length) {
  console.error('[nexus-worker-bundle] required runtime route chunks are missing:')
  for (const route of missingWorkerRouteChunks)
    console.error(`  ${route.route}: ${route.pattern}`)
}

if (workerSourceMapCheck.findings.length) {
  console.error('[nexus-dist-budget] Worker source maps found without explicit retention:')
  for (const file of workerSourceMapCheck.findings)
    console.error(`  ${file}`)
}

if (clientContentDatabaseRuntimeFindings.length) {
  console.error('[nexus-dist-budget] client Content SQLite runtime found in production assets:')
  for (const finding of clientContentDatabaseRuntimeFindings)
    console.error(`  ${finding.file}: ${finding.patterns.join(', ')}`)
}

if (rootSqlDumpCheck.findings.length) {
  console.error('[nexus-dist-budget] Cloudflare root SQL dump runtime assets are invalid:')
  for (const finding of rootSqlDumpCheck.findings)
    console.error(`  ${finding}`)
}

if (docsDetailHtmlPayloadFindings.length) {
  console.error('[nexus-dist-budget] docs detail HTML payload violations:')
  for (const finding of docsDetailHtmlPayloadFindings)
    console.error(`  ${finding.file}: ${finding.issues.join(', ')}`)
}

if (docsInitialLifecycleCheck.findings.length) {
  console.error('[nexus-dist-budget] docs initial JS lifecycle blockers found:')
  for (const finding of docsInitialLifecycleCheck.findings)
    console.error(`  ${finding.file}: ${finding.asset} -> ${finding.patterns.join(', ')}`)
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

if (sharedEntryCssCheck.findings.length) {
  console.error('[nexus-dist-budget] shared entry CSS budget violations:')
  for (const finding of sharedEntryCssCheck.findings)
    console.error(`  ${finding}`)
}

if (landingImagePrefetchFindings.length) {
  console.error('[nexus-dist-budget] landing HTML contains below-fold image prefetch hints:')
  for (const finding of landingImagePrefetchFindings)
    console.error(`  ${finding.file}: ${finding.count}`)
}

if (landingDeferredImageFindings.length) {
  console.error('[nexus-dist-budget] landing HTML contains deferred plugin image references:')
  for (const finding of landingDeferredImageFindings)
    console.error(`  ${finding.file}: ${finding.count}`)
}

if (landingShowcaseVideoFindings.length) {
  console.error('[nexus-dist-budget] landing HTML contains deferred showcase video references:')
  for (const finding of landingShowcaseVideoFindings)
    console.error(`  ${finding.file}: ${finding.count}`)
}

if (clientChunkCheck.findings.length) {
  console.error('[nexus-dist-budget] client chunk budget violations:')
  for (const finding of clientChunkCheck.findings)
    console.error(`  ${finding}`)
}

if (sizeFindings.length) {
  console.error('[nexus-dist-budget] size budget violations:')
  for (const finding of sizeFindings)
    console.error(`  ${finding}`)
}

if (!routeCheck.ok || missingStaticRouteFiles.length || workerOwnedAppRouteFindings.length || suspiciousFindings.length || demoWorkerChunks.length || forbiddenRouteChunks.length || forbiddenServiceWorkerPrecache.length || clientSidebaseAuthRuntimeFindings.length || remoteFontReferenceFindings.length || unprefixedAttributifyFindings.length || authHandlerSingletonFindings.length || missingWorkerRouteChunks.length || workerSourceMapCheck.findings.length || clientContentDatabaseRuntimeFindings.length || rootSqlDumpCheck.findings.length || docsDetailHtmlPayloadFindings.length || docsInitialLifecycleCheck.findings.length || htmlCssBoundaryFindings.length || htmlInitialAssetBudgetFindings.length || sharedEntryCssCheck.findings.length || landingImagePrefetchFindings.length || landingDeferredImageFindings.length || landingShowcaseVideoFindings.length || clientChunkCheck.findings.length || sizeFindings.length)
  process.exit(1)
