// Screenshot the ProgressBar surfaces before/after the redesign.
// Usage: MODE=dark|light STAGE=before|after TUFFEX_CDP_URL=http://127.0.0.1:9228 node shoot.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { createTarget, closeTarget, createClient, evaluate, waitFor, delay, setViewport } from '/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/scripts/audit-cdp-client.mjs'

const MODE = process.env.MODE || 'dark'
const STAGE = process.env.STAGE || 'before'
const OUT = `/tmp/progress-bar-shots/${STAGE}/${MODE}`
mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:3200'

const target = await createTarget('about:blank')
const client = createClient(target.webSocketDebuggerUrl)
await client.send('Page.enable')
await client.send('Runtime.enable')
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
  if (!rect) { console.log('not found', name); return null }
  await delay(400)
  rect = await rectOf(expr)
  const clip = { x: rect.x - pad, y: rect.y - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, scale: 2 }
  const shot = await client.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true })
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(shot.data, 'base64'))
  console.log('wrote', `${OUT}/${name}.png`, JSON.stringify(rect))
  return rect
}

const progressMetrics = `(() => {
  const out = []
  for (const w of document.querySelectorAll(SCOPE + ' .tx-progress-bar-wrapper')) {
    const track = w.querySelector('.tx-progress-bar__track')
    const mask = w.querySelector('.tx-progress-bar__mask')
    const bar = w.querySelector('.tx-progress-bar')
    const glow = w.querySelector('.tx-progress-bar__glow')
    const head = w.querySelector('.tx-progress-bar__head')
    const tcs = getComputedStyle(track), acs = getComputedStyle(track, '::after'), bcs = getComputedStyle(bar)
    const mcs = mask ? getComputedStyle(mask) : null
    const gcs = glow ? getComputedStyle(glow) : null
    const r = track.getBoundingClientRect()
    out.push({ cls: w.className.replace(/tx-progress-bar-wrapper/g, 'W'), w: r.width, h: r.height, trackBg: tcs.backgroundColor, afterBorderW: acs.borderTopWidth, afterBorder: acs.borderTopColor, mask: mask ? { bg: mcs.backgroundColor, backdrop: mcs.backdropFilter } : null, barBg: bcs.backgroundImage !== 'none' ? bcs.backgroundImage : bcs.backgroundColor, barShadow: bcs.boxShadow, barTransition: bcs.transition, barW: bar.getBoundingClientRect().width, glow: glow ? { opacity: gcs.opacity, left: gcs.left, parent: glow.parentElement.className.split(' ')[0], w: glow.getBoundingClientRect().width } : null, head: head ? head.textContent.trim() : null, text: w.textContent.trim().slice(0, 40) })
  }
  return out
})()`

// 1. Gallery cell
await open(`${BASE}/zh/docs/dev/components`, '.docs-gallery')
const cellSel = (label) => `[...document.querySelectorAll('.docs-gallery__cell')].find(c => c.querySelector('.docs-gallery__label')?.textContent.trim().startsWith('${label}'))`
await shoot(cellSel('ProgressBar'), 'gallery-progress-bar')
console.log('GALLERY', JSON.stringify(await evaluate(client, progressMetrics.replace('SCOPE', `'.docs-gallery'`)), null, 1))

// 2. progress-bar docs page: every demo window
for (const slug of ['progress-bar', 'progress']) {
  await open(`${BASE}/zh/docs/dev/components/${slug}`, '.tuff-demo__window')
  await delay(1200)
  const count = await evaluate(client, `document.querySelectorAll('.tuff-demo__window').length`)
  console.log(slug, 'demo windows', count)
  for (let i = 0; i < count; i++)
    await shoot(`document.querySelectorAll('.tuff-demo__window')[${i}]`, `${slug}-demo-${i}`)
  console.log(slug.toUpperCase(), JSON.stringify(await evaluate(client, progressMetrics.replace('SCOPE', `'.tuff-demo__window'`)), null, 1))
  const headings = await evaluate(client, `[...document.querySelectorAll('h2, h3')].map(h => h.textContent.trim()).join(' | ')`)
  console.log(slug, 'headings:', headings)
}

// 3. dashboard storage
await client.send('Page.navigate', { url: `${BASE}/dashboard/storage` })
await waitFor(client, `document.readyState === 'complete'`, 60000)
await delay(4000)
await evaluate(client, MODE === 'dark' ? `document.documentElement.classList.add('dark')` : `document.documentElement.classList.remove('dark')`)
await delay(600)
{
  const shot = await client.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${OUT}/dashboard-storage-viewport.png`, Buffer.from(shot.data, 'base64'))
  const info = await evaluate(client, `({ url: location.href, title: document.title, bars: document.querySelectorAll('.tx-progress-bar-wrapper').length, text: document.body.innerText.slice(0, 200) })`)
  console.log('STORAGE', JSON.stringify(info))
  if (info.bars > 0) {
    await shoot(`document.querySelector('.StorageProgress')?.closest('section, .card, article, div')`, 'dashboard-storage-card', 8)
    console.log('STORAGE-METRICS', JSON.stringify(await evaluate(client, progressMetrics.replace('SCOPE', `'body'`)), null, 1))
  }
}

client.close()
await closeTarget(target.id)
console.log('done')
