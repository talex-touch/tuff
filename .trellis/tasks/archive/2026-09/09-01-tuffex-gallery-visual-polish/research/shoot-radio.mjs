import { writeFileSync, mkdirSync } from 'node:fs'
import { createTarget, closeTarget, createClient, evaluate, waitFor, delay, setViewport } from '/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/scripts/audit-cdp-client.mjs'

const MODE = process.env.MODE || 'dark'
const OUT = '/tmp/gallery-shots/' + MODE
mkdirSync(OUT, { recursive: true })
const URL = 'http://localhost:3200/zh/docs/dev/components'

const target = await createTarget('about:blank')
const client = createClient(target.webSocketDebuggerUrl)
await client.send('Page.enable')
await client.send('Runtime.enable')
await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: MODE }] })
await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('nuxt-color-mode', '${MODE}') } catch {}` })
await setViewport(client, { width: 1280, height: 900, deviceScaleFactor: 2 })
await client.send('Page.navigate', { url: URL })
await waitFor(client, `document.readyState === 'complete' && document.querySelector('.docs-gallery')`, 60000)
await delay(1500)
await evaluate(client, MODE === 'dark' ? `document.documentElement.classList.add('dark')` : `document.documentElement.classList.remove('dark')`)
await delay(600)

const cellSel = (label) => `[...document.querySelectorAll('.docs-gallery__cell')].find(c => c.querySelector('.docs-gallery__label')?.textContent.trim().startsWith('${label}'))`
const rectOf = (label) => evaluate(client, `(() => { const c = ${cellSel(label)}; c.scrollIntoView({block:'center'}); const r = c.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height } })()`)
async function shoot(label, name) {
  const r = await rectOf(label); await delay(400)
  const shot = await client.send('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 2 }, captureBeyondViewport: true })
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(shot.data, 'base64')); console.log('wrote', name)
}
await shoot('Radio', 'radio-rest')
const m = await evaluate(client, `(() => {
  const g = document.querySelector('.docs-gallery .tx-radio-group--button')
  const out = { cls: g.className, children: [] }
  for (const el of g.querySelectorAll(':scope > *')) {
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect()
    out.children.push({ cls: el.className, w: r.width, h: r.height, bg: cs.backgroundImage !== 'none' ? cs.backgroundImage.slice(0, 120) : cs.backgroundColor, border: cs.borderTopColor + ' ' + cs.borderTopWidth, shadow: cs.boxShadow, backdrop: cs.backdropFilter, opacity: cs.opacity, radius: cs.borderRadius, z: cs.zIndex, cursor: cs.cursor })
  }
  const gcs = getComputedStyle(g); const gr = g.getBoundingClientRect()
  out.group = { w: gr.width, h: gr.height, bg: gcs.backgroundColor, border: gcs.borderTopColor, radius: gcs.borderRadius, padding: gcs.padding }
  return out
})()`)
console.log(JSON.stringify(m, null, 1))
// hover the checked option, then press to see drag affordance
const hit = await evaluate(client, `(() => { const el = document.querySelector('.docs-gallery .tx-radio-group__indicator-hit'); const r = el.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 } })()`)
await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(hit.x), y: Math.round(hit.y) }); await delay(300)
await shoot('Radio', 'radio-hover')
await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(hit.x), y: Math.round(hit.y), button: 'left', clickCount: 1 }); await delay(80)
await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(hit.x) + 30, y: Math.round(hit.y), button: 'left' }); await delay(200)
await shoot('Radio', 'radio-drag')
await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(hit.x) + 30, y: Math.round(hit.y), button: 'left', clickCount: 1 })
client.close(); await closeTarget(target.id); console.log('done')
