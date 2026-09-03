// Downstream spot-check: screenshot every TxStatusBadge on three nexus pages in dark mode
// and dump their computed styles, so the component change is verified on real callers
// rather than only in the gallery.
//
//   TUFFEX_CDP_URL=http://127.0.0.1:9229 node shoot-downstream.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeTarget, createClient, createTarget, delay, evaluate, setViewport } from '/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/scripts/audit-cdp-client.mjs'

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'after', 'downstream')
mkdirSync(OUT, { recursive: true })
const PAGES = (process.env.PAGES || '/zh/store,/zh/dashboard/devices,/zh/dashboard/storage').split(',')

for (const route of PAGES) {
  const name = route.replace(/^\/zh\//, '').replace(/\//g, '-') || 'root'
  const target = await createTarget('about:blank')
  const client = createClient(target.webSocketDebuggerUrl)
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('nuxt-color-mode', 'dark') } catch {}` })
  await setViewport(client, { width: 1280, height: 900, deviceScaleFactor: 2 })
  await client.send('Page.navigate', { url: `http://localhost:3200${route}` })
  const start = Date.now()
  while (Date.now() - start < 45000) {
    if (await evaluate(client, `Boolean(document.readyState === 'complete')`))
      break
    await delay(250)
  }
  // Give client-side data fetches a chance to land.
  for (let i = 0; i < 24; i++) {
    if (await evaluate(client, `Boolean(document.querySelector('.tx-status-badge'))`))
      break
    await delay(500)
  }
  await evaluate(client, `document.documentElement.classList.add('dark')`)
  await delay(800)
  const info = await evaluate(client, `(() => {
    const badges = [...document.querySelectorAll('.tx-status-badge')].map((el) => {
      const cs = getComputedStyle(el)
      const icon = el.querySelector('.tx-status-badge__icon')
      const r = el.getBoundingClientRect()
      return { text: el.textContent.trim().slice(0, 30), color: cs.color, radius: cs.borderRadius, weight: cs.fontWeight, padding: cs.padding, icon: icon && icon.className, iconW: icon && +icon.getBoundingClientRect().width.toFixed(2), h: +r.height.toFixed(2), visible: r.width > 0 && r.height > 0 }
    })
    return { url: location.href, title: document.title, badges, htmlClass: document.documentElement.className }
  })()`)
  console.log(name, JSON.stringify(info, null, 1))
  const first = await evaluate(client, `(() => { const el = [...document.querySelectorAll('.tx-status-badge')].find(e => e.getBoundingClientRect().width > 0); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: Math.max(0, r.left + window.scrollX - 160), y: Math.max(0, r.top + window.scrollY - 60), width: Math.min(640, r.width + 320), height: r.height + 120 } })()`)
  await delay(400)
  if (first) {
    const rect = await evaluate(client, `(() => { const el = [...document.querySelectorAll('.tx-status-badge')].find(e => e.getBoundingClientRect().width > 0); const r = el.getBoundingClientRect(); return { x: Math.max(0, r.left + window.scrollX - 160), y: Math.max(0, r.top + window.scrollY - 60), width: Math.min(640, r.width + 320), height: r.height + 120 } })()`)
    const shot = await client.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 2 }, captureBeyondViewport: true })
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(shot.data, 'base64'))
    console.log('wrote', name)
  }
  else {
    const shot = await client.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(`${OUT}/${name}-viewport.png`, Buffer.from(shot.data, 'base64'))
    console.log('no badge on', name, '- wrote viewport')
  }
  client.close()
  await closeTarget(target.id)
}
console.log('done', OUT)
