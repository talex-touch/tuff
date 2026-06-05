import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  cdpBaseUrl,
  closeTarget,
  collectPageEvents,
  createClient,
  createTarget,
  delay,
  evaluate,
  repoRoot,
  screenshot,
  setViewport,
  waitFor,
} from '../../../packages/tuffex/scripts/audit-cdp-client.mjs'

const nexusBaseUrl = process.env.NEXUS_VISUAL_SMOKE_URL || 'http://127.0.0.1:3200'
const auditDate = process.env.NEXUS_VISUAL_SMOKE_DATE
  || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
const reportDir = path.resolve(
  repoRoot,
  process.env.NEXUS_VISUAL_SMOKE_OUT || `output/playwright/tuffex-visual-smoke/${auditDate}`,
)
const screenshotDir = path.join(reportDir, 'screenshots')
const reportPath = path.join(reportDir, 'tuffex-composition-smoke-report.json')
const compositionUrl = `${nexusBaseUrl.replace(/\/$/, '')}/docs/dev/getting-started/tuffex-composition`

const demos = [
  {
    id: 'data-operations',
    title: 'Data operations panel',
    titles: ['Data operations panel', '数据运维面板'],
    headings: ['Data Lists And Pagination', '数据运维面板'],
  },
  {
    id: 'navigation-shell',
    title: 'Dashboard navigation shell',
    titles: ['Dashboard navigation shell', '后台导航配置壳层'],
    headings: ['Navigation And Configuration Shell', '后台导航配置壳层'],
  },
  {
    id: 'feedback-task-center',
    title: 'Dashboard task feedback center',
    titles: ['Dashboard task feedback center', '后台任务反馈中心'],
    headings: ['Task Feedback Path', '后台任务反馈中心'],
  },
  {
    id: 'permission-orchestration',
    title: 'Permission orchestration panel',
    titles: ['Permission orchestration panel', '权限编排面板'],
    headings: ['Permission Orchestration Path', '权限编排面板'],
  },
  {
    id: 'release-policy',
    title: 'Release policy configuration',
    titles: ['Release policy configuration', '发布策略配置'],
    headings: ['Release Policy Configuration', '发布策略配置'],
  },
]

const viewports = [
  { name: 'mobile', width: 375, height: 812, mobile: true },
  { name: 'tablet', width: 768, height: 900, mobile: false },
  { name: 'desktop', width: 1440, height: 1000, mobile: false },
]

const themes = ['light', 'dark']
const scenarioRetryDelayMs = 1_000

function safeName(...parts) {
  return parts.join('-').replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
}

async function warmNexusPage() {
  await globalThis.fetch(compositionUrl, { cache: 'no-store' }).catch(() => undefined)
}

async function waitForNexusPage(client) {
  await waitFor(
    client,
    `document.readyState === 'complete' && (document.querySelector('#__nuxt') || document.querySelector('#app'))`,
    10_000,
  )
  await waitFor(client, `document.body.innerText.includes('Tuffex') || document.body.innerText.includes('TuffEx')`, 10_000)
  await delay(500)
}

async function emulateThemeAndMotion(client, theme) {
  await client.send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: theme },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ],
  })
}

async function applyPageTheme(client, theme) {
  await evaluate(client, `(() => {
    const theme = ${JSON.stringify(theme)}
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.style.colorScheme = theme
    localStorage.setItem('color-mode', theme)
  })()`)
  await delay(200)
}

async function scrollToDemo(client, demo) {
  const headings = JSON.stringify(demo.headings)
  const found = await evaluate(client, `(() => {
    const headings = ${headings}
    const candidates = Array.from(document.querySelectorAll('h2, h3, [data-heading], .tuff-demo-wrapper, .TuffDemoWrapper'))
    const target = candidates.find((element) => {
      const text = (element.innerText || element.textContent || '').trim()
      return headings.some(heading => text.includes(heading))
    })
    if (!target)
      return false
    target.scrollIntoView({ block: 'start', inline: 'nearest' })
    window.scrollBy(0, -72)
    return true
  })()`)
  await delay(350)
  return Boolean(found)
}

async function collectMetrics(client, demo) {
  const demoTitles = JSON.stringify(demo.titles ?? [demo.title])
  return await evaluate(client, `(() => {
    const demoTitles = ${demoTitles}
    const root = document.documentElement
    const body = document.body
    const text = body?.innerText || ''
    const clientWidth = root.clientWidth
    const scrollWidth = Math.max(root.scrollWidth, body?.scrollWidth || 0)
    const visibleDemoText = demoTitles.some(title => text.includes(title))
    const unresolvedVue = Array.from(document.querySelectorAll('[class*="demo"], .vp-doc, main'))
      .flatMap(element => Array.from(element.querySelectorAll('*')))
      .map(element => element.tagName.toLowerCase())
      .filter(tag => tag.includes('-'))
      .filter(tag => !['number-flow-vue'].includes(tag))
      .filter((tag, index, list) => list.indexOf(tag) === index)
      .slice(0, 20)
    const brokenImages = Array.from(document.images)
      .filter(image => image.complete && image.naturalWidth === 0)
      .map(image => image.currentSrc || image.src)
    return {
      title: document.title,
      bodyLength: text.length,
      hasApp: Boolean(document.querySelector('#__nuxt') || document.querySelector('#app')),
      visibleDemoText,
      scrollWidth,
      clientWidth,
      pageOverflow: scrollWidth > clientWidth + 1,
      brokenImages,
      unresolvedVue,
    }
  })()`)
}

function failureReasons({ metrics, didScroll, consoleMessages, pageErrors, badResponses }) {
  const failures = []
  if (!metrics.hasApp)
    failures.push('missing Nuxt app root')
  if (!didScroll)
    failures.push('demo heading not found')
  if (!metrics.visibleDemoText)
    failures.push('demo title not visible in document text')
  if (metrics.bodyLength < 1000)
    failures.push('document content too short')
  if (metrics.pageOverflow)
    failures.push(`horizontal page overflow: ${metrics.scrollWidth}/${metrics.clientWidth}`)
  if (metrics.brokenImages.length > 0)
    failures.push(`broken images: ${metrics.brokenImages.length}`)
  if (metrics.unresolvedVue.length > 0)
    failures.push(`unresolved vue tags: ${metrics.unresolvedVue.join(', ')}`)
  if (consoleMessages.length > 0)
    failures.push(`console warnings/errors: ${consoleMessages.length}`)
  if (pageErrors.length > 0)
    failures.push(`page errors: ${pageErrors.length}`)
  if (badResponses.length > 0)
    failures.push(`bad responses: ${badResponses.length}`)
  return failures
}

function fallbackMetrics() {
  return {
    title: '',
    bodyLength: 0,
    hasApp: false,
    visibleDemoText: false,
    scrollWidth: 0,
    clientWidth: 0,
    pageOverflow: false,
    brokenImages: [],
    unresolvedVue: [],
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function isRetryableWaitFailure(message) {
  return message.includes('Timed out waiting for document.readyState')
    || message.includes('Timed out waiting for document.body.innerText.includes')
}

function isRetryableDevServerFailure(result) {
  const badResponses = result.badResponses ?? []
  const consoleMessages = result.console ?? []
  const failureText = [
    ...(result.failureReasons ?? []),
    result.error?.message,
  ].filter(Boolean).join('\n')
  const hasNuxtAssetGatewayTimeout = badResponses.some(response =>
    response.status === 504 && response.url.includes('/_nuxt/'),
  )
  const hasDynamicImportFailure = consoleMessages.some(message =>
    message.text.includes('Failed to fetch dynamically imported module'),
  )
  const hasNuxt500 = result.metrics?.title?.includes('500 - Internal Server Error')

  return hasNuxtAssetGatewayTimeout
    || (hasNuxt500 && hasDynamicImportFailure)
    || isRetryableWaitFailure(failureText)
}

async function auditScenario({ demo, viewport, theme }) {
  const target = await createTarget('about:blank')
  const client = createClient(target.webSocketDebuggerUrl)
  const { consoleMessages, pageErrors, badResponses } = collectPageEvents(client)
  const screenshotName = safeName(demo.id, viewport.name, `${viewport.width}`, theme, 'reduced-motion')

  try {
    await client.send('Runtime.enable')
    await client.send('Page.enable')
    await client.send('Network.enable')
    await client.send('Network.setCacheDisabled', { cacheDisabled: true })
    await setViewport(client, viewport)
    await emulateThemeAndMotion(client, theme)
    await client.send('Page.navigate', { url: compositionUrl })
    await waitForNexusPage(client)
    await applyPageTheme(client, theme)
    const didScroll = await scrollToDemo(client, demo)
    const metrics = await collectMetrics(client, demo)
    const screenshotPath = await screenshot(client, screenshotName, screenshotDir)
    const failures = failureReasons({ metrics, didScroll, consoleMessages, pageErrors, badResponses })

    return {
      demo: demo.id,
      title: demo.title,
      viewport: viewport.name,
      width: viewport.width,
      height: viewport.height,
      theme,
      reducedMotion: true,
      url: compositionUrl,
      status: failures.length === 0 ? 'PASS' : 'FAIL',
      failureReasons: failures,
      screenshot: screenshotPath,
      metrics,
      console: consoleMessages,
      pageErrors,
      badResponses,
    }
  }
  catch (error) {
    const message = errorMessage(error)
    const metrics = await collectMetrics(client, demo).catch(() => fallbackMetrics())
    const screenshotPath = await screenshot(client, `${screenshotName}-error`, screenshotDir).catch(() => null)

    return {
      demo: demo.id,
      title: demo.title,
      viewport: viewport.name,
      width: viewport.width,
      height: viewport.height,
      theme,
      reducedMotion: true,
      url: compositionUrl,
      status: 'FAIL',
      failureReasons: [`scenario error: ${message}`],
      screenshot: screenshotPath,
      metrics,
      console: consoleMessages,
      pageErrors,
      badResponses,
      error: { message },
    }
  }
  finally {
    client.close()
    await closeTarget(target.id)
  }
}

async function auditScenarioWithRetry({ demo, viewport, theme }) {
  const first = await auditScenario({ demo, viewport, theme })
  if (first.status === 'PASS' || !isRetryableDevServerFailure(first))
    return first

  await warmNexusPage()
  await delay(scenarioRetryDelayMs)
  const retry = await auditScenario({ demo, viewport, theme })
  return {
    ...retry,
    retried: true,
    retryReason: first.failureReasons,
  }
}

await mkdir(screenshotDir, { recursive: true })
await warmNexusPage()

const results = []
for (const demo of demos) {
  for (const viewport of viewports) {
    for (const theme of themes) {
      const result = await auditScenarioWithRetry({ demo, viewport, theme })
      results.push(result)
      const suffix = result.status === 'PASS' ? '' : ` ${result.failureReasons.join('; ')}`
      console.log(`${result.status} ${demo.id} ${viewport.width}px ${theme} reduced-motion${suffix}`)
    }
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl: nexusBaseUrl,
  cdpUrl: cdpBaseUrl,
  page: compositionUrl,
  scope: 'tuffex-composition-demos',
  coverage: {
    demos: demos.map(demo => demo.id),
    widths: viewports.map(viewport => viewport.width),
    themes,
    reducedMotion: true,
  },
  total: results.length,
  passed: results.filter(result => result.status === 'PASS').length,
  failed: results.filter(result => result.status === 'FAIL').length,
  results,
}

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(`Report: ${reportPath}`)

if (report.failed > 0)
  process.exitCode = 1
