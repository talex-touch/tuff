/**
 * One-off diagnostic: dump what the docs page actually shows when the body fetch is
 * blocked. Written because C5 reported "no error state" while the retry loop was
 * provably running (4 blocked requests), which means the verdict and the DOM disagreed
 * and only the DOM can say which.
 */
import process from 'node:process'
import { delay, evaluate, launchChrome, navigate, openPage } from './cdp-harness.mjs'

const BASE = process.env.NEXUS_VERIFY_URL || 'http://127.0.0.1:8788'
const START = '/en/docs/dev/components/button/'
const TARGET = '/en/docs/dev/components/card-item'

const DUMP = String.raw`(() => {
  const root = document.querySelector('.docs-root') || document.body
  const state = document.querySelector('.docs-state')
  return {
    url: location.pathname,
    docsStateChildren: state
      ? Array.from(state.children).map(n => n.className || n.tagName)
      : null,
    hasBodyError: Boolean(document.querySelector('.docs-body-error')),
    hasSkeleton: Boolean(document.querySelector('.docs-prose-skeleton')),
    hasProse: Boolean(document.querySelector('.docs-prose:not(.docs-prose-skeleton)')),
    h2: document.querySelectorAll('h2').length,
    alerts: Array.from(document.querySelectorAll('[role="alert"]')).map(n => (n.textContent || '').trim().slice(0, 120)),
    buttons: Array.from(document.querySelectorAll('button')).map(n => (n.textContent || '').trim().slice(0, 40)).filter(Boolean).slice(0, 12),
    text: (root.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400),
  }
})()`

const chrome = await launchChrome({ port: Number(process.env.NEXUS_VERIFY_CDP_PORT || 9488) })
try {
  const page = await openPage()
  await navigate(page, new URL(START, BASE).toString())
  await delay(4000)

  await page.setBlockedUrls(['*/api/docs/page*body=1', '*/api/docs/page*body=1*'])

  // Does the block pattern over-match? If the metadata request (body=0) is also being
  // blocked, the page never gets a doc record and lands on not-found, which would explain
  // a missing error state without any bug in the page.
  const blockCheck = await evaluate(page, `(async () => {
    const probe = async (body) => {
      try {
        const r = await fetch('/api/docs/page?path=%2Fdocs%2Fdev%2Fcomponents%2Fcard-item&locale=en&body=' + body)
        return 'status ' + r.status
      }
      catch (e) { return 'REJECTED: ' + String(e).slice(0, 60) }
    }
    return { body0: await probe('0'), body1: await probe('1') }
  })()`)
  console.log('block-pattern check:', JSON.stringify(blockCheck))
  await evaluate(page, `(() => {
    const a = Array.from(document.querySelectorAll('a[href]'))
      .find(el => el.getAttribute('href') === '${TARGET}' || el.getAttribute('href') === '${TARGET}/')
    if (a) { a.click(); return true }
    return false
  })()`)

  for (const at of [1000, 3000, 5000, 8000, 12000, 16000]) {
    await delay(at === 1000 ? 1000 : 2000)
    const dump = await evaluate(page, DUMP)
    console.log(`\n--- t≈${at}ms`)
    console.log(JSON.stringify(dump, null, 2))
  }
}
finally {
  if (typeof chrome?.kill === "function") chrome.kill()
}
