#!/usr/bin/env node
/**
 * Runtime acceptance for `.trellis/tasks/08-27-nexus-docs-body-ssg`.
 *
 * Runs against a locally served *production build* of apps/nexus. See README.md
 * for the serve command; this script never builds and never starts a server.
 *
 * Every check carries a positive control. A harness that captures nothing, or
 * whose matcher never matches, would otherwise report "no `/api/docs/page`
 * request" as a pass while proving nothing at all — which is the exact failure
 * mode this file is built to be immune to. Each control is asserted as its own
 * reported line, so a broken harness fails loudly instead of passing quietly.
 *
 *   C1  initial load issues zero /api/docs/page requests
 *   C2  the served HTML already contains the rendered body
 *   C3  hydration keeps that body (and emits no Vue hydration warnings)
 *   C4  SPA navigation still lazy-loads the body over /api/docs/page
 *   C5  a blocked body fetch surfaces an error state with a retry affordance
 */
import process from 'node:process'
import {
  createReporter,
  delay,
  evaluate,
  launchChrome,
  navigate,
  openPage,
  pollFor,
  withTimeout,
} from './cdp-harness.mjs'

const BODY_API_PATHNAME = '/api/docs/page'
const CONTROL_MARKER = '__harness_control'
const CONSOLE_PROBE_MARKER = '__harness_console_probe__'
const HYDRATION_PATTERN
  = /\[Vue warn\]|Hydration (?:node|text|children|class|style|attribute) mismatch|Hydration completed but contains mismatches/i

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.NEXUS_VERIFY_URL || 'http://127.0.0.1:8788',
    docPath: process.env.NEXUS_VERIFY_DOC || '/en/docs/dev/components/button/',
    targetPath: process.env.NEXUS_VERIFY_TARGET_DOC || '',
    port: Number(process.env.NEXUS_VERIFY_CDP_PORT || 9333),
    settleMs: Number(process.env.NEXUS_VERIFY_SETTLE_MS || 5000),
    errorWaitMs: Number(process.env.NEXUS_VERIFY_ERROR_WAIT_MS || 12000),
    only: null,
  }
  for (const raw of argv) {
    const [key, value] = raw.startsWith('--') ? raw.slice(2).split('=') : [null, null]
    if (!key)
      continue
    if (key === 'base-url')
      args.baseUrl = value
    else if (key === 'doc-path')
      args.docPath = value
    else if (key === 'target-path')
      args.targetPath = value
    else if (key === 'port')
      args.port = Number(value)
    else if (key === 'settle-ms')
      args.settleMs = Number(value)
    else if (key === 'error-wait-ms')
      args.errorWaitMs = Number(value)
    else if (key === 'only')
      args.only = new Set(value.split(',').map(part => part.trim().toUpperCase()))
    else if (key === 'help')
      args.help = true
  }
  return args
}

function usage() {
  console.log(`
verify-docs-ssg.mjs — runtime acceptance for prerendered docs bodies

  --base-url=<url>        server root (default http://127.0.0.1:8788, env NEXUS_VERIFY_URL)
  --doc-path=<path>       doc to load first (default /en/docs/dev/components/button/)
  --target-path=<path>    doc to SPA-navigate to (default: discovered from the page's own links)
  --only=C1,C4            run a subset of checks
  --settle-ms=<n>         quiet window after load before asserting "no request" (default 5000)
  --error-wait-ms=<n>     how long C5 waits for an error state (default 12000)
  --port=<n>              chrome remote debugging port (default 9333)

exit 0 = all pass, 1 = a check failed, 3 = only not-yet-implemented checks outstanding
`)
}

function isBodyApiUrl(url) {
  try {
    return new URL(url).pathname === BODY_API_PATHNAME
  }
  catch {
    return false
  }
}

function isControlRequest(url) {
  return url.includes(CONTROL_MARKER)
}

/**
 * `<h2` inside an inline script is not rendered markup. Nexus builds with
 * `payloadExtraction: false`, so the doc record — body included — is inlined in
 * the `__NUXT_DATA__` script tag; counting that would report "the body is in
 * the HTML" for a page that renders an empty shell. The self-test's shell mode
 * caught exactly this.
 */
function stripScriptsAndStyles(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
}

function countOpeningTags(html, tag) {
  const matches = stripScriptsAndStyles(html).match(new RegExp(`<${tag}\\b`, 'gi'))
  return matches ? matches.length : 0
}

function localeOf(docPath) {
  const match = docPath.match(/^\/(en|zh)\//)
  return match ? match[1] : 'en'
}

/** `/en/docs/dev/components/button/` -> `/docs/dev/components/button` */
function docsRecordPath(docPath) {
  return docPath.replace(/^\/(?:en|zh)/, '').replace(/\/+$/, '') || '/docs'
}

const DOM_PROBE = `(() => {
  const scope = document.querySelector('.docs-surface') || document.body
  const prose = scope.querySelector('.docs-prose:not(.docs-prose-skeleton)')
  const headings = prose
    ? Array.from(prose.querySelectorAll('h2')).map(node => (node.textContent || '').trim()).filter(Boolean)
    : []
  return {
    pathname: location.pathname,
    hasProse: Boolean(prose),
    h2Count: prose ? prose.querySelectorAll('h2').length : 0,
    h3Count: prose ? prose.querySelectorAll('h3').length : 0,
    preCount: prose ? prose.querySelectorAll('pre').length : 0,
    headings,
    proseTextLength: prose ? (prose.textContent || '').trim().length : 0,
    hasSkeleton: Boolean(scope.querySelector('.docs-prose-skeleton')),
    hasDeferredShell: Boolean(scope.querySelector('.docs-deferred-body-shell')),
    hasLoadingState: Boolean(document.querySelector('.docs-loading-state')),
  }
})()`

const LINK_PROBE = String.raw`(() => {
  const here = location.pathname.replace(/\/$/, '')
  const scope = document.querySelector('.docs-surface') || document.body
  const collect = root => Array.from(root.querySelectorAll('a[href]'))
    .filter(node => !node.closest('.docs-hero-crumb'))
    .map(node => ({ href: node.getAttribute('href') || '', text: (node.textContent || '').trim().slice(0, 60) }))
    .filter(item => /^\/(en|zh)\/docs\/.+/.test(item.href))
    .filter(item => item.href.replace(/\/$/, '') !== here)
  const inArticle = collect(scope)
  return { inArticle, anywhere: inArticle.length ? inArticle : collect(document) }
})()`

const ERROR_PROBE = String.raw`(() => {
  const scope = document.querySelector('.docs-surface') || document.body
  const retryPattern = /retry|try again|reload|重试|重新加载|再试一次/i
  const prose = scope.querySelector('.docs-prose:not(.docs-prose-skeleton)')
  const controls = Array.from(scope.querySelectorAll('button, [role="button"], a[href="#"], [data-testid]'))
    .map(node => ({
      tag: node.tagName.toLowerCase(),
      testid: node.getAttribute('data-testid') || '',
      aria: node.getAttribute('aria-label') || '',
      text: (node.textContent || '').trim().slice(0, 60),
    }))
  const retry = controls.filter(item =>
    retryPattern.test(item.text) || retryPattern.test(item.aria) || /retry/i.test(item.testid))
  const alerts = Array.from(scope.querySelectorAll('[role="alert"], [class*="error"], [class*="failed"]'))
    .map(node => (node.textContent || '').trim().slice(0, 160))
    .filter(Boolean)
  return {
    hasSkeleton: Boolean(scope.querySelector('.docs-prose-skeleton')),
    h2Count: prose ? prose.querySelectorAll('h2').length : 0,
    retry,
    alerts,
    surfaceText: (scope.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300),
  }
})()`

async function preflight(reporter, ctx) {
  const pageUrl = new URL(ctx.docPath, ctx.baseUrl).toString()
  try {
    const response = await withTimeout(globalThis.fetch(pageUrl, { redirect: 'follow' }), 20000, `GET ${pageUrl}`)
    ctx.html = await response.text()
    if (!response.ok) {
      reporter.fail('C0.serve', `${pageUrl} returned HTTP ${response.status}`, [
        'The server is up but is not serving this doc route.',
        'Check the build finished and that the path exists under apps/nexus/dist.',
      ])
      return false
    }
    reporter.pass('C0.serve', `HTTP ${response.status} ${pageUrl} (${ctx.html.length} bytes)`)
  }
  catch (error) {
    reporter.fail('C0.serve', `cannot reach ${pageUrl}: ${error.message}`, [
      'Start the server first — see README.md "Serving the build".',
    ])
    return false
  }

  const apiUrl = new URL(
    `${BODY_API_PATHNAME}?path=${encodeURIComponent(docsRecordPath(ctx.docPath))}`
    + `&locale=${localeOf(ctx.docPath)}&body=1`,
    ctx.baseUrl,
  ).toString()
  try {
    const response = await withTimeout(globalThis.fetch(apiUrl), 20000, `GET ${apiUrl}`)
    ctx.bodyApiStatus = response.status
    if (response.ok)
      reporter.pass('C0.body-api', `HTTP ${response.status} ${BODY_API_PATHNAME} is served`)
    else
      reporter.info('C0.body-api', `HTTP ${response.status} from ${BODY_API_PATHNAME} — C4/C5 need a worker-backed server`)
  }
  catch (error) {
    ctx.bodyApiStatus = 0
    reporter.info('C0.body-api', `${BODY_API_PATHNAME} unreachable (${error.message}) — C4/C5 need a worker-backed server`)
  }
  return true
}

/** C2 — the body is in the served HTML, provable without running any page script. */
async function checkBodyInHtml(reporter, ctx) {
  const rawH2 = countOpeningTags(ctx.html, 'h2')
  const strippedH2 = countOpeningTags(ctx.html.replace(/<h2\b[^>]*>/gi, '<span>'), 'h2')
  if (strippedH2 !== 0) {
    reporter.fail('C2.control', `the <h2> counter returned ${strippedH2} on HTML with every <h2> stripped`, [
      'The counter cannot distinguish presence from absence, so its verdict below means nothing.',
    ])
    return null
  }
  reporter.pass('C2.control', 'the <h2> counter returns 0 on <h2>-stripped HTML (it can report absence)')

  if (rawH2 > 0)
    reporter.pass('C2.raw-html', `served HTML contains ${rawH2} <h2> tag(s) before any JS runs`)
  else
    reporter.fail('C2.raw-html', 'served HTML contains no <h2> — the body is not prerendered')

  const page = await openPage({ disableScripts: true })
  let probe = null
  try {
    await navigate(page, new URL(ctx.docPath, ctx.baseUrl).toString())
    probe = await evaluate(page, DOM_PROBE)
    if (probe.hasProse && probe.h2Count > 0) {
      reporter.pass(
        'C2.no-js-dom',
        `with JavaScript disabled the DOM has ${probe.h2Count} <h2>, ${probe.preCount} <pre>, ${probe.proseTextLength} chars of prose`,
      )
    }
    else {
      reporter.fail('C2.no-js-dom', `with JavaScript disabled the body is absent (prose=${probe.hasProse}, h2=${probe.h2Count})`)
    }
    if (probe.hasSkeleton)
      reporter.fail('C2.no-skeleton', 'the JS-free render shows .docs-prose-skeleton — HTML ships a placeholder, not the body')
    else
      reporter.pass('C2.no-skeleton', 'the JS-free render shows no body skeleton')
    if (rawH2 !== probe.h2Count) {
      reporter.info('C2.cross-check', `raw-HTML count (${rawH2}) and parsed-DOM count (${probe.h2Count}) differ`, [
        'Both being > 0 is what matters; a gap usually means <h2> also appears outside .docs-surface.',
      ])
    }
  }
  catch (error) {
    reporter.fail('C2.no-js-dom', `JS-disabled render failed: ${error.message}`)
  }
  finally {
    await page.close()
  }
  return probe
}

/** C1 + C3 — one hydrating page load, watched from before the first byte. */
async function checkInitialLoad(reporter, ctx, noJsProbe) {
  const page = await openPage()
  try {
    await navigate(page, new URL(ctx.docPath, ctx.baseUrl).toString())
    await delay(ctx.settleMs)

    // Layer 1 of the control: a capture that recorded nothing cannot prove absence.
    const captured = page.capture.requests
    if (captured.length === 0) {
      reporter.fail('C1.capture-live', 'the network capture recorded zero requests for the whole page load', [
        'Not a product finding — the harness is not attached. Every verdict below is void.',
      ])
      return
    }
    reporter.pass('C1.capture-live', `capture recorded ${captured.length} request(s) during load`, [
      `sample: ${captured.slice(0, 3).map(item => new URL(item.url).pathname).join(', ')}`,
    ])

    const bodyRequests = captured.filter(item => isBodyApiUrl(item.url) && !isControlRequest(item.url))
    if (bodyRequests.length === 0) {
      reporter.pass('C1.no-body-fetch', `no ${BODY_API_PATHNAME} request in ${ctx.settleMs}ms after load`)
    }
    else {
      reporter.fail('C1.no-body-fetch', `${bodyRequests.length} ${BODY_API_PATHNAME} request(s) on initial load`,
        bodyRequests.map(item => item.url))
    }

    // Layer 2 of the control: the same capture, the same matcher, a request we
    // know was made. If this does not show up, the pass above was vacuous.
    const controlUrl = new URL(
      `${BODY_API_PATHNAME}?path=${encodeURIComponent(docsRecordPath(ctx.docPath))}`
      + `&locale=${localeOf(ctx.docPath)}&body=1&${CONTROL_MARKER}=1`,
      ctx.baseUrl,
    ).toString()
    await evaluate(page, `fetch(${JSON.stringify(controlUrl)}).then(() => 1).catch(() => 1)`)
    try {
      await pollFor(
        () => page.capture.requests.some(item => isBodyApiUrl(item.url) && isControlRequest(item.url)),
        { timeoutMs: 5000, label: 'control request to appear in the capture' },
      )
      reporter.pass('C1.control', `a deliberate ${BODY_API_PATHNAME} request WAS captured by the same matcher`)
    }
    catch {
      reporter.fail('C1.control', `a deliberate ${BODY_API_PATHNAME} request was NOT captured`, [
        'The capture or the URL matcher is broken; C1 above proves nothing.',
      ])
    }

    // C3 — hydration.
    const hydrated = await evaluate(page, DOM_PROBE)
    if (noJsProbe) {
      const before = noJsProbe.headings
      const after = hydrated.headings
      const same = before.length === after.length && before.every((text, index) => text === after[index])
      if (same && after.length > 0) {
        reporter.pass('C3.body-survived', `hydration preserved all ${after.length} <h2> heading(s) from the SSR body`)
      }
      else {
        reporter.fail('C3.body-survived', `heading set changed across hydration (${before.length} before, ${after.length} after)`, [
          `before: ${JSON.stringify(before.slice(0, 6))}`,
          `after:  ${JSON.stringify(after.slice(0, 6))}`,
          'A body discarded into a skeleton is the exact regression the payload-key match guards against.',
        ])
      }
    }
    if (hydrated.hasSkeleton) {
      reporter.fail('C3.no-skeleton', 'after hydration the page shows .docs-prose-skeleton — the SSR body was thrown away')
    }
    else {
      reporter.pass('C3.no-skeleton', 'after hydration the page shows the body, not a skeleton')
    }

    const hydrationWarnings = page.capture.consoleMessages
      .filter(item => HYDRATION_PATTERN.test(item.text) && !item.text.includes(CONSOLE_PROBE_MARKER))
    if (hydrationWarnings.length === 0) {
      reporter.pass('C3.no-vue-warnings', 'no Vue hydration warnings on the console')
    }
    else {
      reporter.fail('C3.no-vue-warnings', `${hydrationWarnings.length} Vue hydration warning(s)`,
        hydrationWarnings.slice(0, 5).map(item => `${item.level}: ${item.text.slice(0, 200)}`))
    }

    // Control for the console assertion: prove the collector is live. Without
    // this, "no warnings" is indistinguishable from "no listener attached".
    await evaluate(page, `console.warn('[Vue warn]: ${CONSOLE_PROBE_MARKER} synthetic probe')`)
    try {
      await pollFor(
        () => page.capture.consoleMessages.some(item => item.text.includes(CONSOLE_PROBE_MARKER)),
        { timeoutMs: 5000, label: 'console probe to be captured' },
      )
      reporter.pass('C3.control', 'a synthetic "[Vue warn]" message WAS captured by the same matcher')
    }
    catch {
      reporter.fail('C3.control', 'a synthetic "[Vue warn]" message was NOT captured', [
        'Console capture is dead; C3.no-vue-warnings proves nothing.',
      ])
    }

    reporter.info('C3.caveat', 'a production Vue build strips hydration warnings unless built with __VUE_PROD_HYDRATION_MISMATCH_DETAILS__', [
      'So C3.no-vue-warnings is weak evidence on a prod build; C3.body-survived is the load-bearing assertion.',
    ])

    const errors = page.capture.consoleMessages.filter(item => item.level === 'error')
    if (errors.length)
      reporter.info('C3.console-errors', `${errors.length} console error(s) during load`, errors.slice(0, 5).map(item => item.text.slice(0, 160)))
    if (page.capture.exceptions.length)
      reporter.info('C3.exceptions', `${page.capture.exceptions.length} uncaught exception(s)`, page.capture.exceptions.slice(0, 3))

    ctx.initialHeadings = hydrated.headings
  }
  finally {
    await page.close()
  }
}

async function pickNavigationTarget(page, ctx) {
  const links = await evaluate(page, LINK_PROBE)
  const candidates = links.inArticle.length ? links.inArticle : links.anywhere
  if (ctx.targetPath) {
    const match = candidates.find(item => item.href.replace(/\/$/, '') === ctx.targetPath.replace(/\/$/, ''))
    if (match)
      return match
    throw new Error(`--target-path=${ctx.targetPath} is not linked from ${ctx.docPath}; found ${candidates.length} other doc link(s)`)
  }
  if (!candidates.length)
    throw new Error('no in-page link to another doc was found; pass --target-path=<path>')
  // The pager sits at the end of the article, so the last link is the "next
  // chapter" — a real reader path, and it carries :prefetch="false".
  return candidates[candidates.length - 1]
}

async function spaNavigate(page, href) {
  await evaluate(page, `window.__ssgVerifySentinel = 1`)
  const beforeIndex = page.capture.requests.length
  const beforePath = await evaluate(page, `location.pathname`)
  const clicked = await evaluate(page, `(() => {
    const target = Array.from(document.querySelectorAll('a[href]'))
      .find(node => (node.getAttribute('href') || '') === ${JSON.stringify(href)})
    if (!target) return false
    target.click()
    return true
  })()`)
  if (!clicked)
    throw new Error(`could not find an anchor for ${href}`)
  await pollFor(
    async () => (await evaluate(page, `location.pathname`)) !== beforePath,
    { timeoutMs: 15000, label: `route to change away from ${beforePath}` },
  )
  return { beforeIndex, beforePath }
}

/** C4 — SPA navigation still lazy-loads the body. */
async function checkSpaNavigation(reporter, ctx) {
  const page = await openPage()
  try {
    await navigate(page, new URL(ctx.docPath, ctx.baseUrl).toString())
    await delay(ctx.settleMs)

    const target = await pickNavigationTarget(page, ctx)
    reporter.info('C4.target', `navigating in-page to ${target.href} ("${target.text}")`)

    const { beforeIndex } = await spaNavigate(page, target.href)

    const sentinel = await evaluate(page, `window.__ssgVerifySentinel`)
    if (sentinel === 1)
      reporter.pass('C4.spa-nav', 'the document was never reloaded — this was a client-side route change')
    else
      reporter.fail('C4.spa-nav', `the page did a full reload (sentinel=${JSON.stringify(sentinel)}), so this did not test SPA navigation`)

    let after = null
    try {
      after = await pollFor(
        async () => {
          const probe = await evaluate(page, DOM_PROBE)
          return probe.h2Count > 0 ? probe : null
        },
        { timeoutMs: 20000, label: 'the new doc body to render' },
      )
      reporter.pass('C4.body-rendered', `the new doc rendered ${after.h2Count} <h2> at ${after.pathname}`)
    }
    catch (error) {
      reporter.fail('C4.body-rendered', `the new doc body never rendered: ${error.message}`)
    }

    const navRequests = page.capture.requests.slice(beforeIndex).filter(item => isBodyApiUrl(item.url))
    if (navRequests.length > 0) {
      reporter.pass('C4.body-fetched', `${navRequests.length} ${BODY_API_PATHNAME} request(s) fired after the click`, [
        navRequests[0].url,
      ])
    }
    else {
      reporter.fail('C4.body-fetched', `no ${BODY_API_PATHNAME} request after the click — the split-body flow is gone`)
    }

    // Control: the same session already showed zero such requests on load (C1),
    // and the headings must differ, so this is the new body, not the old DOM.
    if (after && ctx.initialHeadings) {
      const identical = after.headings.length === ctx.initialHeadings.length
        && after.headings.every((text, index) => text === ctx.initialHeadings[index])
      if (identical) {
        reporter.fail('C4.control', 'the rendered headings are identical to the previous doc — the old body may still be on screen',
          [JSON.stringify(after.headings.slice(0, 5))])
      }
      else {
        reporter.pass('C4.control', 'the rendered headings differ from the previous doc (a real new body, not stale DOM)')
      }
    }
  }
  catch (error) {
    reporter.fail('C4.body-fetched', `SPA navigation check could not run: ${error.message}`)
  }
  finally {
    await page.close()
  }
}

/** C5 — the failure path. Exercises code that may not exist yet. */
async function checkFailurePath(reporter, ctx) {
  const page = await openPage()
  try {
    await navigate(page, new URL(ctx.docPath, ctx.baseUrl).toString())
    await delay(ctx.settleMs)

    const target = await pickNavigationTarget(page, ctx)
    // Block the BODY request only, not the metadata one. A client-side navigation asks for
    // `body=0` first and `body=1` afterwards; blocking both makes the metadata request fail,
    // which lands the page on its existing not-found state and never reaches the body-fetch
    // retry this check exists to exercise. That reads as "no error state" and is wrong.
    await page.setBlockedUrls([`*${BODY_API_PATHNAME}*body=1`, `*${BODY_API_PATHNAME}*body=1*`])
    reporter.info('C5.target', `blocking ${BODY_API_PATHNAME} body=1 only, then navigating to ${target.href}`)

    await spaNavigate(page, target.href)

    // Control: if nothing was actually blocked, whatever the page shows next is
    // not the failure path and any verdict about it is meaningless.
    let blocked = []
    try {
      blocked = await pollFor(
        () => {
          const hits = page.capture.failures.filter(item => isBodyApiUrl(item.url))
          return hits.length ? hits : null
        },
        { timeoutMs: 15000, label: 'a blocked body request' },
      )
      reporter.pass('C5.control', `${blocked.length} ${BODY_API_PATHNAME} request(s) were actually blocked`, [
        `${blocked[0].errorText || 'blocked'}${blocked[0].blockedReason ? ` (${blocked[0].blockedReason})` : ''}`,
      ])
    }
    catch {
      reporter.fail('C5.control', 'no body request was blocked — the failure path was never exercised', [
        'Either the page issued no body fetch at all, or Network.setBlockedURLs did not match.',
        'Nothing below this line is evidence about error handling.',
      ])
      return
    }

    const deadline = Date.now() + ctx.errorWaitMs
    let state = await evaluate(page, ERROR_PROBE)
    while (Date.now() < deadline && state.retry.length === 0 && state.h2Count === 0) {
      await delay(400)
      state = await evaluate(page, ERROR_PROBE)
    }

    if (state.retry.length > 0) {
      reporter.pass('C5.error-state', `an error state with a retry affordance appeared: "${state.retry[0].text || state.retry[0].aria}"`, [
        state.alerts.length ? `alert text: ${state.alerts[0]}` : 'no [role="alert"] container found',
      ])
      await page.setBlockedUrls([])
      const retryClicked = await evaluate(page, String.raw`(() => {
        const retryPattern = /retry|try again|reload|重试|重新加载|再试一次/i
        const scope = document.querySelector('.docs-surface') || document.body
        const node = Array.from(scope.querySelectorAll('button, [role="button"], [data-testid]'))
          .find(el => retryPattern.test((el.textContent || '').trim())
            || retryPattern.test(el.getAttribute('aria-label') || '')
            || /retry/i.test(el.getAttribute('data-testid') || ''))
        if (!node) return false
        node.click()
        return true
      })()`)
      if (!retryClicked) {
        reporter.fail('C5.retry-recovers', 'the retry control disappeared before it could be clicked')
      }
      else {
        try {
          const recovered = await pollFor(
            async () => {
              const probe = await evaluate(page, DOM_PROBE)
              return probe.h2Count > 0 ? probe : null
            },
            { timeoutMs: 20000, label: 'the body to render after retry' },
          )
          reporter.pass('C5.retry-recovers', `retry rendered the body (${recovered.h2Count} <h2>) once the API was reachable`)
        }
        catch (error) {
          reporter.fail('C5.retry-recovers', `retry did not recover: ${error.message}`)
        }
      }
    }
    else if (state.h2Count > 0) {
      reporter.fail('C5.error-state', 'the body rendered while the API was blocked — the failure path was not exercised', [
        'Most likely the record came from the client-side request cache; try a doc not visited in this session.',
      ])
    }
    else {
      reporter.pending('C5.error-state', 'no error state and no retry affordance — the page is stuck on the body skeleton', [
        `skeleton present: ${state.hasSkeleton}; rendered <h2>: ${state.h2Count}`,
        `waited ${ctx.errorWaitMs}ms after the fetch was blocked`,
        state.alerts.length ? `error-ish text found: ${state.alerts[0]}` : 'no error text found on the surface',
        'This is the R4 work (bounded retry + error state + retry button). Not implemented yet.',
      ])
      reporter.pending('C5.retry-recovers', 'not reachable until an error state with a retry control exists')
    }
  }
  catch (error) {
    reporter.fail('C5.error-state', `failure-path check could not run: ${error.message}`)
  }
  finally {
    await page.setBlockedUrls([]).catch(() => undefined)
    await page.close()
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    return 0
  }

  const reporter = createReporter()
  const ctx = {
    baseUrl: args.baseUrl.replace(/\/$/, ''),
    docPath: args.docPath,
    targetPath: args.targetPath,
    settleMs: args.settleMs,
    errorWaitMs: args.errorWaitMs,
    html: '',
    initialHeadings: null,
  }
  const wants = id => !args.only || args.only.has(id)

  console.log(`[harness] base url : ${ctx.baseUrl}`)
  console.log(`[harness] doc path : ${ctx.docPath}`)

  const chrome = await launchChrome({ port: args.port })
  console.log(`[harness] chrome   : ${chrome.version} (${chrome.binary})`)
  console.log('')

  try {
    if (!await preflight(reporter, ctx))
      return reporter.summary()

    let noJsProbe = null
    if (wants('C2'))
      noJsProbe = await checkBodyInHtml(reporter, ctx)
    if (wants('C1') || wants('C3'))
      await checkInitialLoad(reporter, ctx, noJsProbe)
    if (wants('C4'))
      await checkSpaNavigation(reporter, ctx)
    if (wants('C5'))
      await checkFailurePath(reporter, ctx)
  }
  finally {
    chrome.stop()
  }

  return reporter.summary()
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    console.error(`[harness] fatal: ${error?.stack || error?.message || error}`)
    process.exitCode = 1
  })
