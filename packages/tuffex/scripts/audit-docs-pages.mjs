import { readdir, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  cdpBaseUrl,
  closeTarget,
  collectPageEvents,
  createClient,
  createTarget,
  delay,
  docsBaseUrl,
  evaluate,
  reportDir,
  repoRoot,
  screenshot,
  setViewport,
  waitForPage,
} from './audit-cdp-client.mjs'

const componentDocsDir = path.join(repoRoot, 'packages/tuffex/docs/components')

const mobileFocusedPages = [
  'button',
  'input',
  'textarea',
  'number-input',
  'select',
  'flat-select',
  'checkbox',
  'radio',
  'flat-radio',
  'switch',
  'slider',
  'date-picker',
  'cascader',
  'tree-select',
  'tabs',
  'tab-bar',
  'nav-bar',
  'dropdown-menu',
  'context-menu',
  'popover',
  'tooltip',
  'dialog',
  'modal',
  'drawer',
  'toast',
  'command-palette',
  'data-table',
  'transfer',
  'scroll',
  'virtual-list',
  'file-uploader',
  'image-uploader',
  'chat',
  'chat-composer',
  'copy-button',
  'divider',
  'kbd',
]

const pageAuditExpression = `(() => {
  const text = document.body.innerText || ''
  const root = document.documentElement
  const body = document.body
  const clientWidth = root.clientWidth
  const scrollWidth = Math.max(root.scrollWidth, body.scrollWidth)

  window.scrollTo(99999, window.scrollY)
  const actualScrollXAfter = window.scrollX
  window.scrollTo(0, window.scrollY)

  const isVisible = (element) => {
    const style = window.getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.opacity !== '0'
      && rect.width > 1
      && rect.height > 1
  }

  const hasHiddenAncestor = element => Boolean(element.closest('[aria-hidden="true"], [hidden], [inert]'))

  const clipsOverflow = (style) => {
    return [style.overflow, style.overflowX, style.overflowY]
      .some(value => value === 'auto' || value === 'scroll' || value === 'hidden' || value === 'clip')
  }

  const intersectRect = (first, second) => {
    const left = Math.max(first.left, second.left)
    const top = Math.max(first.top, second.top)
    const right = Math.min(first.right, second.right)
    const bottom = Math.min(first.bottom, second.bottom)
    if (right <= left || bottom <= top)
      return null
    return { left, top, right, bottom, width: right - left, height: bottom - top }
  }

  const clippedByOverflowAncestor = (element, rect) => {
    let visibleRect = rect
    let current = element.parentElement

    while (current && current !== document.documentElement) {
      const style = window.getComputedStyle(current)
      if (clipsOverflow(style)) {
        const nextRect = intersectRect(visibleRect, current.getBoundingClientRect())
        if (!nextRect)
          return true
        if (nextRect.left > visibleRect.left + 1 || nextRect.right < visibleRect.right - 1)
          return true
        visibleRect = nextRect
      }
      current = current.parentElement
    }

    return false
  }

  const cssPath = (element) => {
    const parts = []
    let current = element
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      let part = current.tagName.toLowerCase()
      if (current.id) {
        part += '#' + current.id
        parts.unshift(part)
        break
      }
      const className = Array.from(current.classList || []).slice(0, 2).join('.')
      if (className)
        part += '.' + className
      parts.unshift(part)
      current = current.parentElement
    }
    return parts.join(' > ')
  }

  const ignoredOverflowSelector = [
    '.VPSidebar',
    '.VPNavScreen',
    '.VPBackdrop',
    '.VPLocalNavOutlineDropdown',
    '.VPNavBarMenuGroup',
  ].join(',')

  const visibleOverflow = Array.from(document.body.querySelectorAll('*'))
    .filter(element => !element.closest(ignoredOverflowSelector))
    .filter(element => !hasHiddenAncestor(element))
    .filter(element => !element.closest('pre, code'))
    .filter(isVisible)
    .map((element) => {
      const rect = element.getBoundingClientRect()
      return { element, rect }
    })
    .filter(({ rect }) => rect.bottom >= 0 && rect.top <= window.innerHeight)
    .filter(({ rect }) => rect.left < -1 || rect.right > clientWidth + 1)
    .filter(({ element, rect }) => !clippedByOverflowAncestor(element, rect))
    .slice(0, 20)
    .map(({ element, rect }) => ({
      selector: cssPath(element),
      text: (element.innerText || element.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 120),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      width: Math.round(rect.width),
    }))

  const brokenImages = Array.from(document.images)
    .filter(image => image.complete && image.naturalWidth === 0)
    .map(image => image.currentSrc || image.src)

  const allowedCustomElements = new Set(['number-flow-vue'])

  const unresolvedVue = Array.from(document.querySelectorAll('.vp-doc *'))
    .filter(element => element.tagName.toLowerCase().includes('-'))
    .filter(element => !element.closest('pre, code, .language-vue, .language-html, .language-ts, .language-js'))
    .map(element => element.tagName.toLowerCase())
    .filter(tag => !allowedCustomElements.has(tag))
    .filter((tag, index, list) => list.indexOf(tag) === index)

  const sourceLeaks = Array.from(document.querySelectorAll('.demo-block__preview'))
    .map((element, index) => ({
      index,
      text: (element.innerText || element.textContent || '').trim(),
    }))
    .filter(({ text }) => /<template|<script|<style|<Tx[A-Z]|<\\/DemoBlock>|\`\`\`/.test(text))
    .map(({ index, text }) => ({
      index,
      text: text.replace(/\\s+/g, ' ').slice(0, 200),
    }))

  const statCardValues = Array.from(document.querySelectorAll('.tx-stat-card'))
    .map(element => (element.innerText || '').trim().replace(/\\s+/g, ' '))

  const statCardInsights = Array.from(document.querySelectorAll('.tx-stat-card [class*="insight"], .tx-stat-card [class*="trend"]'))
    .map(element => (element.innerText || '').trim().replace(/\\s+/g, ' '))
    .filter(Boolean)

  const tabsRoot = document.querySelector('.vp-doc .demo-block .tx-tabs')
  const tabsProbe = tabsRoot
    ? {
        active: tabsRoot.querySelector('.tx-tab-item.is-active')?.innerText.trim() || '',
        content: tabsRoot.querySelector('.tx-tabs__main')?.innerText.trim() || '',
      }
    : null

  return {
    title: document.title,
    h1: document.querySelector('.vp-doc h1')?.innerText.trim() || '',
    bodyLength: text.length,
    hasApp: Boolean(document.querySelector('#app')),
    hasDoc: Boolean(document.querySelector('.vp-doc')),
    hasContent: text.trim().length > 200,
    notFound: document.title.includes('404') || text.includes('Page Not Found') || text.includes('This page is dead'),
    scrollWidth,
    clientWidth,
    actualScrollXAfter,
    pageOverflow: scrollWidth > clientWidth + 1 || actualScrollXAfter > 0,
    visibleOverflow,
    brokenImages,
    unresolvedVue,
    sourceLeaks,
    statCardValues,
    statCardInsights,
    tabsProbe,
  }
})()`

function urlForPage(page) {
  if (page === 'index')
    return `${docsBaseUrl}/components/`
  return `${docsBaseUrl}/components/${page}.html`
}

async function readAllPages() {
  const entries = await readdir(componentDocsDir)
  return entries
    .filter(entry => entry.endsWith('.md'))
    .map(entry => entry.replace(/\.md$/, ''))
    .sort((a, b) => {
      if (a === 'index')
        return -1
      if (b === 'index')
        return 1
      return a.localeCompare(b)
    })
}

function requestedModes() {
  const value = process.env.TUFFEX_DOCS_AUDIT_MODE || process.argv[2] || 'desktop'
  const modes = value === 'all' ? ['desktop', 'mobile', 'theme'] : value.split(',').map(mode => mode.trim())
  const allowed = new Set(['desktop', 'mobile', 'theme'])
  for (const mode of modes) {
    if (!allowed.has(mode))
      throw new Error(`Unsupported audit mode: ${mode}`)
  }
  return modes
}

function pageFailures({ metrics, consoleMessages, pageErrors, badResponses }) {
  const failures = []

  if (!metrics.hasApp)
    failures.push('missing #app')
  if (!metrics.hasDoc)
    failures.push('missing .vp-doc')
  if (!metrics.hasContent)
    failures.push('document content too short')
  if (metrics.notFound)
    failures.push('page is not found')
  if (metrics.pageOverflow)
    failures.push(`horizontal page overflow: ${metrics.scrollWidth}/${metrics.clientWidth}`)
  if (metrics.visibleOverflow.length > 0)
    failures.push(`visible overflow elements: ${metrics.visibleOverflow.length}`)
  if (metrics.brokenImages.length > 0)
    failures.push(`broken images: ${metrics.brokenImages.length}`)
  if (metrics.unresolvedVue.length > 0)
    failures.push(`unresolved vue tags: ${metrics.unresolvedVue.join(', ')}`)
  if (metrics.sourceLeaks.length > 0)
    failures.push(`source leaks in previews: ${metrics.sourceLeaks.length}`)
  if (consoleMessages.length > 0)
    failures.push(`console warnings/errors: ${consoleMessages.length}`)
  if (pageErrors.length > 0)
    failures.push(`page errors: ${pageErrors.length}`)
  if (badResponses.length > 0)
    failures.push(`bad responses: ${badResponses.length}`)

  return failures
}

async function applyTheme(client, theme) {
  if (!theme)
    return

  await evaluate(client, `(() => {
    const theme = ${JSON.stringify(theme)}
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
    localStorage.setItem('vitepress-theme-appearance', theme)
  })()`)
  await delay(180)
}

async function auditPage({ page, viewport, theme, screenshotDir }) {
  const url = urlForPage(page)
  const target = await createTarget('about:blank')
  const client = createClient(target.webSocketDebuggerUrl)
  const { consoleMessages, pageErrors, badResponses } = collectPageEvents(client)

  try {
    await client.send('Runtime.enable')
    await client.send('Page.enable')
    await client.send('Network.enable')
    await client.send('Network.setCacheDisabled', { cacheDisabled: true })
    await setViewport(client, viewport)
    await client.send('Page.navigate', { url })
    await waitForPage(client)
    await applyTheme(client, theme)

    const metrics = await evaluate(client, pageAuditExpression)
    const failureReasons = pageFailures({ metrics, consoleMessages, pageErrors, badResponses })
    const screenshotPath = await screenshot(client, page, screenshotDir)

    return {
      page,
      theme,
      url,
      status: failureReasons.length === 0 ? 'PASS' : 'FAIL',
      failureReasons,
      screenshot: screenshotPath,
      metrics,
      console: consoleMessages,
      pageErrors,
      badResponses,
    }
  }
  finally {
    client.close()
    await closeTarget(target.id)
  }
}

async function runScenario({ name, pages, viewport, themes, screenshotDir, reportPath }) {
  await mkdir(screenshotDir, { recursive: true })
  const results = []

  for (const theme of themes) {
    const targetScreenshotDir = theme ? path.join(screenshotDir, theme) : screenshotDir
    await mkdir(targetScreenshotDir, { recursive: true })

    for (const page of pages) {
      const result = await auditPage({
        page,
        viewport,
        theme,
        screenshotDir: targetScreenshotDir,
      })
      results.push(result)

      const themePrefix = theme ? `${theme} ` : ''
      const suffix = result.status === 'PASS' ? '' : ` ${result.failureReasons.join('; ')}`
      console.log(`${result.status} ${name} ${themePrefix}${page}${suffix}`)
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: docsBaseUrl,
    cdpUrl: cdpBaseUrl,
    mode: name,
    viewport,
    total: results.length,
    passed: results.filter(result => result.status === 'PASS').length,
    failed: results.filter(result => result.status === 'FAIL').length,
    results,
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`Report: ${reportPath}`)

  return report
}

const allPages = await readAllPages()
const modeConfigs = {
  desktop: {
    name: 'desktop',
    pages: allPages,
    viewport: { width: 1440, height: 1000, mobile: false },
    themes: [null],
    screenshotDir: path.join(reportDir, 'screenshots'),
    reportPath: path.join(reportDir, 'desktop-static-report.json'),
  },
  mobile: {
    name: 'mobile',
    pages: mobileFocusedPages,
    viewport: { width: 390, height: 844, mobile: true },
    themes: [null],
    screenshotDir: path.join(reportDir, 'mobile-screenshots'),
    reportPath: path.join(reportDir, 'mobile-focused-report.json'),
  },
  theme: {
    name: 'theme',
    pages: allPages,
    viewport: { width: 1440, height: 1000, mobile: false },
    themes: ['light', 'dark'],
    screenshotDir: path.join(reportDir, 'theme-screenshots'),
    reportPath: path.join(reportDir, 'theme-static-report.json'),
  },
}

const reports = []
for (const mode of requestedModes())
  reports.push(await runScenario(modeConfigs[mode]))

if (reports.some(report => report.failed > 0))
  process.exitCode = 1
