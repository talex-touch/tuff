// "After" shots for the progress-bar redesign. Run from anywhere with my own Chrome:
//   MODE=dark|light TUFFEX_CDP_URL=http://127.0.0.1:9228 node shoot-after.mjs
// Output: research/after/<MODE>/*.png + metrics.json (this file's directory).
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeTarget, createClient, createTarget, delay, evaluate, setViewport, waitFor } from '/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/scripts/audit-cdp-client.mjs'

const MODE = process.env.MODE || 'dark'
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'after', MODE)
mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:3200'
const metrics = {}

// Session cookie for /dashboard/storage — same recipe as scripts/dashboard-visual-audit.mjs.
const require = createRequire('/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/package.json')
const { encode } = require('next-auth/jwt')
const sessionToken = await encode({
  secret: process.env.AUTH_SECRET || 'tuff-dev-secret',
  maxAge: 2592000,
  token: { email: 'ui-audit-bot@local.test', name: 'UI Audit Bot' },
})

const target = await createTarget('about:blank')
const client = createClient(target.webSocketDebuggerUrl)
await client.send('Page.enable')
await client.send('Runtime.enable')
await client.send('Network.enable')
await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: MODE }] })
await client.send('Page.addScriptToEvaluateOnNewDocument', {
  source: `try { localStorage.setItem('nuxt-color-mode', '${MODE}') } catch {}`,
})
await setViewport(client, { width: 1280, height: 900, deviceScaleFactor: 2 })

async function open(url, readySel, timeout = 60000) {
  await client.send('Page.navigate', { url })
  await waitFor(client, `document.readyState === 'complete' && document.querySelector('${readySel}')`, timeout)
  await delay(1500)
  await evaluate(client, MODE === 'dark' ? `document.documentElement.classList.add('dark')` : `document.documentElement.classList.remove('dark')`)
  await delay(600)
}

async function rectOf(expr) {
  return await evaluate(client, `(() => { const c = ${expr}; if (!c) return null; c.scrollIntoView({block:'center'}); const r = c.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height } })()`)
}

async function shoot(expr, name, pad = 0) {
  let rect = await rectOf(expr)
  if (!rect) {
    console.log('not found', name)
    return null
  }
  await delay(400)
  rect = await rectOf(expr)
  const clip = { x: rect.x - pad, y: rect.y - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, scale: 2 }
  const shot = await client.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true })
  writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(shot.data, 'base64'))
  console.log('wrote', name, JSON.stringify(rect))
  return rect
}

const progressMetrics = scope => `(() => {
  const out = []
  for (const w of document.querySelectorAll(${JSON.stringify(scope)} + ' .tx-progress-bar-wrapper')) {
    const track = w.querySelector('.tx-progress-bar__track')
    const mask = w.querySelector('.tx-progress-bar__mask')
    const bar = w.querySelector('.tx-progress-bar')
    const glow = w.querySelector('.tx-progress-bar__glow')
    const head = w.querySelector('.tx-progress-bar__head')
    const tcs = getComputedStyle(track), acs = getComputedStyle(track, '::after'), bcs = getComputedStyle(bar)
    const gcs = glow ? getComputedStyle(glow) : null
    const r = track.getBoundingClientRect()
    const gr = glow ? glow.getBoundingClientRect() : null
    out.push({
      cls: w.className.replace(/tx-progress-bar-wrapper/g, 'W'),
      w: r.width, h: r.height,
      trackBg: tcs.backgroundColor,
      afterBorderW: acs.borderTopWidth, afterContent: acs.content,
      mask: mask ? getComputedStyle(mask).backgroundColor : null,
      barBg: bcs.backgroundImage !== 'none' ? bcs.backgroundImage : bcs.backgroundColor,
      barShadow: bcs.boxShadow, barTransition: bcs.transition,
      barW: bar.getBoundingClientRect().width,
      glow: glow ? { opacity: gcs.opacity, visible: glow.classList.contains('is-visible'), parent: glow.parentElement.className.split(' ')[0], cx: gr.left + gr.width / 2, tipX: r.left + bar.getBoundingClientRect().width, w: gr.width, h: gr.height } : null,
      head: head ? { text: head.textContent.trim(), labelColor: getComputedStyle(head.querySelector('.tx-progress-bar__head-label')).color, detailColor: head.querySelector('.tx-progress-bar__head-detail') ? getComputedStyle(head.querySelector('.tx-progress-bar__head-detail')).color : null } : null,
      text: w.textContent.trim().slice(0, 48),
    })
  }
  return out
})()`

// 1. Gallery cell
await open(`${BASE}/zh/docs/dev/components`, '.docs-gallery')
const cellSel = label => `[...document.querySelectorAll('.docs-gallery__cell')].find(c => c.querySelector('.docs-gallery__label')?.textContent.trim().startsWith('${label}'))`
await shoot(cellSel('ProgressBar'), 'gallery-progress-bar')
metrics.gallery = await evaluate(client, progressMetrics('.docs-gallery'))
console.log('GALLERY', JSON.stringify(metrics.gallery, null, 1))

// 2. progress-bar + progress docs pages: every demo window
for (const slug of ['progress-bar', 'progress']) {
  await open(`${BASE}/zh/docs/dev/components/${slug}`, '.tuff-demo__window')
  await delay(1500)
  const count = await evaluate(client, `document.querySelectorAll('.tuff-demo__window').length`)
  console.log(slug, 'demo windows', count)
  for (let i = 0; i < count; i++)
    await shoot(`document.querySelectorAll('.tuff-demo__window')[${i}]`, `${slug}-demo-${i}`)
  metrics[slug] = await evaluate(client, progressMetrics('.tuff-demo__window'))
  console.log(slug.toUpperCase(), JSON.stringify(metrics[slug], null, 1))
  metrics[`${slug}-headings`] = await evaluate(client, `[...document.querySelectorAll('h2, h3')].map(h => h.textContent.trim()).join(' | ')`)
  console.log(slug, 'headings:', metrics[`${slug}-headings`])

  if (slug === 'progress-bar') {
    // 2b. Upload demo mid-flight: the head row + glow while the fill is moving.
    const uploadWin = `[...document.querySelectorAll('.tuff-demo__window')].find(w => w.querySelector('.tx-progress-bar__head'))`
    await delay(2500)
    await shoot(uploadWin, 'progress-bar-upload-midflight')
    metrics.uploadMidflight = await evaluate(client, `(() => { const w = ${uploadWin}; const bar = w.querySelector('.tx-progress-bar'); const glow = w.querySelector('.tx-progress-bar__glow'); const t = w.querySelector('.tx-progress-bar__track').getBoundingClientRect(); const g = glow.getBoundingClientRect(); return { head: w.querySelector('.tx-progress-bar__head').textContent.trim(), aria: w.querySelector('[role=progressbar]').getAttribute('aria-label'), barW: bar.getBoundingClientRect().width, tipX: t.left + bar.getBoundingClientRect().width, glowCx: g.left + g.width / 2, glowOpacity: getComputedStyle(glow).opacity } })()`)
    console.log('UPLOAD', JSON.stringify(metrics.uploadMidflight))

    // 2c. The five indeterminate variants, driven on the stateful demo's loading bar.
    // Two samples 250ms apart: transform must move, left/width must not.
    const loadingBar = `document.querySelector('.tuff-demo__window .tx-progress-bar--indeterminate')`
    metrics.indeterminate = {}
    for (const variant of ['sweep', 'classic', 'bounce', 'elastic', 'split']) {
      await evaluate(client, `(() => { const b = ${loadingBar}; b.className = b.className.replace(/tx-progress-bar--indeterminate-\\S+/g, '').trim() + ' tx-progress-bar--indeterminate-${variant}' })()`)
      await delay(300)
      const sample = () => evaluate(client, `(() => { const b = ${loadingBar}; const cs = getComputedStyle(b, '::before'); return { transform: cs.transform, left: cs.left, width: cs.width, animation: cs.animationName, origin: cs.transformOrigin } })()`)
      const a = await sample()
      await delay(250)
      const b = await sample()
      metrics.indeterminate[variant] = { a, b, moved: a.transform !== b.transform, layoutStable: a.left === b.left && a.width === b.width }
      await shoot(`${loadingBar}.closest('.tuff-demo__window')`, `indeterminate-${variant}`)
    }
    console.log('INDETERMINATE', JSON.stringify(metrics.indeterminate, null, 1))
  }
}

// 3. Downstream nexus demos hosting TxProgressBar (one host page each).
// Demo windows mount lazily through an IntersectionObserver, so every window
// is scrolled into view first; otherwise the bar-bearing one is never found.
const downstream = [
  ['spinner', 'ComponentsFeedbackTaskCenterDemo'],
  ['tabs', 'ComponentsNavigationShellDemo'],
  ['tag-input', 'ComponentsReleasePolicyDemo'],
  ['index', 'ComponentsWorkflowPanelDemo'],
]
metrics.downstream = {}
for (const [slug, demo] of downstream) {
  const url = slug === 'index' ? `${BASE}/zh/docs/dev/components` : `${BASE}/zh/docs/dev/components/${slug}`
  await open(url, '.tuff-demo__window')
  const windows = await evaluate(client, `document.querySelectorAll('.tuff-demo__window').length`)
  for (let i = 0; i < windows; i++) {
    await evaluate(client, `document.querySelectorAll('.tuff-demo__window')[${i}]?.scrollIntoView({ block: 'center' })`)
    await delay(350)
  }
  await delay(1500)
  const win = `[...document.querySelectorAll('.tuff-demo__window')].find(w => w.querySelector('.tx-progress-bar-wrapper'))`
  await shoot(win, `downstream-${demo}`)
  metrics.downstream[demo] = await evaluate(client, progressMetrics('.tuff-demo__window'))
  console.log(demo, JSON.stringify(metrics.downstream[demo], null, 1))
}

// 4. /dashboard/storage with a minted session.
await client.send('Network.setCookie', { name: 'next-auth.session-token', value: sessionToken, domain: 'localhost', path: '/', httpOnly: true, secure: false })
await client.send('Page.navigate', { url: `${BASE}/dashboard/storage` })
await waitFor(client, `document.readyState === 'complete' && !!document.querySelector('#__nuxt')`, 60000)
await delay(4000)
await evaluate(client, MODE === 'dark' ? `document.documentElement.classList.add('dark')` : `document.documentElement.classList.remove('dark')`)
await delay(800)
{
  const shot = await client.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path.join(OUT, 'dashboard-storage-viewport.png'), Buffer.from(shot.data, 'base64'))
  const info = await evaluate(client, `({ url: location.href, bars: document.querySelectorAll('.tx-progress-bar-wrapper').length, text: document.body.innerText.slice(0, 160) })`)
  console.log('STORAGE', JSON.stringify(info))
  metrics.storage = info
  if (info.bars > 0) {
    const cards = await evaluate(client, `document.querySelectorAll('.StorageProgress').length`)
    for (let i = 0; i < cards; i++)
      await shoot(`document.querySelectorAll('.StorageProgress')[${i}]`, `dashboard-storage-progress-${i}`, 12)
    metrics.storageBars = await evaluate(client, progressMetrics('body'))
    console.log('STORAGE-METRICS', JSON.stringify(metrics.storageBars, null, 1))
  }
}

writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2))
client.close()
await closeTarget(target.id)
console.log('done', OUT)
