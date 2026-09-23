// BUI parity audit probe — screenshots + demo-mount census for nexus docs pages.
// Honours the two known traps: TuffDemoWrapper mounts on intersection (must scroll
// the whole page first), and a clipped capture needs document coords.
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
const DARK = process.env.DARK === '1'

async function shoot(slug) {
  const url = `${BASE}/zh/docs/dev/components/${slug}`
  const { targetId, webSocketDebuggerUrl } = await createTarget('about:blank')
  const client = createClient(webSocketDebuggerUrl)
  await client.ready
  try {
    await client.send('Page.enable', {})
    await client.send('Runtime.enable', {})
    await setViewport(client, { width: 1440, height: 1000, deviceScaleFactor: 2 })
    if (!DARK) {
      await client.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: 'light' }],
      })
      await client.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `try{localStorage.setItem('nuxt-color-mode','light')}catch(e){}`,
      })
    }
    await client.send('Page.navigate', { url })
    await delay(14000)

    // Lazy demos: walk the whole page so every TuffDemoWrapper intersects.
    await evaluate(client, `(async () => {
      const h = document.body.scrollHeight
      for (let y = 0; y < h + 2000; y += 600) {
        window.scrollTo(0, y)
        await new Promise(r => setTimeout(r, 120))
      }
      window.scrollTo(0, 0)
      await new Promise(r => setTimeout(r, 600))
      return h
    })()`)
    await delay(4000)

    const census = await evaluate(client, `(() => {
      const txt = document.body.innerText || ''
      const pending = (txt.match(/示例加载中/g) || []).length
      const wrappers = document.querySelectorAll('[class*="demo-wrapper"], .tuff-demo-wrapper').length
      const tx = document.querySelectorAll('[class^="tx-"], [class*=" tx-"]').length
      const bui = document.querySelectorAll('[class*="tx-bui-"]').length
      return JSON.stringify({ pending, wrappers, tx, bui, len: txt.length })
    })()`)

    const full = await client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    })
    await fs.writeFile(path.join(OUT, `${slug}.png`), Buffer.from(full.data, 'base64'))
    return { slug, census: JSON.parse(census) }
  } finally {
    client.close?.()
    await closeTarget(targetId)
  }
}

const slugs = process.argv.slice(2)
await fs.mkdir(OUT, { recursive: true })
for (const slug of slugs) {
  try {
    const r = await shoot(slug)
    console.log(JSON.stringify(r))
  } catch (err) {
    console.log(JSON.stringify({ slug, error: String(err).slice(0, 200) }))
  }
}
