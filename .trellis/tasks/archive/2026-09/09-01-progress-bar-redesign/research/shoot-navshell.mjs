// The NavigationShell demo keeps its TxProgressBar inside the second tab pane,
// so the generic sweep never sees it. Click the "发布" tab first, then shoot.
//   MODE=dark|light TUFFEX_CDP_URL=http://127.0.0.1:9228 node shoot-navshell.mjs
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeTarget, createClient, createTarget, delay, evaluate, setViewport, waitFor } from '/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/scripts/audit-cdp-client.mjs'

const MODE = process.env.MODE || 'dark'
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'after', MODE)
const target = await createTarget('about:blank')
const client = createClient(target.webSocketDebuggerUrl)
await client.send('Page.enable')
await client.send('Runtime.enable')
await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: MODE }] })
await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('nuxt-color-mode', '${MODE}') } catch {}` })
await setViewport(client, { width: 1280, height: 900, deviceScaleFactor: 2 })
await client.send('Page.navigate', { url: 'http://localhost:3200/zh/docs/dev/components/tabs' })
await waitFor(client, `document.readyState === 'complete' && document.querySelector('.tuff-demo__window')`, 60000)
await delay(1500)
await evaluate(client, MODE === 'dark' ? `document.documentElement.classList.add('dark')` : `document.documentElement.classList.remove('dark')`)

const windows = await evaluate(client, `document.querySelectorAll('.tuff-demo__window').length`)
for (let i = 0; i < windows; i++) {
  await evaluate(client, `document.querySelectorAll('.tuff-demo__window')[${i}]?.scrollIntoView({ block: 'center' })`)
  await delay(350)
}
await delay(1500)
const winExpr = `[...document.querySelectorAll('.tuff-demo__window')].find(w => w.querySelector('.navigation-shell-demo__panel'))`
const clicked = await evaluate(client, `(() => { const w = ${winExpr}; if (!w) return 'no window'; const tab = [...w.querySelectorAll('[role="tab"]')].find(t => t.textContent.includes('发布')); if (!tab) return 'no tab'; tab.click(); return 'clicked' })()`)
console.log('tab', clicked)
await delay(900)
const rect = await evaluate(client, `(() => { const w = ${winExpr}; w.scrollIntoView({ block: 'center' }); const r = w.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height } })()`)
await delay(400)
const rect2 = await evaluate(client, `(() => { const r = (${winExpr}).getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height } })()`)
const shot = await client.send('Page.captureScreenshot', { format: 'png', clip: { ...rect2, scale: 2 }, captureBeyondViewport: true })
writeFileSync(path.join(OUT, 'downstream-ComponentsNavigationShellDemo.png'), Buffer.from(shot.data, 'base64'))
const metrics = await evaluate(client, `(() => { const w = ${winExpr}; const b = w.querySelector('.tx-progress-bar-wrapper'); if (!b) return null; const track = b.querySelector('.tx-progress-bar__track'); const bar = b.querySelector('.tx-progress-bar'); const glow = b.querySelector('.tx-progress-bar__glow'); const acs = getComputedStyle(track, '::after'); return { cls: b.className, h: track.getBoundingClientRect().height, after: acs.content, mask: !!b.querySelector('.tx-progress-bar__mask'), barBg: getComputedStyle(bar).backgroundImage.slice(0, 70), glow: glow ? glow.classList.contains('is-visible') : null, text: b.textContent.trim() } })()`)
console.log('NAVSHELL', JSON.stringify(metrics))
client.close()
await closeTarget(target.id)
