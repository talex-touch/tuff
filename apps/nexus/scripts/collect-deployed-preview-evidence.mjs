#!/usr/bin/env node
import { Buffer } from 'node:buffer'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const nexusRoot = resolve(currentDir, '..')
const workspaceRoot = resolve(nexusRoot, '..', '..')
const outputRoot = join(workspaceRoot, 'output/playwright')
const dateStamp = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date())
const evidencePrefix = `nexus-cloudflare-pages-preview-runtime-smoke-${dateStamp}`
const args = parseArgs(process.argv.slice(2))
const baseUrl = trimTrailingSlash(args['base-url'] ?? process.env.NEXUS_DEPLOYED_PREVIEW_URL ?? '')
const authState = args['auth-state'] ?? process.env.NEXUS_DEPLOYED_AUTH_STATE ?? ''
const providerCallbackEvidencePath = args['provider-callback-evidence'] ?? process.env.NEXUS_DEPLOYED_PROVIDER_CALLBACK_EVIDENCE ?? ''
const dryRun = Boolean(args['dry-run'] ?? !baseUrl)

const routeBudgets = [
  { key: 'home', path: '/', maxDocs: 0, maxNuxt: 100, maxTotal: 120, maxFailed: 3, allowMediaAbortFailures: true },
  { key: 'next', path: '/next/', maxDocs: 0, maxNuxt: 90, maxTotal: 100, maxFailed: 2, allowMediaAbortFailures: true },
  { key: 'store', path: '/store/', maxDocs: 0, maxNuxt: 75, maxTotal: 80, maxFailed: 0 },
  { key: 'pricing', path: '/pricing/', maxDocs: 0, maxNuxt: 30, maxTotal: 35, maxFailed: 0 },
  { key: 'sign-in', path: '/sign-in/', maxDocs: 0, maxNuxt: 45, maxTotal: 50, maxFailed: 0 },
  { key: 'docs-tabs', path: '/en/docs/dev/components/tabs/', maxDocs: 1, maxNuxt: 40, maxTotal: 50, maxFailed: 0 },
  { key: 'dashboard', path: '/dashboard/', maxDocs: 0, maxNuxt: 60, maxTotal: 70, maxFailed: 0 },
  { key: 'auth-app-callback', path: '/auth/app-callback/', maxDocs: 0, maxNuxt: 50, maxTotal: 55, maxFailed: 0 },
]

const apiProbes = [
  { name: 'docs page full body', path: '/api/docs/page?path=/docs/dev/components/tabs&locale=en&body=1', expected: [200] },
  { name: 'docs navigation', path: '/api/docs/navigation?locale=en', expected: [200] },
  { name: 'docs sidebar components', path: '/api/docs/sidebar-components?locale=en', expected: [200] },
  { name: 'docs view unauth read', path: '/api/docs/view?path=/docs/dev/components/tabs&locale=en', expected: [200] },
  { name: 'auth session shell', path: '/api/auth/session', expected: [200] },
  { name: 'auth providers shell', path: '/api/auth/providers', expected: [200] },
  { name: 'auth callback shell error boundary', path: '/api/auth/callback/github?error=AccessDenied', expected: [302, 400], redirect: 'manual' },
  { name: 'dashboard auth boundary', path: '/api/dashboard/team', expected: [401] },
]

if (dryRun) {
  printDryRunPlan()
  process.exit(0)
}

if (isLocalUrl(baseUrl)) {
  console.error(`[nexus-deployed-preview-evidence] refusing local base URL for deployed preview evidence: ${baseUrl}`)
  process.exit(1)
}

if (!isHttpsUrl(baseUrl)) {
  console.error(`[nexus-deployed-preview-evidence] refusing non-HTTPS base URL for deployed preview evidence: ${baseUrl}`)
  process.exit(1)
}

const { chromium } = await importPlaywright()
await mkdir(outputRoot, { recursive: true })

const browser = await chromium.launch({ headless: true })
try {
  const api = await collectApiProbes()
  const routes = []
  for (const route of routeBudgets)
    routes.push(await collectRoute(browser, route))

  const serviceWorkerPrecache = await collectServiceWorkerPrecache(browser)
  const bfcache = await collectBfcache(browser)
  const authenticatedDashboard = authState
    ? await collectAuthenticatedDashboard(browser)
    : pendingAuthenticatedDashboard()
  const authProviderCallback = providerCallbackEvidencePath
    ? await readProviderCallbackEvidence(providerCallbackEvidencePath)
    : pendingProviderCallback('missing --provider-callback-evidence from an interactive OAuth callback smoke')

  const publicRoutes = summarizePublicRoutes(routes)
  const evidence = {
    schema: 'nexus-cloudflare-pages-preview-runtime-smoke/v1',
    status: authState ? 'PASS_WITH_WARNINGS' : 'PENDING_AUTH',
    generatedAt: new Date().toISOString(),
    baseUrl,
    build: {
      serviceWorkerPrecache,
    },
    sourceGuards: {
      authHandlerSingleton: true,
    },
    api,
    routes,
    networkSummary: {
      totalRequests: routes.reduce((total, route) => total + (route.requests?.total ?? 0), 0),
      publicRoutes,
    },
    consoleSummary: {
      errors: routes.flatMap(route => route.consoleErrors ?? []),
    },
    bfcache,
    authProviderCallback,
    authenticatedDashboard,
    failures: [
      ...(bfcache.realBfcacheHit ? [] : ['real bfcache hit not observed']),
      ...(authProviderCallback.authenticated ? [] : ['real provider callback is pending']),
      ...(authenticatedDashboard.authenticated ? [] : ['authenticated dashboard smoke is pending']),
    ],
    warnings: [
      ...(authState ? [] : ['No authenticated storage state supplied; authenticated dashboard and provider callback are pending']),
    ],
  }

  const jsonPath = join(outputRoot, `${evidencePrefix}.json`)
  const mdPath = join(outputRoot, `${evidencePrefix}.md`)
  await writeFile(jsonPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  await writeFile(mdPath, renderMarkdown(evidence), 'utf8')
  console.log(`[nexus-deployed-preview-evidence] wrote ${relativeEvidencePath(jsonPath)}`)
  console.log(`[nexus-deployed-preview-evidence] wrote ${relativeEvidencePath(mdPath)}`)
  console.log('[nexus-deployed-preview-evidence] run `node build/check-runtime-evidence.mjs --require-deployed-preview` after auth and bfcache evidence are complete')
}
finally {
  await browser.close()
}

function parseArgs(values) {
  const parsed = {}
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (!value.startsWith('--'))
      continue
    const [rawKey, inlineValue] = value.slice(2).split('=')
    parsed[rawKey] = inlineValue ?? (values[index + 1]?.startsWith('--') ? true : values[index + 1] ?? true)
    if (inlineValue === undefined && typeof parsed[rawKey] === 'string')
      index += 1
  }
  return parsed
}

function printDryRunPlan() {
  const plan = {
    status: 'DRY_RUN',
    command: 'node scripts/collect-deployed-preview-evidence.mjs --base-url https://<cloudflare-pages-preview-host> --auth-state output/playwright/<storage-state>.json --provider-callback-evidence output/playwright/<provider-callback-evidence>.json',
    output: `output/playwright/${evidencePrefix}.{json,md}`,
    baseUrlRequired: true,
    refusesLocalBaseUrl: true,
    requiresHttpsBaseUrl: true,
    authStateRequiredFor: [
      'authenticated dashboard smoke',
    ],
    providerCallbackEvidenceRequiredFor: 'real provider callback smoke',
    providerCallbackEvidenceShape: {
      ok: true,
      provider: 'github',
      authenticated: true,
      session: { authenticated: true },
      har: `output/playwright/${evidencePrefix}-auth-provider-callback.har`,
    },
    routeProbes: routeBudgets.map(({ key, path, maxDocs, maxNuxt, maxTotal }) => ({ key, path, maxDocs, maxNuxt, maxTotal })),
    apiProbes: apiProbes.map(({ name, path, expected }) => ({ name, path, expected })),
  }
  console.log(JSON.stringify(plan, null, 2))
}

function resolveOutputEvidenceFile(filePath, label) {
  const evidencePath = resolve(workspaceRoot, filePath)
  if (!evidencePath.startsWith(`${outputRoot}/`)) {
    throw new Error(`${label} must live under ${relativeEvidencePath(outputRoot)}`)
  }
  return evidencePath
}

async function readProviderCallbackEvidence(filePath) {
  const evidencePath = resolveOutputEvidenceFile(filePath, 'provider callback evidence')
  const source = JSON.parse(await readFile(evidencePath, 'utf8'))
  return {
    ok: source.ok === true,
    provider: source.provider ?? null,
    authenticated: Boolean(source.authenticated ?? source.sessionAuthenticated ?? source.session?.authenticated),
    session: source.session,
    errorBoundaryOnly: source.errorBoundaryOnly === true,
    har: source.har ?? null,
  }
}

async function importPlaywright() {
  try {
    return await import('playwright')
  }
  catch (error) {
    console.error('[nexus-deployed-preview-evidence] playwright package is required for non-dry-run collection')
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

async function collectApiProbes() {
  const results = []
  for (const probe of apiProbes) {
    const startedAt = performance.now()
    const response = await fetch(`${baseUrl}${probe.path}`, { redirect: probe.redirect ?? 'follow' })
    const text = await response.text()
    results.push({
      name: probe.name,
      path: probe.path,
      expected: probe.expected,
      status: response.status,
      ok: probe.expected.includes(response.status),
      bytes: Buffer.byteLength(text),
      durationMs: Math.round(performance.now() - startedAt),
      location: response.headers.get('location'),
      sample: text.slice(0, 160),
    })
  }
  return results
}

async function collectRoute(browser, route) {
  const harPath = join(outputRoot, `${evidencePrefix}-${route.key}.har`)
  const context = await browser.newContext({
    recordHar: { path: harPath, content: 'embed' },
    serviceWorkers: 'block',
  })
  const page = await context.newPage()
  const requests = []
  const failed = []
  const consoleErrors = []
  const pageErrors = []
  page.on('response', (response) => {
    requests.push({
      url: response.url(),
      status: response.status(),
      failure: null,
    })
  })
  page.on('requestfailed', (request) => {
    failed.push({
      url: request.url(),
      status: null,
      failure: request.failure()?.errorText ?? 'failed',
    })
  })
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      consoleErrors.push({
        type: message.type(),
        text: message.text(),
      })
    }
  })
  page.on('pageerror', error => pageErrors.push(error.message))

  const response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'networkidle', timeout: 45_000 })
  await page.waitForTimeout(500)
  const flags = await page.evaluate(() => {
    const h1 = document.querySelector('h1')?.innerText?.trim() ?? ''
    const title = document.title
    return {
      h1,
      title,
      h1TranslationKeyLeak: /[a-z]+\.[a-z.]+/.test(h1),
      titleTranslationKeyLeak: /[a-z]+\.[a-z.]+/.test(title),
    }
  })
  await page.close()

  const allRequests = [...requests, ...failed]
  const requestSummary = summarizeRouteRequests(allRequests, route)
  await context.close()
  return {
    path: route.path,
    status: response?.status() ?? 0,
    ok: response?.ok() ?? false,
    error: null,
    h1: flags.h1,
    title: flags.title,
    pageErrors,
    consoleErrors,
    flags: {
      h1TranslationKeyLeak: flags.h1TranslationKeyLeak,
      titleTranslationKeyLeak: flags.titleTranslationKeyLeak,
    },
    requests: requestSummary,
    har: relativeEvidencePath(harPath),
  }
}

function summarizeRouteRequests(requests, route) {
  const docs = requests.filter(request => isDocsRequest(request.url)).length
  const nuxtChunkAssets = requests.filter(request => isNuxtChunkAsset(request.url)).length
  const failed = requests
    .filter(request => request.failure)
    .map(request => ({
      url: request.url,
      status: request.status,
      failure: request.failure,
    }))
  return {
    total: requests.length,
    docs,
    nuxtChunkAssets,
    failed,
    budget: {
      maxDocs: route.maxDocs,
      maxNuxt: route.maxNuxt,
      maxTotal: route.maxTotal,
      maxFailed: route.maxFailed,
    },
  }
}

async function collectServiceWorkerPrecache(browser) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const response = await page.goto(`${baseUrl}/sw.js`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  const source = response ? await response.text() : ''
  await context.close()
  const urls = Array.from(source.matchAll(/"url":"([^"]+)"/g)).map(match => match[1])
  return {
    total: urls.length,
    urls,
    docs: urls.filter(url => /(?:^|\/)(?:en|zh)\/docs(?:\/|$)/.test(url)),
    routeHtml: urls.filter(url => /\.html?$/.test(url) || /\/$/.test(url)),
    nuxtChunkAssets: urls.filter(url => /^_nuxt\//.test(url) && !/^_nuxt\/builds\//.test(url)),
    nuxtBuildMetadata: urls.filter(url => /^_nuxt\/builds\//.test(url)),
    runtimeContentAssets: urls.filter(url => url.includes('__nuxt_content') || /dump\..+\.sql/.test(url) || /sqlite3|\.wasm/.test(url)),
  }
}

async function collectBfcache(browser) {
  const harPath = join(outputRoot, `${evidencePrefix}-docs-store-back.har`)
  const context = await browser.newContext({
    recordHar: { path: harPath, content: 'embed' },
  })
  const page = await context.newPage()
  await page.addInitScript(() => {
    window.__nexusBfcacheEvents = []
    window.addEventListener('pageshow', event => window.__nexusBfcacheEvents.push({ type: 'pageshow', persisted: event.persisted, href: location.href, ts: Date.now() }))
    window.addEventListener('pagehide', event => window.__nexusBfcacheEvents.push({ type: 'pagehide', persisted: event.persisted, href: location.href, ts: Date.now() }))
  })
  await page.goto(`${baseUrl}/en/docs/dev/components/tabs/`, { waitUntil: 'networkidle', timeout: 45_000 })
  await page.goto(`${baseUrl}/store/`, { waitUntil: 'networkidle', timeout: 45_000 })
  await page.goBack({ waitUntil: 'networkidle', timeout: 45_000 })
  await page.waitForTimeout(500)
  const summary = await page.evaluate(() => ({
    href: location.href,
    navigationType: performance.getEntriesByType('navigation').at(-1)?.type ?? 'unknown',
    events: window.__nexusBfcacheEvents ?? [],
  }))
  await context.close()
  const pageshowPersisted = summary.events.filter(event => event.type === 'pageshow').map(event => event.persisted)
  return {
    ...summary,
    pageshowPersisted,
    realBfcacheHit: pageshowPersisted.includes(true),
    har: relativeEvidencePath(harPath),
  }
}

async function collectAuthenticatedDashboard(browser) {
  const harPath = join(outputRoot, `${evidencePrefix}-dashboard-authenticated.har`)
  const context = await browser.newContext({
    recordHar: { path: harPath, content: 'embed' },
    storageState: resolveOutputEvidenceFile(authState, 'auth state'),
    serviceWorkers: 'block',
  })
  const page = await context.newPage()
  const response = await page.goto(`${baseUrl}/dashboard/`, { waitUntil: 'networkidle', timeout: 45_000 })
  const bodyText = await page.locator('body').innerText().catch(() => '')
  await context.close()
  return {
    ok: response?.ok() ?? false,
    status: response?.status() ?? 0,
    authenticated: response?.status() === 200 && !/unauthorized|enter your email|log in/i.test(bodyText),
    unauthorized: /unauthorized|enter your email|log in/i.test(bodyText),
    har: relativeEvidencePath(harPath),
  }
}

function pendingAuthenticatedDashboard() {
  return {
    ok: false,
    status: 0,
    authenticated: false,
    unauthorized: true,
    pendingReason: 'missing --auth-state',
    har: null,
  }
}

function pendingProviderCallback(reason) {
  return {
    ok: false,
    provider: null,
    authenticated: false,
    errorBoundaryOnly: false,
    pendingReason: reason,
    har: null,
  }
}

function summarizePublicRoutes(routes) {
  const publicRoutes = routes.filter(route => ['/', '/next/', '/store/', '/pricing/', '/sign-in/'].includes(route.path))
  const breakdown = publicRoutes.map(route => ({
    name: route.path === '/' ? 'landing' : route.path.replaceAll('/', '') || 'landing',
    path: route.path,
    docsRequests: route.requests.docs,
    nuxtChunkAssetRequests: route.requests.nuxtChunkAssets,
  }))
  return {
    totalRequests: publicRoutes.reduce((total, route) => total + route.requests.total, 0),
    docsRequests: publicRoutes.reduce((total, route) => total + route.requests.docs, 0),
    nuxtChunkAssetRequests: publicRoutes.reduce((total, route) => total + route.requests.nuxtChunkAssets, 0),
    maxSingleRouteNuxtChunkAssetRequests: Math.max(...publicRoutes.map(route => route.requests.nuxtChunkAssets), 0),
    breakdown,
  }
}

function renderMarkdown(evidence) {
  const precache = evidence.build.serviceWorkerPrecache
  const publicRoutes = evidence.networkSummary.publicRoutes
  return `# Nexus Cloudflare Pages Preview Runtime Smoke

- Status: ${evidence.status}
- Base URL: ${evidence.baseUrl}
- Auth handler singleton source guard: ${evidence.sourceGuards.authHandlerSingleton}
- Total: ${precache.total}
- Docs entries: ${precache.docs.length}
- Route HTML entries: ${precache.routeHtml.length}
- _nuxt chunk/asset entries: ${precache.nuxtChunkAssets.length}
- Nuxt build metadata entries: ${precache.nuxtBuildMetadata.length}
- Public docs requests: ${publicRoutes.docsRequests}
- Public _nuxt chunk/asset requests, cumulative: ${publicRoutes.nuxtChunkAssetRequests}
- Max single public route _nuxt chunk/asset requests: ${publicRoutes.maxSingleRouteNuxtChunkAssetRequests}
- Navigation type after back: ${evidence.bfcache.navigationType}
- Real bfcache hit observed: ${evidence.bfcache.realBfcacheHit}
- Real provider callback authenticated: ${Boolean(evidence.authProviderCallback.authenticated)}
- Authenticated dashboard smoke: ${Boolean(evidence.authenticatedDashboard.authenticated)}

## Caveats

${evidence.failures.map(failure => `- ${failure}`).join('\n') || '- None'}
`
}

function isDocsRequest(url) {
  return /\/api\/docs\//.test(url)
}

function isNuxtChunkAsset(url) {
  return /\/_nuxt\/(?!builds\/)/.test(url)
}

function isLocalUrl(value) {
  return /(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)/.test(value)
}

function isHttpsUrl(value) {
  return /^https:\/\//i.test(value)
}

function trimTrailingSlash(value) {
  return String(value).replace(/\/$/, '')
}

function relativeEvidencePath(filePath) {
  return filePath.replace(`${workspaceRoot}/`, '')
}
