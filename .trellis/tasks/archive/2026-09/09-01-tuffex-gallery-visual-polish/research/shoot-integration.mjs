// Parent-task integration shots: the three redesigned cells plus the Radio
// reference cell, both themes, after all three children have landed.
// Run from apps/nexus with its own Chrome:
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
//     --remote-debugging-port=9230 --user-data-dir=/tmp/cdp-9230 --no-first-run --disable-gpu about:blank &
//   MODE=dark  TUFFEX_CDP_URL=http://127.0.0.1:9230 node <this file>
//   MODE=light TUFFEX_CDP_URL=http://127.0.0.1:9230 node <this file>
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeTarget, createClient, createTarget, delay, evaluate, setViewport, waitFor } from '/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/scripts/audit-cdp-client.mjs'

const MODE = process.env.MODE || 'dark'
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'integration', MODE)
mkdirSync(OUT, { recursive: true })
const URL = process.env.TUFFEX_DOCS_URL || 'http://localhost:3200/zh/docs/dev/components'

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
await evaluate(client, MODE === 'dark'
  ? `document.documentElement.classList.add('dark')`
  : `document.documentElement.classList.remove('dark')`)
await delay(600)

const cellSel = label => `[...document.querySelectorAll('.docs-gallery__cell')].find(c => c.querySelector('.docs-gallery__label')?.textContent.trim().startsWith('${label}'))`

// Positive control: an unclipped viewport shot. If this is a solid colour the
// page did not render and every clipped shot below is meaningless.
{
  const shot = await client.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path.join(OUT, '_viewport.png'), Buffer.from(shot.data, 'base64'))
}

async function cellRect(label) {
  return evaluate(client, `(() => {
    const c = ${cellSel(label)}
    if (!c) return null
    c.scrollIntoView({ block: 'center' })
    const r = c.getBoundingClientRect()
    // Document coordinates: viewport-relative rects give a solid-colour PNG.
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height }
  })()`)
}

async function shoot(label, name) {
  const rect = await cellRect(label)
  if (!rect) {
    console.log('cell not found', label)
    return
  }
  await delay(400)
  const shot = await client.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 2 }, captureBeyondViewport: true })
  writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(shot.data, 'base64'))
  console.log('wrote', name)
}

const metrics = {}

await shoot('StatusBadge', 'status-badge')
metrics.statusBadge = await evaluate(client, `(() => [...document.querySelectorAll('.docs-gallery .tx-status-badge')].map((el) => {
  const cs = getComputedStyle(el)
  const icon = el.querySelector('.tx-status-badge__icon')
  const ir = icon?.getBoundingClientRect()
  return { text: el.textContent.trim(), color: cs.color, bg: cs.backgroundColor, border: cs.borderTopColor, radius: cs.borderRadius, weight: cs.fontWeight, iconClass: icon?.className, iconW: ir?.width, iconH: ir?.height, h: el.getBoundingClientRect().height }
}))()`)

await shoot('ProgressBar', 'progress-bar')
metrics.progressBar = await evaluate(client, `(() => [...document.querySelectorAll('.docs-gallery .tx-progress-bar-wrapper')].map((w) => {
  const track = w.querySelector('.tx-progress-bar__track')
  const bar = w.querySelector('.tx-progress-bar')
  const acs = getComputedStyle(track, '::after')
  return { cls: w.className, hasMask: !!w.querySelector('.tx-progress-bar__mask'), hasGlow: !!w.querySelector('.tx-progress-bar__glow'), trackBg: getComputedStyle(track).backgroundColor, afterBorderW: acs.borderTopWidth, barBg: getComputedStyle(bar).backgroundImage, barW: bar.getBoundingClientRect().width, trackH: track.getBoundingClientRect().height }
}))()`)

await shoot('Radio', 'radio')
metrics.radio = await evaluate(client, `(() => {
  const el = document.querySelector('.docs-gallery .tx-radio-group__indicator-plain')
  if (!el) return null
  const cs = getComputedStyle(el); const r = el.getBoundingClientRect()
  return { w: r.width, h: r.height, bg: cs.backgroundColor, border: cs.borderTopColor, shadow: cs.boxShadow, radius: cs.borderRadius }
})()`)

await shoot('Slider', 'slider-rest')
async function sliderMetrics(tag) {
  return evaluate(client, `(() => {
    const s = document.querySelector('.docs-gallery .tx-slider')
    const surf = s.querySelector('.tx-slider__surface')
    const track = s.querySelector('.tx-slider__track')
    const scs = surf && getComputedStyle(surf)
    const sr = surf && surf.getBoundingClientRect()
    return { tag: '${tag}', cls: s.className, surface: surf ? { w: sr.width, h: sr.height, radius: scs.borderRadius, bg: scs.backgroundColor, opacity: scs.opacity, backdrop: scs.backdropFilter, shadow: scs.boxShadow, transition: scs.transitionTimingFunction } : null, trackH: track.getBoundingClientRect().height }
  })()`)
}
metrics.slider = [await sliderMetrics('rest')]

const thumb = await evaluate(client, `(() => { const s = document.querySelector('.docs-gallery .tx-slider__surface') || document.querySelector('.docs-gallery .tx-slider__input'); const r = s.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
const px = Math.round(thumb.x)
const py = Math.round(thumb.y)

await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py })
await delay(700)
await shoot('Slider', 'slider-hover')
metrics.slider.push(await sliderMetrics('hover'))

await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: px, y: py, button: 'left', clickCount: 1 })
await delay(120)
await shoot('Slider', 'slider-press-120ms')
await delay(700)
await shoot('Slider', 'slider-drag')
metrics.slider.push(await sliderMetrics('drag'))
await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: px, y: py, button: 'left', clickCount: 1 })
await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 })
await delay(700)

// Keyboard focus: one Tab sets keyboard modality so a programmatic focus()
// matches :focus-visible, which is what the component's onFocus reads.
await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
await evaluate(client, `document.querySelector('.docs-gallery .tx-slider__input').focus()`)
await delay(500)
await shoot('Slider', 'slider-focus')
metrics.slider.push(await sliderMetrics('focus'))

writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2))
console.log(JSON.stringify(metrics, null, 1))

client.close()
await closeTarget(target.id)
console.log('done', OUT)
