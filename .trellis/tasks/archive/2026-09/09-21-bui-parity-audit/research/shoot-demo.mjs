// Clip-shoot a single demo block from a nexus docs page.
// Clip rects MUST be document coords + captureBeyondViewport (viewport-relative
// rects silently return a blank page-coloured PNG).
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  createTarget,
  closeTarget,
  createClient,
  setViewport,
  evaluate,
  delay,
} from '../../../../apps/nexus/scripts/audit-cdp-client.mjs'

const OUT = process.env.OUT_DIR || '/tmp/tuff-ref/ours'
const BASE = process.env.DOCS_URL || 'http://localhost:3200'
const slug = process.argv[2]
const selector = process.argv[3] || '.tuff-demo-wrapper'
const nth = Number(process.argv[4] || 0)

const { targetId, webSocketDebuggerUrl } = await createTarget('about:blank')
const client = createClient(webSocketDebuggerUrl)
await client.ready
await client.send('Page.enable', {})
await client.send('Runtime.enable', {})
await setViewport(client, { width: 1440, height: 1000, deviceScaleFactor: 2 })
await client.send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-color-scheme', value: 'light' }],
})
await client.send('Page.addScriptToEvaluateOnNewDocument', {
  source: `try{localStorage.setItem('nuxt-color-mode','light')}catch(e){}`,
})
await client.send('Page.navigate', { url: `${BASE}/zh/docs/dev/components/${slug}` })
await delay(14000)
await evaluate(client, `(async () => {
  const h = document.body.scrollHeight
  for (let y = 0; y < h + 2000; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)) }
  window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 600)); return h
})()`)
await delay(4000)

const rectJson = await evaluate(client, `(() => {
  const els = [...document.querySelectorAll(${JSON.stringify(selector)})]
  const el = els[${nth}]
  if (!el) return JSON.stringify({ error: 'not found', count: els.length })
  const r = el.getBoundingClientRect()
  return JSON.stringify({
    x: r.x + window.scrollX, y: r.y + window.scrollY,
    width: r.width, height: r.height, count: els.length,
  })
})()`)
const rect = JSON.parse(rectJson)
if (rect.error) {
  console.log(JSON.stringify(rect))
} else {
  const shot = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 2 },
  })
  const file = path.join(OUT, `${slug}-demo${nth}.png`)
  await fs.mkdir(OUT, { recursive: true })
  await fs.writeFile(file, Buffer.from(shot.data, 'base64'))
  console.log(JSON.stringify({ file, ...rect }))
}
client.close?.()
await closeTarget(targetId)
