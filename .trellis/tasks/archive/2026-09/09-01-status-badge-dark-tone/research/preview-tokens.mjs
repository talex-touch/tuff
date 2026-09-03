// Preview candidate dark tokens on the live gallery WITHOUT a tuffex build: the three
// semantic tokens are set inline on <html>, which outranks the `.dark` block, and every
// consumer reads the var, so the render is what the built token would produce.
//
//   TUFFEX_CDP_URL=http://127.0.0.1:9229 SUCCESS=#4ade80 WARNING=#fbbf24 DANGER=#f87171 OUT=preview-a node preview-tokens.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeTarget, createClient, createTarget, delay, evaluate, setViewport } from '/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/scripts/audit-cdp-client.mjs'

const MODE = 'dark'
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), process.env.OUT || 'preview', MODE)
mkdirSync(OUT, { recursive: true })
const URL = 'http://localhost:3200/zh/docs/dev/components'
const TOKENS = { success: process.env.SUCCESS, warning: process.env.WARNING, danger: process.env.DANGER }
const CELLS = (process.env.CELLS || 'StatusBadge,Badge,Tag,Alert,Button,Steps,TabBar,ToolConfirmation').split(',')

const target = await createTarget('about:blank')
const client = createClient(target.webSocketDebuggerUrl)
await client.send('Page.enable')
await client.send('Runtime.enable')
await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: MODE }] })
await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('nuxt-color-mode', '${MODE}') } catch {}` })
await setViewport(client, { width: 1280, height: 900, deviceScaleFactor: 2 })
await client.send('Page.navigate', { url: URL })
const start = Date.now()
while (Date.now() - start < 90000) {
  if (await evaluate(client, `Boolean(document.readyState === 'complete' && document.querySelector('.docs-gallery .tx-status-badge'))`))
    break
  await delay(250)
}
await delay(1500)
await evaluate(client, `document.documentElement.classList.add('dark')`)
for (const [name, value] of Object.entries(TOKENS)) {
  if (!value)
    continue
  const [r, g, b] = [1, 3, 5].map(i => Number.parseInt(value.slice(i, i + 2), 16))
  await evaluate(client, `document.documentElement.style.setProperty('--tx-color-${name}', '${value}'); document.documentElement.style.setProperty('--tx-color-${name}-rgb', '${r} ${g} ${b}')`)
}
await delay(600)
console.log('applied', JSON.stringify(TOKENS))

const cellSel = label => `[...document.querySelectorAll('.docs-gallery__cell')].find(c => (c.querySelector('.docs-gallery__label')?.textContent.trim() + ' ').startsWith('${label} '))`
for (const label of CELLS) {
  const found = await evaluate(client, `(() => { const c = ${cellSel(label)}; if (!c) return false; c.scrollIntoView({ block: 'center' }); return true })()`)
  if (!found) {
    console.log('cell not found', label)
    continue
  }
  await delay(500)
  const rect = await evaluate(client, `(() => { const c = ${cellSel(label)}; const r = c.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height } })()`)
  const shot = await client.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 2 }, captureBeyondViewport: true })
  writeFileSync(`${OUT}/${label}.png`, Buffer.from(shot.data, 'base64'))
  console.log('wrote', label)
}
client.close()
await closeTarget(target.id)
console.log('done', OUT)
