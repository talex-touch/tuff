// Walk the five slider demos on /docs/dev/components/slider. Demos mount lazily, so scroll the
// whole page first and wait for the count to settle instead of demanding five up front.
process.env.TUFFEX_CDP_URL ||= 'http://127.0.0.1:9227'
import { mkdirSync, writeFileSync } from 'node:fs'
const { createTarget, closeTarget, createClient, evaluate, waitFor, delay, setViewport } = await import('/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/scripts/audit-cdp-client.mjs')
const MODE = process.env.MODE || 'dark'
const OUT = `/tmp/slider-pill/shots/after/${MODE}/demos`
mkdirSync(OUT, { recursive: true })
const target = await createTarget('about:blank')
const client = createClient(target.webSocketDebuggerUrl)
const watchdog = setTimeout(() => { console.log('WATCHDOG'); process.exit(2) }, 280000)
const sliderAt = i => `document.querySelectorAll('.tx-slider')[${i}]`
const boxOf = i => `(() => { const s = ${sliderAt(i)}; return s.closest('.tuff-demo, .tuff-demo-wrapper, [class*="demo-wrapper"], [class*="DemoWrapper"]') || s.parentElement.parentElement })()`
async function shootBox(i, name) {
  await evaluate(client, `${boxOf(i)}.scrollIntoView({ block: 'center' })`)
  await delay(500)
  const r = await evaluate(client, `(() => { const b = ${boxOf(i)}; const r = b.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: Math.min(r.height, 700), cls: b.className.slice(0, 60) } })()`)
  const { cls, ...clip } = r
  const shot = await client.send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 2 }, captureBeyondViewport: true })
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(shot.data, 'base64'))
  console.log('wrote', name, JSON.stringify({ cls, w: clip.width, h: clip.height }))
}
try {
  await client.send('Page.enable'); await client.send('Runtime.enable')
  await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: MODE }] })
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('nuxt-color-mode', '${MODE}') } catch {}` })
  await setViewport(client, { width: 1280, height: 900, deviceScaleFactor: 2 })
  await client.send('Page.navigate', { url: 'http://localhost:3200/zh/docs/dev/components/slider' })
  await waitFor(client, `document.readyState === 'complete' && document.querySelector('.tx-slider')`, 120000)
  await delay(1500)
  await evaluate(client, MODE === 'dark' ? `document.documentElement.classList.add('dark')` : `document.documentElement.classList.remove('dark')`)
  // Progressive scroll so every lazy demo gets a chance to mount.
  const height = await evaluate(client, `document.documentElement.scrollHeight`)
  for (let y = 0; y < height + 900; y += 600) { await evaluate(client, `window.scrollTo(0, ${y})`); await delay(350) }
  let count = 0
  for (let i = 0; i < 40; i++) { count = await evaluate(client, `document.querySelectorAll('.tx-slider').length`); if (count >= 5) break; await delay(500) }
  await evaluate(client, `window.scrollTo(0, 0)`)
  await delay(400)
  const text = await evaluate(client, `document.body.innerText`)
  console.log('DOC_TEXT', JSON.stringify({ propsRow: text.includes('配方对齐 Radio'), contract: text.includes('常驻的玻璃胶囊'), bestPractice: text.includes('不要单独覆盖'), coverage: text.includes('弹簧编译'), review: text.includes('刚度 560') }))
  console.log('SLIDERS', count, 'scrollHeight', height)
  for (let i = 0; i < count; i++) await shootBox(i, `demo-${i}`)
  for (const idx of [0, Math.min(4, count - 1)]) {
    if (idx < 0) break
    await evaluate(client, `${sliderAt(idx)}.scrollIntoView({ block: 'center' })`)
    await delay(400)
    const p = await evaluate(client, `(() => { const r = ${sliderAt(idx)}.querySelector('.tx-slider__surface').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
    const x = Math.round(p.x), y = Math.round(p.y)
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    await delay(200)
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
    await delay(150)
    for (let k = 1; k <= 6; k++) { await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + k * 12, y, button: 'left' }); await delay(40) }
    await delay(500)
    const m = await evaluate(client, `(() => { const s = ${sliderAt(idx)}; const surf = s.querySelector('.tx-slider__surface').getBoundingClientRect(); const tip = s.querySelector('.tx-slider__tooltip'); const t = tip && tip.getBoundingClientRect(); return { cls: s.className, surface: { top: +surf.top.toFixed(2), h: +surf.height.toFixed(2), w: +surf.width.toFixed(2) }, tooltip: t && { bottom: +t.bottom.toFixed(2), h: +t.height.toFixed(2) }, gapPx: t ? +(surf.top - t.bottom).toFixed(2) : null } })()`)
    console.log('TOOLTIP', idx, JSON.stringify(m))
    await shootBox(idx, `demo-${idx}-drag`)
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + 72, y, button: 'left', clickCount: 1 })
    await delay(500)
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 })
    await delay(300)
  }
} finally { clearTimeout(watchdog); client.close(); await closeTarget(target.id) }
console.log('done')
