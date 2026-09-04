// Screenshot every demo window on a set of docs pages in dark mode, optionally clicking a
// button first (to fire toasts etc.), and dump the page's rendered text so `.mdc` edits can
// be verified against what the reader sees rather than the SSR payload.
//
//   TUFFEX_CDP_URL=http://127.0.0.1:9229 SLUGS="toast,select" node shoot-docs.mjs
//   CLICK="确认"   click the first button whose text matches before shooting (per page)
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeTarget, createClient, createTarget, delay, evaluate, setViewport } from '/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/scripts/audit-cdp-client.mjs'

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), process.env.OUT || 'after', 'docs')
mkdirSync(OUT, { recursive: true })
const SLUGS = (process.env.SLUGS || 'toast').split(',').map(s => s.trim()).filter(Boolean)
const LOCALE = process.env.LOCALE || 'zh'
const CLICK = process.env.CLICK || ''
const MAX = Number(process.env.MAX || 6)

for (const slug of SLUGS) {
  const target = await createTarget('about:blank')
  const client = createClient(target.webSocketDebuggerUrl)
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('nuxt-color-mode', 'dark'); localStorage.setItem('tuff-locale', '${LOCALE}') } catch {}` })
  await setViewport(client, { width: 1280, height: 900, deviceScaleFactor: 2 })
  await client.send('Page.navigate', { url: `http://localhost:3200/${LOCALE}/docs/dev/components/${slug}` })
  const start = Date.now()
  while (Date.now() - start < 60000) {
    if (await evaluate(client, `Boolean(document.readyState === 'complete' && document.querySelector('.tuff-demo__window'))`))
      break
    await delay(300)
  }
  await delay(1500)
  await evaluate(client, `document.documentElement.classList.add('dark')`)
  await delay(600)
  if (CLICK) {
    const clicked = await evaluate(client, `(() => { const b = [...document.querySelectorAll('.tuff-demo__window button')].find(b => b.textContent.trim().includes(${JSON.stringify(CLICK)})); if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true })()`)
    console.log(slug, 'click', JSON.stringify(CLICK), clicked)
    await delay(900)
  }
  const count = await evaluate(client, `document.querySelectorAll('.tuff-demo__window').length`)
  console.log(slug, 'demo windows:', count, 'title:', await evaluate(client, `document.title`))
  for (let i = 0; i < Math.min(count, MAX); i++) {
    await evaluate(client, `document.querySelectorAll('.tuff-demo__window')[${i}].scrollIntoView({ block: 'center' })`)
    await delay(500)
    const rect = await evaluate(client, `(() => { const r = document.querySelectorAll('.tuff-demo__window')[${i}].getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: Math.min(r.height, 900) } })()`)
    const shot = await client.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 2 }, captureBeyondViewport: true })
    writeFileSync(`${OUT}/${slug}-${i}.png`, Buffer.from(shot.data, 'base64'))
  }
  if (CLICK) {
    // Toasts live in a fixed host; grab the viewport as well.
    const shot = await client.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(`${OUT}/${slug}-viewport.png`, Buffer.from(shot.data, 'base64'))
  }
  const text = await evaluate(client, `(document.querySelector('.docs-body, article, main') || document.body).innerText`)
  writeFileSync(`${OUT}/${slug}.txt`, text)
  client.close()
  await closeTarget(target.id)
}
console.log('done', OUT)
