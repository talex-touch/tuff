import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const nexusRoot = join(currentDir, '..')
const workspaceRoot = join(nexusRoot, '..', '..')
const evidenceRoot = join(workspaceRoot, 'output/playwright')
const requireDeployedPreview = process.argv.includes('--require-deployed-preview')
const printDeployedPreviewTemplate = process.argv.includes('--print-deployed-preview-template')

if (printDeployedPreviewTemplate) {
  console.log(JSON.stringify(createDeployedPreviewEvidenceTemplate(), null, 2))
  process.exit(0)
}

const wranglerEvidence = readLatestEvidence(/^nexus-wrangler-prod-runtime-smoke-\d{4}-\d{2}-\d{2}\.json$/)
const pwaEvidence = readLatestEvidence(/^nexus-local-prod-pwa-precache-trim-\d{4}-\d{2}-\d{2}\.json$/)
const deployedPreviewEvidence = requireDeployedPreview
  ? readLatestEvidence(/^nexus-cloudflare-pages-preview-runtime-smoke-\d{4}-\d{2}-\d{2}\.json$/)
  : null
const findings = [
  ...checkEvidenceSidecars(wranglerEvidence, pwaEvidence, deployedPreviewEvidence),
  ...checkEvidenceMarkdownSummaries(wranglerEvidence, pwaEvidence, deployedPreviewEvidence),
  ...checkWranglerEvidence(wranglerEvidence.data),
  ...checkPwaTrimEvidence(pwaEvidence.data),
  ...(deployedPreviewEvidence ? checkDeployedPreviewEvidence(deployedPreviewEvidence.data) : []),
]

if (findings.length) {
  console.error('[nexus-runtime-evidence] local runtime evidence guard failed:')
  for (const finding of findings)
    console.error(`  ${finding}`)
  process.exit(1)
}

console.log(`[nexus-runtime-evidence] wrangler evidence verified: ${wranglerEvidence.fileName}`)
console.log(`[nexus-runtime-evidence] PWA precache evidence verified: ${pwaEvidence.fileName}`)
if (deployedPreviewEvidence)
  console.log(`[nexus-runtime-evidence] deployed Cloudflare Pages preview evidence verified: ${deployedPreviewEvidence.fileName}`)
else
  console.log('[nexus-runtime-evidence] deployed Cloudflare Pages preview evidence not enforced; pass --require-deployed-preview for final production gate')
console.log(`[nexus-runtime-evidence] wrangler status=${wranglerEvidence.data.status}; warnings=${wranglerEvidence.data.warnings?.length ?? 0}`)
console.log(`[nexus-runtime-evidence] PWA swPrecache=${pwaEvidence.data.swPrecache?.total}; public docs fan-out verified`)

function readLatestEvidence(pattern) {
  if (!existsSync(evidenceRoot)) {
    console.error(`[nexus-runtime-evidence] evidence directory is missing: ${evidenceRoot}`)
    process.exit(1)
  }

  const fileName = readdirSync(evidenceRoot)
    .filter(file => pattern.test(file))
    .sort()
    .at(-1)

  if (!fileName) {
    console.error(`[nexus-runtime-evidence] missing evidence file matching ${pattern.source}`)
    process.exit(1)
  }

  const filePath = join(evidenceRoot, fileName)
  return {
    fileName,
    filePath,
    data: JSON.parse(readFileSync(filePath, 'utf8')),
  }
}

function checkEvidenceSidecars(wranglerEvidence, pwaEvidence, deployedPreviewEvidence) {
  const wranglerPrefix = wranglerEvidence.fileName.replace(/\.json$/, '')
  const pwaPrefix = pwaEvidence.fileName.replace(/\.json$/, '')
  const deployedPrefix = deployedPreviewEvidence?.fileName.replace(/\.json$/, '')
  const wranglerHarSuffixes = [
    'auth-app-callback',
    'dashboard',
    'docs-store-back',
    'docs-tabs',
    'home',
    'next',
    'pricing',
    'sign-in',
    'store',
  ]
  const requiredFiles = [
    `output/playwright/${wranglerPrefix}.md`,
    `output/playwright/${pwaPrefix}.md`,
    ...wranglerHarSuffixes.map(suffix => `output/playwright/${wranglerPrefix}-${suffix}.har`),
    ...(pwaEvidence.data.routes ?? []).map(route => route.har).filter(Boolean),
    ...(deployedPrefix ? [`output/playwright/${deployedPrefix}.md`] : []),
    ...(deployedPreviewEvidence ? getDeclaredEvidenceHarFiles(deployedPreviewEvidence.data) : []),
  ]

  return requiredFiles.flatMap((file) => {
    const filePath = join(workspaceRoot, file)
    return existsSync(filePath) ? [] : [`missing runtime evidence sidecar: ${file}`]
  })
}

function getDeclaredEvidenceHarFiles(evidence) {
  return [
    ...(evidence.routes ?? []).map(route => route.har),
    evidence.authProviderCallback?.har,
    evidence.authenticatedDashboard?.har,
    evidence.bfcache?.har,
  ].filter(Boolean)
}

function checkEvidenceMarkdownSummaries(wranglerEvidence, pwaEvidence, deployedPreviewEvidence) {
  const wranglerPrefix = wranglerEvidence.fileName.replace(/\.json$/, '')
  const pwaPrefix = pwaEvidence.fileName.replace(/\.json$/, '')
  const wranglerMarkdown = readFileSync(join(evidenceRoot, `${wranglerPrefix}.md`), 'utf8')
  const pwaMarkdown = readFileSync(join(evidenceRoot, `${pwaPrefix}.md`), 'utf8')

  return [
    ...checkWranglerMarkdownSummary(wranglerMarkdown, wranglerEvidence.data),
    ...checkPwaMarkdownSummary(pwaMarkdown, pwaEvidence.data),
    ...(deployedPreviewEvidence
      ? checkDeployedPreviewMarkdownSummary(
        readFileSync(join(evidenceRoot, `${deployedPreviewEvidence.fileName.replace(/\.json$/, '')}.md`), 'utf8'),
        deployedPreviewEvidence.data,
      )
      : []),
  ]
}

function checkWranglerMarkdownSummary(markdown, evidence) {
  const precache = evidence.build?.serviceWorkerPrecache ?? {}
  const publicRoutes = evidence.networkSummary?.publicRoutes ?? {}
  const bfcache = evidence.bfcache ?? {}
  const snippets = [
    `- Status: ${evidence.status}`,
    `- Auth handler singleton source guard: ${evidence.sourceGuards?.authHandlerSingleton}`,
    `- Total: ${precache.total}`,
    `- Docs entries: ${precache.docs?.length ?? 0}`,
    `- Route HTML entries: ${precache.routeHtml?.length ?? 0}`,
    `- _nuxt chunk/asset entries: ${precache.nuxtChunkAssets?.length ?? 0}`,
    `- Nuxt build metadata entries: ${precache.nuxtBuildMetadata?.length ?? 0}`,
    `- Public docs requests: ${publicRoutes.docsRequests}`,
    `- Public _nuxt chunk/asset requests, cumulative: ${publicRoutes.nuxtChunkAssetRequests}`,
    `- Max single public route _nuxt chunk/asset requests: ${publicRoutes.maxSingleRouteNuxtChunkAssetRequests}`,
    `- Navigation type after back: ${bfcache.navigationType}`,
    `- Real bfcache hit observed: ${bfcache.realBfcacheHit}`,
    ...(evidence.warnings ?? []).map(warning => `- ${warning}`),
  ]

  return checkMarkdownContains('wrangler', markdown, snippets)
}

function checkPwaMarkdownSummary(markdown, evidence) {
  const precache = evidence.swPrecache ?? {}
  const before = evidence.before ?? {}
  const snippets = [
    `- Result: ${evidence.ok ? 'PASS' : 'FAIL'}`,
    `- Service worker precache entries: ${precache.total}`,
    `- Service worker docs route entries: ${precache.docsRoutes}`,
    `- Service worker route HTML-like entries: ${precache.htmlLikeRoutes}`,
    `- Service worker \`_nuxt\` chunk/asset entries: ${precache.nuxtChunkAssets} (${precache.nuxtBuildMetadata} build metadata entries allowed)`,
    `| SW precache entries | ${before.swPrecacheTotal} | ${precache.total} |`,
    `| SW docs route entries | ${before.swPrecacheDocsRoutes} | ${precache.docsRoutes} |`,
    `| Typical docs requests per public route | ${before.typicalDocsRequestsPerPublicRoute} | 0 |`,
  ]

  return checkMarkdownContains('PWA', markdown, snippets)
}

function checkDeployedPreviewMarkdownSummary(markdown, evidence) {
  const bfcache = evidence.bfcache ?? {}
  const snippets = [
    `- Status: ${evidence.status}`,
    `- Base URL: ${getEvidenceBaseUrl(evidence)}`,
    `- Real provider callback authenticated: ${Boolean(evidence.authProviderCallback?.authenticated ?? evidence.authProviderCallback?.sessionAuthenticated ?? evidence.authProviderCallback?.session?.authenticated)}`,
    `- Authenticated dashboard smoke: ${Boolean(evidence.authenticatedDashboard?.authenticated ?? evidence.authenticatedDashboard?.sessionAuthenticated ?? evidence.authenticatedDashboard?.session?.authenticated)}`,
    `- Real bfcache hit observed: ${bfcache.realBfcacheHit}`,
  ]

  return checkMarkdownContains('deployed Cloudflare preview', markdown, snippets)
}

function checkMarkdownContains(label, markdown, snippets) {
  return snippets
    .filter(snippet => !markdown.includes(snippet))
    .map(snippet => `${label} markdown summary is stale or missing: ${snippet}`)
}

function checkDeployedPreviewEvidence(evidence) {
  const findings = []
  const baseUrl = getEvidenceBaseUrl(evidence)

  if (evidence.status !== 'PASS')
    findings.push(`deployed Cloudflare preview status is ${evidence.status}, expected PASS`)
  if (evidence.failures?.length)
    findings.push(`deployed Cloudflare preview failures are present: ${evidence.failures.join(', ')}`)
  if (!baseUrl)
    findings.push('deployed Cloudflare preview baseUrl is missing')
  if (baseUrl && !isHttpsEvidenceBaseUrl(baseUrl))
    findings.push(`deployed Cloudflare preview baseUrl is not HTTPS: ${baseUrl}`)
  if (isLocalEvidenceBaseUrl(baseUrl))
    findings.push(`deployed Cloudflare preview baseUrl is local: ${baseUrl}`)

  if (evidence.sourceGuards?.authHandlerSingleton !== true)
    findings.push('deployed Cloudflare preview source guard authHandlerSingleton is not true')

  findings.push(...checkServiceWorkerPrecache('deployed Cloudflare preview', evidence.build?.serviceWorkerPrecache))
  findings.push(...checkApiProbes(evidence.api))
  findings.push(...checkRouteProbes(evidence.routes))
  findings.push(...checkPublicRouteNetwork(evidence.networkSummary?.publicRoutes))
  findings.push(...checkBfcacheProbe(evidence.bfcache))
  if (evidence.bfcache?.realBfcacheHit !== true)
    findings.push('deployed Cloudflare preview did not prove a real bfcache hit')

  findings.push(...checkAuthProviderCallback(evidence.authProviderCallback))
  findings.push(...checkAuthenticatedDashboard(evidence.authenticatedDashboard))

  return findings
}

function createDeployedPreviewEvidenceTemplate() {
  return {
    schema: 'nexus-cloudflare-pages-preview-runtime-smoke/v1',
    status: 'PASS',
    generatedAt: new Date().toISOString(),
    baseUrl: 'https://<cloudflare-pages-preview-host>',
    build: {
      serviceWorkerPrecache: {
        total: 9,
        urls: [
          'pwa-512x512.png',
          'pwa-192x192.png',
          'maskable-icon.png',
          'logo.svg',
          'favicon.ico',
          'apple-touch-icon.png',
          '_nuxt/builds/latest.json',
          '_nuxt/builds/meta/<build-id>.json',
          'manifest.webmanifest',
        ],
        docs: [],
        routeHtml: [],
        nuxtChunkAssets: [],
        nuxtBuildMetadata: [
          '_nuxt/builds/latest.json',
          '_nuxt/builds/meta/<build-id>.json',
        ],
        runtimeContentAssets: [],
      },
    },
    sourceGuards: {
      authHandlerSingleton: true,
    },
    api: [
      createApiProbeTemplate('docs page full body', 200, 25_000, '"title":"Tabs","body"'),
      createApiProbeTemplate('docs navigation', 200, 55_000, '"title":"Docs"'),
      createApiProbeTemplate('docs sidebar components', 200, 42_000, 'normalizedPath'),
      createApiProbeTemplate('docs view unauth read', 200, 42, '"source":"d1"'),
      createApiProbeTemplate('auth session shell', 200, 2, '{}'),
      createApiProbeTemplate('auth providers shell', 200, 577, '"credentials","signinUrl"'),
      createApiProbeTemplate('auth callback shell error boundary', 302, 138, 'error=Callback', '/api/auth/error?error=Callback'),
      createApiProbeTemplate('dashboard auth boundary', 401, 157, '"statusCode": 401,"message": "Unauthorized"'),
    ],
    routes: [
      createRouteProbeTemplate('/', 200, 0, 90, 108, 'output/playwright/nexus-cloudflare-pages-preview-runtime-smoke-YYYY-MM-DD-home.har'),
      createRouteProbeTemplate('/next/', 200, 0, 80, 88, 'output/playwright/nexus-cloudflare-pages-preview-runtime-smoke-YYYY-MM-DD-next.har'),
      createRouteProbeTemplate('/store/', 200, 0, 63, 66, 'output/playwright/nexus-cloudflare-pages-preview-runtime-smoke-YYYY-MM-DD-store.har'),
      createRouteProbeTemplate('/pricing/', 200, 0, 22, 25, 'output/playwright/nexus-cloudflare-pages-preview-runtime-smoke-YYYY-MM-DD-pricing.har'),
      createRouteProbeTemplate('/sign-in/', 200, 0, 39, 41, 'output/playwright/nexus-cloudflare-pages-preview-runtime-smoke-YYYY-MM-DD-sign-in.har'),
      createRouteProbeTemplate('/en/docs/dev/components/tabs/', 200, 1, 30, 36, 'output/playwright/nexus-cloudflare-pages-preview-runtime-smoke-YYYY-MM-DD-docs-tabs.har'),
      createRouteProbeTemplate('/dashboard/', 200, 0, 50, 55, 'output/playwright/nexus-cloudflare-pages-preview-runtime-smoke-YYYY-MM-DD-dashboard.har'),
      createRouteProbeTemplate('/auth/app-callback/', 200, 0, 40, 45, 'output/playwright/nexus-cloudflare-pages-preview-runtime-smoke-YYYY-MM-DD-auth-app-callback.har'),
    ],
    networkSummary: {
      publicRoutes: {
        docsRequests: 0,
        nuxtChunkAssetRequests: 294,
        maxSingleRouteNuxtChunkAssetRequests: 90,
      },
    },
    consoleSummary: {
      errors: [],
    },
    bfcache: {
      navigationType: 'back_forward',
      realBfcacheHit: true,
      pageshowPersisted: [true],
      har: 'output/playwright/nexus-cloudflare-pages-preview-runtime-smoke-YYYY-MM-DD-docs-store-back.har',
    },
    authProviderCallback: {
      ok: true,
      provider: 'github',
      authenticated: true,
      session: {
        authenticated: true,
      },
      har: 'output/playwright/nexus-cloudflare-pages-preview-runtime-smoke-YYYY-MM-DD-auth-provider-callback.har',
    },
    authenticatedDashboard: {
      ok: true,
      status: 200,
      authenticated: true,
      unauthorized: false,
      har: 'output/playwright/nexus-cloudflare-pages-preview-runtime-smoke-YYYY-MM-DD-dashboard-authenticated.har',
    },
    failures: [],
    warnings: [],
  }
}

function createApiProbeTemplate(name, status, bytes, sample, location = undefined) {
  return {
    name,
    ok: true,
    status,
    bytes,
    durationMs: 200,
    sample,
    ...(location ? { location } : {}),
  }
}

function createRouteProbeTemplate(path, status, docs, nuxtChunkAssets, total, har) {
  return {
    path,
    ok: true,
    status,
    error: null,
    h1: path === '/next/' ? 'A local desktop Agent center, one touch away.' : '<captured h1>',
    title: '<captured title>',
    pageErrors: [],
    flags: {
      h1TranslationKeyLeak: false,
      titleTranslationKeyLeak: false,
    },
    requests: {
      docs,
      nuxtChunkAssets,
      total,
      failed: [],
    },
    har,
  }
}

function getEvidenceBaseUrl(evidence) {
  return evidence.baseUrl ?? evidence.baseURL ?? evidence.origin ?? ''
}

function isLocalEvidenceBaseUrl(baseUrl) {
  return /(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)/.test(baseUrl)
}

function isHttpsEvidenceBaseUrl(baseUrl) {
  return /^https:\/\//i.test(baseUrl)
}

function checkAuthProviderCallback(probe) {
  const findings = []

  if (!probe) {
    findings.push('deployed Cloudflare preview auth provider callback evidence is missing')
    return findings
  }

  if (probe.ok !== true)
    findings.push('deployed Cloudflare preview auth provider callback is not ok')
  if (!probe.provider || probe.provider === 'shell')
    findings.push('deployed Cloudflare preview auth provider callback did not identify a real provider')
  if (probe.errorBoundaryOnly === true)
    findings.push('deployed Cloudflare preview auth provider callback only covered the error boundary')
  if (!(probe.authenticated ?? probe.sessionAuthenticated ?? probe.session?.authenticated))
    findings.push('deployed Cloudflare preview auth provider callback did not prove an authenticated session')
  if (!probe.har)
    findings.push('deployed Cloudflare preview auth provider callback HAR is missing')

  return findings
}

function checkAuthenticatedDashboard(probe) {
  const findings = []

  if (!probe) {
    findings.push('deployed Cloudflare preview authenticated dashboard evidence is missing')
    return findings
  }

  if (probe.ok !== true)
    findings.push('deployed Cloudflare preview authenticated dashboard smoke is not ok')
  if (probe.status !== 200)
    findings.push(`deployed Cloudflare preview authenticated dashboard returned ${probe.status}, expected 200`)
  if (!(probe.authenticated ?? probe.sessionAuthenticated ?? probe.session?.authenticated))
    findings.push('deployed Cloudflare preview authenticated dashboard did not prove an authenticated session')
  if (probe.unauthorized === true)
    findings.push('deployed Cloudflare preview authenticated dashboard hit an unauthorized boundary')
  if (!probe.har)
    findings.push('deployed Cloudflare preview authenticated dashboard HAR is missing')

  return findings
}

function checkWranglerEvidence(evidence) {
  const findings = []

  if (!['PASS', 'PASS_WITH_WARNINGS'].includes(evidence.status))
    findings.push(`wrangler status is ${evidence.status}`)

  if (evidence.failures?.length)
    findings.push(`wrangler failures are present: ${evidence.failures.join(', ')}`)

  findings.push(...checkWranglerWarningBudget(evidence))

  if (evidence.sourceGuards?.authHandlerSingleton !== true)
    findings.push('wrangler source guard authHandlerSingleton is not true')

  findings.push(...checkServiceWorkerPrecache('wrangler', evidence.build?.serviceWorkerPrecache))
  findings.push(...checkApiProbes(evidence.api))
  findings.push(...checkRouteProbes(evidence.routes))
  findings.push(...checkPublicRouteNetwork(evidence.networkSummary?.publicRoutes))
  findings.push(...checkBfcacheProbe(evidence.bfcache))

  return findings
}

function checkWranglerWarningBudget(evidence) {
  const findings = []
  const warnings = evidence.warnings ?? []
  const publicRoutes = evidence.networkSummary?.publicRoutes
  const allowedWarningPatterns = [
    /^Console errors observed: \d+$/,
    /^Real bfcache hit not observed; navigation type\/pageshow metrics recorded as evidence only$/,
    /^Public _nuxt chunk\/assets are normal route assets; max single public route count=\d+, cumulative public count=\d+$/,
  ]

  if (evidence.status === 'PASS_WITH_WARNINGS' && !warnings.length)
    findings.push('wrangler status is PASS_WITH_WARNINGS but warnings are missing')
  if (evidence.status === 'PASS' && warnings.length)
    findings.push(`wrangler status is PASS but warnings are present: ${warnings.join('; ')}`)

  for (const warning of warnings) {
    if (!allowedWarningPatterns.some(pattern => pattern.test(warning)))
      findings.push(`unexpected wrangler warning: ${warning}`)
  }

  const consoleErrors = evidence.consoleSummary?.errors ?? []
  const consoleWarning = warnings.find(warning => warning.startsWith('Console errors observed: '))
  const consoleWarningCount = consoleWarning?.match(/^Console errors observed: (\d+)$/)?.[1]
  if (consoleErrors.length > 2)
    findings.push(`wrangler console error budget exceeded: ${consoleErrors.length} > 2`)
  if (consoleWarningCount !== undefined && Number(consoleWarningCount) !== consoleErrors.length)
    findings.push(`wrangler console warning count ${consoleWarningCount} does not match consoleSummary ${consoleErrors.length}`)

  const unexpectedConsoleErrors = consoleErrors.filter(error => error.text !== 'Hydration completed but contains mismatches.' || !['docs detail', 'dashboard unauth shell'].includes(error.route))
  if (unexpectedConsoleErrors.length)
    findings.push(`unexpected wrangler console errors: ${unexpectedConsoleErrors.map(error => `${error.route}: ${error.text}`).join('; ')}`)

  const bfcacheWarning = 'Real bfcache hit not observed; navigation type/pageshow metrics recorded as evidence only'
  if (evidence.bfcache?.realBfcacheHit === false && !warnings.includes(bfcacheWarning))
    findings.push('missing warning for unobserved real bfcache hit')
  if (evidence.bfcache?.realBfcacheHit === true && warnings.includes(bfcacheWarning))
    findings.push('bfcache warning is present even though a real bfcache hit was observed')

  const publicRouteWarning = warnings.find(warning => warning.startsWith('Public _nuxt chunk/assets are normal route assets;'))
  if (publicRouteWarning && publicRoutes) {
    const expectedWarning = `Public _nuxt chunk/assets are normal route assets; max single public route count=${publicRoutes.maxSingleRouteNuxtChunkAssetRequests}, cumulative public count=${publicRoutes.nuxtChunkAssetRequests}`
    if (publicRouteWarning !== expectedWarning)
      findings.push(`public route warning is stale: ${publicRouteWarning}`)
  }

  return findings
}

function checkPwaTrimEvidence(evidence) {
  const findings = []

  if (evidence.ok !== true)
    findings.push('PWA trim evidence ok flag is not true')

  findings.push(...checkPwaServiceWorkerPrecache(evidence.swPrecache))
  findings.push(...checkPwaRouteFanout(evidence.routes))

  return findings
}

function checkServiceWorkerPrecache(label, precache) {
  const findings = []

  if (!precache) {
    findings.push(`${label} service worker precache summary is missing`)
    return findings
  }

  if (precache.total !== 9)
    findings.push(`${label} service worker precache total is ${precache.total}, expected 9`)
  if (precache.docs?.length !== 0)
    findings.push(`${label} service worker docs precache entries are present`)
  if (precache.routeHtml?.length !== 0)
    findings.push(`${label} service worker route HTML precache entries are present`)
  if (precache.nuxtChunkAssets?.length !== 0)
    findings.push(`${label} service worker _nuxt chunk precache entries are present`)
  if (precache.runtimeContentAssets?.length !== 0)
    findings.push(`${label} service worker content runtime precache entries are present`)
  if ((precache.nuxtBuildMetadata?.length ?? 0) > 2)
    findings.push(`${label} service worker Nuxt build metadata entries exceed 2`)

  return findings
}

function checkPwaServiceWorkerPrecache(precache) {
  const findings = []

  if (!precache) {
    findings.push('PWA service worker precache summary is missing')
    return findings
  }

  const expectedZeroFields = [
    'docsRoutes',
    'htmlLikeRoutes',
    'nuxtChunkAssets',
    'nuxtContent',
  ]

  if (precache.total !== 9)
    findings.push(`PWA service worker precache total is ${precache.total}, expected 9`)
  for (const field of expectedZeroFields) {
    if (precache[field] !== 0)
      findings.push(`PWA service worker ${field} is ${precache[field]}, expected 0`)
  }
  if (precache.nuxtBuildMetadata > 2)
    findings.push(`PWA service worker Nuxt build metadata entries exceed 2: ${precache.nuxtBuildMetadata}`)

  return findings
}

function checkApiProbes(apiProbes = []) {
  const requiredProbes = [
    { name: 'docs page full body', statuses: [200], minBytes: 20_000, maxBytes: 40_000, sampleSnippets: ['"title":"Tabs"', '"body"'] },
    { name: 'docs navigation', statuses: [200], minBytes: 40_000, maxBytes: 70_000, sampleSnippets: ['"title":"Docs"'] },
    { name: 'docs sidebar components', statuses: [200], minBytes: 30_000, maxBytes: 60_000, sampleSnippets: ['normalizedPath'] },
    { name: 'docs view unauth read', statuses: [200], minBytes: 20, maxBytes: 120, sampleSnippets: ['"source":"d1"'] },
    { name: 'auth session shell', statuses: [200], minBytes: 2, maxBytes: 20, sampleSnippets: ['{}'] },
    { name: 'auth providers shell', statuses: [200], minBytes: 300, maxBytes: 1_200, sampleSnippets: ['"credentials"', 'signinUrl'] },
    { name: 'auth callback shell error boundary', statuses: [302, 400], minBytes: 80, maxBytes: 400, locationPart: '/api/auth/error?error=Callback', sampleSnippets: ['error=Callback'] },
    { name: 'dashboard auth boundary', statuses: [401], minBytes: 80, maxBytes: 400, sampleSnippets: ['"statusCode": 401', '"message": "Unauthorized"'] },
  ]

  return requiredProbes.flatMap((expectedProbe) => {
    const { name, statuses, minBytes, maxBytes, locationPart, sampleSnippets } = expectedProbe
    const probe = apiProbes.find(item => item.name === name)
    if (!probe)
      return [`missing API probe: ${name}`]
    if (probe.ok !== true)
      return [`API probe is not ok: ${name}`]

    const findings = []
    if (!statuses.includes(probe.status))
      findings.push(`API probe ${name} returned ${probe.status}, expected ${statuses.join(' or ')}`)
    if (probe.bytes < minBytes || probe.bytes > maxBytes)
      findings.push(`API probe ${name} returned ${probe.bytes} bytes, expected ${minBytes}..${maxBytes}`)
    if (probe.durationMs > 1_000)
      findings.push(`API probe ${name} took ${probe.durationMs}ms, expected <= 1000ms`)
    if (locationPart && !probe.location?.includes(locationPart))
      findings.push(`API probe ${name} location ${probe.location ?? '<none>'} does not include ${locationPart}`)

    for (const snippet of sampleSnippets) {
      if (!probe.sample?.includes(snippet))
        findings.push(`API probe ${name} sample is missing ${snippet}`)
    }

    return findings
  })
}

function checkRouteProbes(routeProbes = []) {
  const requiredRoutes = [
    { path: '/', maxDocs: 0, maxNuxt: 100, maxTotal: 120, maxFailed: 3, allowMediaAbortFailures: true },
    { path: '/next/', maxDocs: 0, maxNuxt: 90, maxTotal: 100, maxFailed: 2, allowMediaAbortFailures: true },
    { path: '/store/', maxDocs: 0, maxNuxt: 75, maxTotal: 80, maxFailed: 0 },
    { path: '/pricing/', maxDocs: 0, maxNuxt: 30, maxTotal: 35, maxFailed: 0 },
    { path: '/sign-in/', maxDocs: 0, maxNuxt: 45, maxTotal: 50, maxFailed: 0 },
    { path: '/en/docs/dev/components/tabs/', maxDocs: 1, maxNuxt: 40, maxTotal: 50, maxFailed: 0 },
    { path: '/dashboard/', maxDocs: 0, maxNuxt: 60, maxTotal: 70, maxFailed: 0 },
    { path: '/auth/app-callback/', maxDocs: 0, maxNuxt: 50, maxTotal: 55, maxFailed: 0 },
  ]
  const findings = []

  for (const budget of requiredRoutes) {
    const route = routeProbes.find(item => item.path === budget.path)
    if (!route) {
      findings.push(`missing route probe: ${budget.path}`)
      continue
    }

    if (route.ok !== true)
      findings.push(`route probe is not ok: ${budget.path}`)
    if (route.status !== 200)
      findings.push(`route probe ${budget.path} returned ${route.status}, expected 200`)
    if (route.error)
      findings.push(`route probe ${budget.path} captured error: ${route.error}`)
    if (route.pageErrors?.length)
      findings.push(`route probe ${budget.path} has page errors: ${route.pageErrors.length}`)

    if (route.flags?.h1TranslationKeyLeak || route.flags?.titleTranslationKeyLeak)
      findings.push(`route probe ${budget.path} leaked translation keys`)

    findings.push(...checkRouteRequestBudget(route, budget))
  }

  const nextRoute = routeProbes.find(item => item.path === '/next/')
  if (nextRoute?.h1?.includes('landing.hero.heading'))
    findings.push('/next/ route still leaked landing.hero.heading')

  return findings
}

function checkRouteRequestBudget(route, budget) {
  const findings = []
  const requests = route.requests

  if (!requests)
    return [`route probe ${budget.path} request summary is missing`]

  if (requests.docs > budget.maxDocs)
    findings.push(`route probe ${budget.path} made ${requests.docs} docs requests, expected <= ${budget.maxDocs}`)
  if (requests.nuxtChunkAssets > budget.maxNuxt)
    findings.push(`route probe ${budget.path} made ${requests.nuxtChunkAssets} _nuxt chunk/asset requests, expected <= ${budget.maxNuxt}`)
  if (requests.total > budget.maxTotal)
    findings.push(`route probe ${budget.path} made ${requests.total} total requests, expected <= ${budget.maxTotal}`)

  const failed = requests.failed ?? []
  if (failed.length > budget.maxFailed)
    findings.push(`route probe ${budget.path} has ${failed.length} failed requests, expected <= ${budget.maxFailed}`)
  if (!budget.allowMediaAbortFailures && failed.length)
    findings.push(`route probe ${budget.path} has unexpected failed requests`)

  if (budget.allowMediaAbortFailures) {
    const unexpectedFailed = failed.filter(request => request.failure !== 'net::ERR_ABORTED' || !request.url?.includes('/shots/'))
    if (unexpectedFailed.length)
      findings.push(`route probe ${budget.path} has unexpected failed requests: ${unexpectedFailed.map(request => request.url).join(', ')}`)
  }

  return findings
}

function checkPublicRouteNetwork(publicRoutes) {
  const findings = []

  if (!publicRoutes) {
    findings.push('wrangler public route network summary is missing')
    return findings
  }

  if (publicRoutes.docsRequests !== 0)
    findings.push(`public routes made ${publicRoutes.docsRequests} docs requests`)
  if (publicRoutes.maxSingleRouteNuxtChunkAssetRequests > 100)
    findings.push(`public route max _nuxt request count is ${publicRoutes.maxSingleRouteNuxtChunkAssetRequests}, expected <= 100`)
  if (publicRoutes.nuxtChunkAssetRequests > 320)
    findings.push(`public route cumulative _nuxt request count is ${publicRoutes.nuxtChunkAssetRequests}, expected <= 320`)

  return findings
}

function checkBfcacheProbe(bfcache) {
  const findings = []

  if (!bfcache) {
    findings.push('bfcache probe summary is missing')
    return findings
  }

  if (bfcache.navigationType !== 'back_forward')
    findings.push(`bfcache navigation type is ${bfcache.navigationType}, expected back_forward`)

  return findings
}

function checkPwaRouteFanout(routes = []) {
  const publicRouteBudgets = [
    { key: 'home', maxNuxtNonBuild: 100, maxHtmlLike: 0, maxFailed: 3, allowMediaAbortFailures: true },
    { key: 'store', maxNuxtNonBuild: 75, maxHtmlLike: 1, maxFailed: 0 },
    { key: 'pricing', maxNuxtNonBuild: 30, maxHtmlLike: 1, maxFailed: 0 },
    { key: 'sign-in', maxNuxtNonBuild: 45, maxHtmlLike: 1, maxFailed: 0 },
  ]
  const findings = []

  for (const budget of publicRouteBudgets) {
    const route = routes.find(item => item.key === budget.key)
    if (!route) {
      findings.push(`missing PWA public route evidence: ${budget.key}`)
      continue
    }

    if (route.mainStatus !== 200)
      findings.push(`PWA route ${budget.key} returned ${route.mainStatus}, expected 200`)
    if (route.docsRequestCount !== 0)
      findings.push(`PWA route ${budget.key} made ${route.docsRequestCount} docs requests`)
    if (route.backgroundDocsRequestCount !== 0)
      findings.push(`PWA route ${budget.key} made ${route.backgroundDocsRequestCount} background docs requests`)
    if (route.docsPageOrContentFanoutCount !== 0)
      findings.push(`PWA route ${budget.key} made ${route.docsPageOrContentFanoutCount} docs page/content fan-out requests`)
    if (route.statusErrorCount !== 0)
      findings.push(`PWA route ${budget.key} has ${route.statusErrorCount} status errors`)
    if (route.nuxtNonBuildRequestCount > budget.maxNuxtNonBuild)
      findings.push(`PWA route ${budget.key} made ${route.nuxtNonBuildRequestCount} non-build _nuxt requests, expected <= ${budget.maxNuxtNonBuild}`)
    if (route.htmlLikeRequestCount > budget.maxHtmlLike)
      findings.push(`PWA route ${budget.key} made ${route.htmlLikeRequestCount} HTML-like requests, expected <= ${budget.maxHtmlLike}`)

    findings.push(...checkPwaFailedRequestBudget(route, budget))
  }

  const docsRoute = routes.find(item => item.key === 'docs-tabs')
  if (!docsRoute) {
    findings.push('missing PWA docs detail route evidence')
  }
  else {
    findings.push(...checkPwaDocsDetailRoute(docsRoute))
  }

  return findings
}

function checkPwaFailedRequestBudget(route, budget) {
  const findings = []
  const failed = route.failedRequests ?? []

  if (route.failedCount > budget.maxFailed || failed.length > budget.maxFailed)
    findings.push(`PWA route ${budget.key} has ${route.failedCount} failed requests, expected <= ${budget.maxFailed}`)
  if (!budget.allowMediaAbortFailures && failed.length)
    findings.push(`PWA route ${budget.key} has unexpected failed requests`)

  if (budget.allowMediaAbortFailures) {
    const unexpectedFailed = failed.filter(request => request.failure !== 'net::ERR_ABORTED' || !request.url?.includes('/shots/'))
    if (unexpectedFailed.length)
      findings.push(`PWA route ${budget.key} has unexpected failed requests: ${unexpectedFailed.map(request => request.url).join(', ')}`)
  }

  return findings
}

function checkPwaDocsDetailRoute(route) {
  const findings = []
  const expectedStaticApi404s = [
    '/api/docs/page',
    '/api/docs/feedback',
    '/api/docs/comments',
  ]

  if (route.mainStatus !== 200)
    findings.push(`PWA docs detail returned ${route.mainStatus}, expected 200`)
  if (route.docsPageOrContentFanoutCount !== 0)
    findings.push(`PWA docs detail has ${route.docsPageOrContentFanoutCount} docs page/content fan-out requests`)
  if (route.docsApiRequestCount !== 6)
    findings.push(`PWA docs detail made ${route.docsApiRequestCount} docs API requests, expected 6 under static serving`)
  if (route.statusErrorCount !== expectedStaticApi404s.length)
    findings.push(`PWA docs detail has ${route.statusErrorCount} status errors, expected ${expectedStaticApi404s.length} static API 404s`)
  if (route.failedCount !== 0)
    findings.push(`PWA docs detail has ${route.failedCount} failed requests`)
  if (route.nuxtNonBuildRequestCount > 55)
    findings.push(`PWA docs detail made ${route.nuxtNonBuildRequestCount} non-build _nuxt requests, expected <= 55`)

  const statusErrors = route.statusErrors ?? []
  for (const expectedPath of expectedStaticApi404s) {
    const match = statusErrors.find(error => error.status === 404 && error.url?.includes(expectedPath))
    if (!match)
      findings.push(`PWA docs detail missing expected static API 404 for ${expectedPath}`)
  }

  return findings
}
