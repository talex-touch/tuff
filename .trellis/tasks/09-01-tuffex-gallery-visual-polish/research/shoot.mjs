// Screenshot the three gallery cells (StatusBadge / Slider / ProgressBar) in dark mode,
// plus the slider in hover and drag states, and dump computed styles.
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
await client.send('Page.addScriptToEvaluateOnNewDocument', {
  source: `try { localStorage.setItem('nuxt-color-mode', '${MODE}') } catch {}`,
})
await setViewport(client, { width: 1280, height: 900, deviceScaleFactor: 2 })
await client.send('Page.navigate', { url: URL })
await waitFor(client, `document.readyState === 'complete' && document.querySelector('.docs-gallery')`, 60000)
await delay(1500)
await evaluate(client, MODE === 'dark' ? `document.documentElement.classList.add('dark')` : `document.documentElement.classList.remove('dark')`)
await delay(600)

const cellSel = (label) => `[...document.querySelectorAll('.docs-gallery__cell')].find(c => c.querySelector('.docs-gallery__label')?.textContent.trim().startsWith('${label}'))`

async function shootCell(label, name) {
  const rect = await evaluate(client, `(() => { const c = ${cellSel(label)}; if (!c) return null; c.scrollIntoView({block:'center'}); const r = c.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height } })()`)
  if (!rect) { console.log('cell not found', label); return null }
  await delay(400)
  const rect2 = await evaluate(client, `(() => { const c = ${cellSel(label)}; const r = c.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height } })()`)
  const shot = await client.send('Page.captureScreenshot', { format: 'png', clip: { ...rect2, scale: 2 }, captureBeyondViewport: true })
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(shot.data, 'base64'))
  console.log('wrote', name, JSON.stringify(rect2))
  return rect2
}

// positive control
{ const shot = await client.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${OUT}/_viewport.png`, Buffer.from(shot.data, 'base64')) }
// --- StatusBadge ---
await shootCell('StatusBadge', 'status-badge')
const badgeStyles = await evaluate(client, `(() => {
  const out = []
  for (const el of document.querySelectorAll('.docs-gallery .tx-status-badge')) {
    const cs = getComputedStyle(el)
    const icon = el.querySelector('.tx-status-badge__icon')
    const ics = icon ? getComputedStyle(icon) : null
    const r = el.getBoundingClientRect()
    out.push({ text: el.textContent.trim(), w: r.width, h: r.height, color: cs.color, bg: cs.backgroundColor, border: cs.borderTopColor, radius: cs.borderRadius, fontSize: cs.fontSize, fontWeight: cs.fontWeight, padding: cs.padding, gap: cs.gap, iconSize: ics && ics.fontSize, iconW: icon && icon.getBoundingClientRect().width, iconH: icon && icon.getBoundingClientRect().height })
  }
  const page = getComputedStyle(document.querySelector('.docs-gallery__stage')).backgroundColor
  const body = getComputedStyle(document.body).backgroundColor
  const root = getComputedStyle(document.documentElement)
  return { out, page, body, tokens: { success: root.getPropertyValue('--tx-color-success').trim(), warning: root.getPropertyValue('--tx-color-warning').trim(), danger: root.getPropertyValue('--tx-color-danger').trim(), primary: root.getPropertyValue('--tx-color-primary').trim(), textPrimary: root.getPropertyValue('--tx-text-color-primary').trim(), bg: root.getPropertyValue('--tx-bg-color').trim() }, htmlClass: document.documentElement.className }
})()`)
console.log('BADGES', JSON.stringify(badgeStyles, null, 1))

// --- ProgressBar ---
await shootCell('ProgressBar', 'progress-bar')
const progStyles = await evaluate(client, `(() => {
  const out = []
  for (const w of document.querySelectorAll('.docs-gallery .tx-progress-bar-wrapper')) {
    const track = w.querySelector('.tx-progress-bar__track')
    const mask = w.querySelector('.tx-progress-bar__mask')
    const bar = w.querySelector('.tx-progress-bar')
    const tcs = getComputedStyle(track), acs = getComputedStyle(track, '::after'), mcs = getComputedStyle(mask), bcs = getComputedStyle(bar)
    const r = track.getBoundingClientRect()
    out.push({ w: r.width, h: r.height, trackBg: tcs.backgroundColor, afterBorder: acs.borderTopColor, afterBorderW: acs.borderTopWidth, maskBg: mcs.backgroundColor, maskBackdrop: mcs.backdropFilter, barBg: bcs.backgroundColor, barShadow: bcs.boxShadow, barW: bar.getBoundingClientRect().width, cls: bar.className })
  }
  return out
})()`)
console.log('PROGRESS', JSON.stringify(progStyles, null, 1))

// --- Slider rest / hover / drag ---
const sliderRect = await shootCell('Slider', 'slider-rest')
async function sliderMetrics(tag) {
  return await evaluate(client, `(() => {
    const s = document.querySelector('.docs-gallery .tx-slider')
    const surf = s.querySelector('.tx-slider__surface')
    const track = s.querySelector('.tx-slider__track')
    const input = s.querySelector('.tx-slider__input')
    const scs = getComputedStyle(surf), tcs = getComputedStyle(track), ics = getComputedStyle(input, '::-webkit-slider-thumb')
    const sr = surf.getBoundingClientRect()
    return { tag: '${tag}', cls: s.className, surface: { w: sr.width, h: sr.height, radius: scs.borderRadius, bg: scs.backgroundColor, opacity: scs.opacity, backdrop: scs.backdropFilter, shadow: scs.boxShadow, transform: scs.transform }, track: { h: tcs.height, bg: tcs.backgroundColor }, thumb: { bg: ics.backgroundColor, transform: ics.transform, w: ics.width, h: ics.height, shadow: ics.boxShadow, border: ics.borderTopColor } }
  })()`)
}
console.log('SLIDER', JSON.stringify(await sliderMetrics('rest')))

const thumb = await evaluate(client, `(() => { const s = document.querySelector('.docs-gallery .tx-slider__surface'); const r = s.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 } })()`)
await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(thumb.x), y: Math.round(thumb.y) })
await delay(700)
{
  const r = await evaluate(client, `(() => { const c = ${cellSel('Slider')}; const r = c.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height } })()`)
  const shot = await client.send('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 2 }, captureBeyondViewport: true })
  writeFileSync(`${OUT}/slider-hover.png`, Buffer.from(shot.data, 'base64'))
}
console.log('SLIDER', JSON.stringify(await sliderMetrics('hover')))

await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(thumb.x), y: Math.round(thumb.y), button: 'left', clickCount: 1 })
await delay(120)
{
  const r = await evaluate(client, `(() => { const c = ${cellSel('Slider')}; const r = c.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height } })()`)
  const shot = await client.send('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 2 }, captureBeyondViewport: true })
  writeFileSync(`${OUT}/slider-press-120ms.png`, Buffer.from(shot.data, 'base64'))
}
await delay(700)
{
  const r = await evaluate(client, `(() => { const c = ${cellSel('Slider')}; const r = c.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height } })()`)
  const shot = await client.send('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 2 }, captureBeyondViewport: true })
  writeFileSync(`${OUT}/slider-drag.png`, Buffer.from(shot.data, 'base64'))
}
console.log('SLIDER', JSON.stringify(await sliderMetrics('drag')))
await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(thumb.x), y: Math.round(thumb.y), button: 'left', clickCount: 1 })

client.close()
await closeTarget(target.id)
console.log('done')
