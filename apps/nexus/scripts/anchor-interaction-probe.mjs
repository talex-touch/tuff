// Interactive smoothness probe for the anchor family: on each page, click
// popup triggers inside demos, measure frame deltas while the panel animates
// open, verify a floating panel actually appears, then dismiss with Escape.
//
// The scroll sweep (component-docs-smoothness-audit.mjs) proves demos mount
// and scrolling is clean; this probe covers what scrolling cannot — the
// open/close choreography the anchor motion spec cares about. Run it
// serially, after the sweep, so two measurements do not fight for CPU.
//
// Usage:
//   TUFFEX_CDP_URL=http://127.0.0.1:9226 node scripts/anchor-interaction-probe.mjs

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
  closeTarget,
  createClient,
  createTarget,
  delay,
  evaluate,
  repoRoot,
  setViewport,
  waitFor,
} from './audit-cdp-client.mjs'

const nexusBaseUrl = (process.env.NEXUS_SMOOTHNESS_URL || 'http://localhost:3200').replace(/\/$/, '')
const locale = process.env.NEXUS_SMOOTHNESS_LOCALE || 'zh'
const reportDir = path.resolve(repoRoot, process.env.NEXUS_PROBE_OUT || 'output/playwright/anchor-interaction')

const PAGES = [
  'base-anchor',
  'popover',
  'dropdown-menu',
  'context-menu',
  'tooltip',
  'select',
  'flat-dropdown',
  'flat-select',
  'date-picker',
  'cascader',
  'tree-select',
]

// Clickable popup triggers inside demo previews only — never the page chrome.
const FIND_TRIGGERS = `(() => {
  const scope = [...document.querySelectorAll('.tuff-demo__preview')]
  const found = []
  for (const preview of scope) {
    const candidates = preview.querySelectorAll('[aria-haspopup], .tx-button, button')
    for (const el of candidates) {
      const rect = el.getBoundingClientRect()
      if (rect.width < 8 || rect.height < 8)
        continue
      found.push(found.length)
      el.setAttribute('data-probe-index', String(found.length - 1))
      if (found.length >= 8)
        return JSON.stringify(found.length)
    }
  }
  return JSON.stringify(found.length)
})()`

function clickAndMeasure(index) {
  return `(async () => {
    const el = document.querySelector('[data-probe-index="${index}"]')
    if (!el)
      return JSON.stringify({ skipped: true })
    el.scrollIntoView({ block: 'center' })
    await new Promise(r => setTimeout(r, 250))
    const before = document.querySelectorAll('.tx-base-anchor, [data-tx-context-menu-layer]').length
    const frames = []
    let last = performance.now()
    let running = true
    const tick = (now) => { frames.push(now - last); last = now; if (running) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
    el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
    el.click()
    await new Promise(r => setTimeout(r, 650))
    running = false
    const after = document.querySelectorAll('.tx-base-anchor, [data-tx-context-menu-layer]').length
    const opened = after > before
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    document.body.click()
    await new Promise(r => setTimeout(r, 350))
    const meaningful = frames.slice(2)
    return JSON.stringify({
      opened,
      frames: meaningful.length,
      dropped: meaningful.filter(ms => ms > 34).length,
      worstMs: Math.round(meaningful.reduce((m, v) => Math.max(m, v), 0)),
    })
  })()`
}

async function main() {
  await mkdir(reportDir, { recursive: true })
  const target = await createTarget('about:blank')
  const client = createClient(target.webSocketDebuggerUrl)
  await client.ready
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await setViewport(client, { width: 1440, height: 900 })

  const results = []
  for (const slug of PAGES) {
    const url = `${nexusBaseUrl}/${locale}/docs/dev/components/${slug}`
    // Page.navigate, not a location.href evaluate — see the sweep script.
    await client.send('Page.navigate', { url })
    await waitFor(client, 'document.querySelectorAll("section.tuff-demo").length > 0', 45000).catch(() => undefined)
    await delay(1500)
    // Activate lazy demos near the top; triggers below the fold scrollIntoView on demand.
    const triggerCount = JSON.parse((await evaluate(client, FIND_TRIGGERS)) ?? '0')
    const interactions = []
    for (let i = 0; i < triggerCount; i++) {
      // evaluate() sets awaitPromise, so the async IIFE resolves to its JSON string.
      const raw = await evaluate(client, clickAndMeasure(i)).catch(() => undefined)
      let parsed
      try {
        parsed = typeof raw === 'string' ? JSON.parse(raw) : null
      }
      catch {
        parsed = null
      }
      if (parsed && !parsed.skipped)
        interactions.push(parsed)
    }
    const openedCount = interactions.filter(entry => entry.opened).length
    const droppedTotal = interactions.reduce((sum, entry) => sum + entry.dropped, 0)
    const worst = interactions.reduce((max, entry) => Math.max(max, entry.worstMs), 0)
    results.push({ slug, triggers: triggerCount, interactions: interactions.length, openedCount, droppedTotal, worstMs: worst, detail: interactions })
    console.log(`${slug}: ${interactions.length} interactions, ${openedCount} opened a panel, dropped ${droppedTotal}, worst ${worst}ms`)
  }

  await client.close?.()
  await closeTarget(target.id)
  const reportPath = path.join(reportDir, 'anchor-interaction-report.json')
  await writeFile(reportPath, `${JSON.stringify({ results }, null, 2)}\n`)
  console.log(`report: ${reportPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
