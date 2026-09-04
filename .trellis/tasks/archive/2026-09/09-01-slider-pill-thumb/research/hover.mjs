// Retake the dark hover cell shot: the first capture came back as a solid-colour PNG (9 KB).
process.env.TUFFEX_CDP_URL ||= 'http://127.0.0.1:9227'
import { writeFileSync, statSync } from 'node:fs'
const { createTarget, closeTarget, createClient, evaluate, waitFor, delay, setViewport } = await import('/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/scripts/audit-cdp-client.mjs')
const MODE = process.env.MODE || 'dark'
const OUT = `/tmp/slider-pill/shots/after/${MODE}/slider-hover.png`
const target = await createTarget('about:blank')
const client = createClient(target.webSocketDebuggerUrl)
const watchdog = setTimeout(() => { console.log('WATCHDOG'); process.exit(2) }, 150000)
const cell = `[...document.querySelectorAll('.docs-gallery__cell')].find(c => c.querySelector('.docs-gallery__label')?.textContent.trim().startsWith('Slider'))`
try {
  await client.send('Page.enable'); await client.send('Runtime.enable')
  await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: MODE }] })
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('nuxt-color-mode', '${MODE}') } catch {}` })
  await setViewport(client, { width: 1280, height: 900, deviceScaleFactor: 2 })
  await client.send('Page.navigate', { url: 'http://localhost:3200/zh/docs/dev/components' })
  await waitFor(client, `document.readyState === 'complete' && document.querySelector('.docs-gallery .tx-slider__surface')`, 90000)
  await delay(1500)
  await evaluate(client, MODE === 'dark' ? `document.documentElement.classList.add('dark')` : `document.documentElement.classList.remove('dark')`)
  await delay(800)
  await evaluate(client, `${cell}.scrollIntoView({ block: 'center' })`)
  await delay(600)
  for (let attempt = 1; attempt <= 3; attempt++) {
    const p = await evaluate(client, `(() => { const r = document.querySelector('.docs-gallery .tx-slider__surface').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(p.x), y: Math.round(p.y) })
    await delay(700)
    const m = await evaluate(client, `(() => { const s = document.querySelector('.docs-gallery .tx-slider'); const surf = s.querySelector('.tx-slider__surface'); const cs = getComputedStyle(surf); const r = surf.getBoundingClientRect(); return { cls: s.className, w: r.width, h: r.height, shadow: cs.boxShadow, backdrop: cs.backdropFilter } })()`)
    const rect = await evaluate(client, `(() => { const r = ${cell}.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height } })()`)
    const shot = await client.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 2 }, captureBeyondViewport: true })
    writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
    const size = statSync(OUT).size
    console.log('HOVER attempt', attempt, 'bytes', size, JSON.stringify(m))
    if (size > 20000) break
    await delay(1000)
  }
} finally { clearTimeout(watchdog); client.close(); await closeTarget(target.id) }
console.log('done')
