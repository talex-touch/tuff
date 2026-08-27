// Sweeps every component doc page and measures whether it is actually smooth:
// all demos mount (no stuck placeholders, no danger-colored failures), the
// console stays clean, and a full-page scripted scroll produces no dropped
// frames or long tasks beyond the dev-server baseline.
//
// Demos are IntersectionObserver-lazy (TuffDemoWrapper), so the scroll is not
// just a jank probe — it is what activates every demo on the page. Counting
// placeholders before scrolling would report a healthy page as broken.
//
// Usage:
//   TUFFEX_CDP_URL=http://127.0.0.1:9226 \
//   NEXUS_SMOOTHNESS_URL=http://127.0.0.1:3200 \
//   node scripts/component-docs-smoothness-audit.mjs [slug ...]
//
// Frame numbers come from a dev server and an unminified bundle: treat them as
// relative signals between pages of the same run, not absolute budgets.

import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
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
} from './audit-cdp-client.mjs'

// localhost, not 127.0.0.1 — the dev server binds the former only.
const nexusBaseUrl = (process.env.NEXUS_SMOOTHNESS_URL || 'http://localhost:3200').replace(/\/$/, '')
const locale = process.env.NEXUS_SMOOTHNESS_LOCALE || 'zh'
const auditDate = process.env.NEXUS_SMOOTHNESS_DATE
  || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
const reportDir = path.resolve(
  repoRoot,
  process.env.NEXUS_SMOOTHNESS_OUT || `output/playwright/component-smoothness/${auditDate}`,
)
const screenshotDir = path.join(reportDir, 'screenshots')

const componentsDir = path.join(repoRoot, 'apps/nexus/content/docs/dev/components')

async function listSlugs() {
  const entries = await readdir(componentsDir)
  return entries
    .filter(entry => entry.endsWith('.zh.mdc'))
    .map(entry => entry.replace(/\.zh\.mdc$/, ''))
    .sort()
}

const PROBE_SETUP = `(() => {
  const state = { frames: [], longTasks: [], errors: [] }
  window.__smooth = state
  let last = performance.now()
  let running = true
  const tick = (now) => {
    state.frames.push(now - last)
    last = now
    if (running) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  state.stop = () => { running = false }
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        state.longTasks.push(Math.round(entry.duration))
    })
    po.observe({ entryTypes: ['longtask'] })
  } catch {}
  return true
})()`

const SCROLL_STEP = `(() => {
  const el = document.scrollingElement || document.documentElement
  const before = el.scrollTop
  el.scrollTop = Math.min(before + 900, el.scrollHeight)
  return { at: el.scrollTop, height: el.scrollHeight, done: el.scrollTop === before }
})()`

const PAGE_STATE = `(() => {
  const total = document.querySelectorAll('section.tuff-demo').length
  const placeholders = [...document.querySelectorAll('.tuff-demo__placeholder')]
  const failed = placeholders.filter(el => (el.getAttribute('style') || '').includes('danger')).length
  return JSON.stringify({
    demosTotal: total,
    demosUnresolved: placeholders.length,
    demosFailed: failed,
    animations: typeof document.getAnimations === 'function' ? document.getAnimations().length : -1,
  })
})()`

const PROBE_COLLECT = `(() => {
  const s = window.__smooth || { frames: [], longTasks: [] }
  if (s.stop) s.stop()
  const frames = s.frames.slice(5) // discard rAF warm-up
  const dropped = frames.filter(ms => ms > 34).length
  const worst = frames.reduce((max, ms) => Math.max(max, ms), 0)
  return JSON.stringify({
    frames: frames.length,
    droppedFrames: dropped,
    worstFrameMs: Math.round(worst),
    longTasks: s.longTasks.length,
    longTaskTotalMs: s.longTasks.reduce((sum, ms) => sum + ms, 0),
  })
})()`

async function auditPage(client, events, slug) {
  const url = `${nexusBaseUrl}/${locale}/docs/dev/components/${slug}`
  events.consoleMessages.length = 0
  events.pageErrors.length = 0
  events.badResponses.length = 0
  // Page.navigate, not a location.href evaluate: navigation destroys the JS
  // context and an in-flight Runtime.evaluate can then hang forever.
  await client.send('Page.navigate', { url })

  // The old document also answers readyState "complete", so the wait must pin
  // the new pathname first or every probe runs against the previous page.
  const pathname = `/${locale}/docs/dev/components/${slug}`
  await waitFor(client, `location.pathname === ${JSON.stringify(pathname)} && document.readyState === "complete"`, 60000)
  // Demos appear on hydration; cold dev routes compile on first hit.
  await waitFor(client, 'document.querySelectorAll("section.tuff-demo").length > 0', 30000).catch(() => undefined)
  await delay(1200)

  await evaluate(client, PROBE_SETUP)

  // Scroll to the bottom in steps; every step can activate lazy demos.
  for (let i = 0; i < 60; i++) {
    const step = JSON.parse((await evaluate(client, `JSON.stringify(${SCROLL_STEP})`)) ?? '{}')
    await delay(320)
    if (step.done)
      break
  }
  // Let trailing dynamic imports and enter animations settle, then re-check.
  await delay(2500)
  const probe = JSON.parse((await evaluate(client, PROBE_COLLECT)) ?? '{}')
  const state = JSON.parse((await evaluate(client, PAGE_STATE)) ?? '{}')

  const consoleErrors = events.consoleMessages
    .filter(message => message.level === 'error')
    .map(message => message.text?.slice(0, 200))
  const pageErrors = events.pageErrors.map(text => String(text).slice(0, 200))
  const badResponses = events.badResponses.map(bad => `${bad.status} ${bad.url}`.slice(0, 160))

  const verdictProblems = []
  if (state.demosTotal === 0)
    verdictProblems.push('no demos found on the page')
  if (state.demosFailed > 0)
    verdictProblems.push(`${state.demosFailed} demo(s) failed to load`)
  if (state.demosUnresolved > state.demosFailed)
    verdictProblems.push(`${state.demosUnresolved - state.demosFailed} demo(s) stuck on placeholder`)
  if (pageErrors.length)
    verdictProblems.push(`${pageErrors.length} uncaught exception(s)`)
  if (consoleErrors.length)
    verdictProblems.push(`${consoleErrors.length} console error(s)`)
  if (badResponses.length)
    verdictProblems.push(`${badResponses.length} failed request(s)`)

  const result = {
    slug,
    url,
    ...state,
    ...probe,
    consoleErrors,
    pageErrors,
    badResponses,
    problems: verdictProblems,
  }

  if (verdictProblems.length)
    await screenshot(client, `defect-${slug}`, screenshotDir).catch(() => undefined)

  return result
}

async function main() {
  await mkdir(screenshotDir, { recursive: true })
  const requested = process.argv.slice(2)
  const slugs = requested.length ? requested : await listSlugs()

  const target = await createTarget('about:blank')
  const client = createClient(target.webSocketDebuggerUrl)
  await client.ready
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Network.enable')
  const events = collectPageEvents(client)
  await setViewport(client, { width: 1440, height: 900 })

  const results = []
  for (const slug of slugs) {
    try {
      const result = await auditPage(client, events, slug)
      results.push(result)
      const flag = result.problems.length ? `PROBLEMS: ${result.problems.join('; ')}` : 'ok'
      console.log(`[${results.length}/${slugs.length}] ${slug} — demos ${result.demosTotal - result.demosUnresolved}/${result.demosTotal}, dropped ${result.droppedFrames}/${result.frames}f, worst ${result.worstFrameMs}ms, longtasks ${result.longTasks} — ${flag}`)
    }
    catch (error) {
      results.push({ slug, fatal: String(error).slice(0, 300) })
      console.log(`[${results.length}/${slugs.length}] ${slug} — FATAL ${String(error).slice(0, 120)}`)
    }
  }

  await client.close?.()
  await closeTarget(target.id)

  const summary = {
    auditDate,
    baseUrl: nexusBaseUrl,
    pages: results.length,
    withProblems: results.filter(result => result.problems?.length || result.fatal).length,
    results,
  }
  const reportPath = path.join(reportDir, 'smoothness-report.json')
  await writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`)
  console.log(`report: ${reportPath}`)
  console.log(`pages with problems: ${summary.withProblems}/${summary.pages}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
