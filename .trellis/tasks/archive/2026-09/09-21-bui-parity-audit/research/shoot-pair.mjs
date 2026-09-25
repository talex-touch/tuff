// Shoot a tight crop of one component, from either side of the comparison,
// through the SAME headless browser / viewport / DPR so the two PNGs are
// actually comparable. Anything measured across two different browsers (or with
// the user's extension-loaded profile) is not evidence.
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  createTarget, closeTarget, createClient, setViewport, evaluate, delay,
} from '../../../../apps/nexus/scripts/audit-cdp-client.mjs'

const OUT = process.env.OUT_DIR || '/tmp/tuff-ref/pairs'
const [side, key, url, selector, nthRaw] = process.argv.slice(2)
const nth = Number(nthRaw || 0)

const { targetId, webSocketDebuggerUrl } = await createTarget('about:blank')
const client = createClient(webSocketDebuggerUrl)
await client.ready
await client.send('Page.enable', {})
await client.send('Runtime.enable', {})
await setViewport(client, { width: 980, height: 760, deviceScaleFactor: 2 })
await client.send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-color-scheme', value: 'light' }],
})
await client.send('Page.addScriptToEvaluateOnNewDocument', {
  source: `try{localStorage.setItem('nuxt-color-mode','light')}catch(e){}`,
})
await client.send('Page.navigate', { url })
await delay(url.includes('localhost') ? 13000 : 6000)

// Force BOTH sides light. nexus reads `nuxt-color-mode`; beautifului.dev puts a
// bare `dark` class on <html> and ignores prefers-color-scheme, so a crop taken
// without this step compares our light theme against their dark one.
await evaluate(client, `(() => {
  document.documentElement.classList.remove('dark')
  document.documentElement.classList.add('light')
  return document.documentElement.className
})()`)
await delay(600)

// Lazy-mounted demos only appear once scrolled into view.
await evaluate(client, `(async () => {
  const h = document.body.scrollHeight
  for (let y = 0; y < h + 1500; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 110)) }
  window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 500)); return h
})()`)
await delay(3500)

const rectJson = await evaluate(client, `(() => {
  const els = [...document.querySelectorAll(${JSON.stringify(selector)})]
  const el = els[${nth}]
  if (!el) return JSON.stringify({ error: 'not found', count: els.length })
  el.scrollIntoView({ block: 'center', behavior: 'instant' })
  const r = el.getBoundingClientRect()
  return JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height), count: els.length })
})()`)
const rect = JSON.parse(rectJson)
if (rect.error) {
  console.log(JSON.stringify({ side, key, ...rect }))
} else {
  await delay(1200)
  // Full-viewport capture, NOT `clip` + `captureBeyondViewport`. That pair
  // renders the region in tiles and stitches them, and an unfinished tile comes
  // back as a washed-out band with a hard horizontal seam — which reads exactly
  // like a real opacity bug. Verified against the DOM: identical computed
  // opacity/filter/mask on both sides of the seam, and the band disappears in an
  // unclipped shot of the same frame. The element is parked mid-viewport instead,
  // so the surrounding page is context rather than noise.
  const shot = await client.send('Page.captureScreenshot', { format: 'png' })
  await fs.mkdir(OUT, { recursive: true })
  const file = path.join(OUT, `${key}--${side}.png`)
  await fs.writeFile(file, Buffer.from(shot.data, 'base64'))
  console.log(JSON.stringify({ side, key, file, w: rect.w, h: rect.h }))
}
client.close?.()
await closeTarget(targetId)
