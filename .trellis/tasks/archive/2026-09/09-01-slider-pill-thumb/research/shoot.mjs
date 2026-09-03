// Capture the gallery Slider cell (rest / hover / drag / focus) and the Radio cell,
// dump computed styles. Adapted from
// .trellis/tasks/09-01-tuffex-gallery-visual-polish/research/shoot.mjs for port 9227.
//   MODE=dark|light PHASE=before|after node /tmp/slider-pill/shoot.mjs
import { mkdirSync, writeFileSync } from 'node:fs'

process.env.TUFFEX_CDP_URL ||= 'http://127.0.0.1:9227'
const { createTarget, closeTarget, createClient, evaluate, waitFor, delay, setViewport } = await import(
  '/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/scripts/audit-cdp-client.mjs'
)

const MODE = process.env.MODE || 'dark'
const PHASE = process.env.PHASE || 'after'
const OUT = `/tmp/slider-pill/shots/${PHASE}/${MODE}`
mkdirSync(OUT, { recursive: true })
const URL = 'http://localhost:3200/zh/docs/dev/components'

const target = await createTarget('about:blank')
const client = createClient(target.webSocketDebuggerUrl)
try {
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: MODE }] })
  await client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { localStorage.setItem('nuxt-color-mode', '${MODE}') } catch {}`,
  })
  await setViewport(client, { width: 1280, height: 900, deviceScaleFactor: 2 })
  await client.send('Page.navigate', { url: URL })
  await waitFor(client, `document.readyState === 'complete' && document.querySelector('.docs-gallery .tx-slider__surface')`, 90000)
  await delay(1500)
  await evaluate(client, MODE === 'dark'
    ? `document.documentElement.classList.add('dark')`
    : `document.documentElement.classList.remove('dark')`)
  await delay(800)

  const cellSel = label => `[...document.querySelectorAll('.docs-gallery__cell')].find(c => c.querySelector('.docs-gallery__label')?.textContent.trim().startsWith('${label}'))`

  async function cellRect(label, scroll = false) {
    return await evaluate(client, `(() => {
      const c = ${cellSel(label)}
      if (!c) return null
      ${scroll ? `c.scrollIntoView({ block: 'center' })` : ''}
      const r = c.getBoundingClientRect()
      return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height }
    })()`)
  }

  async function shootRect(rect, name) {
    const shot = await client.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 2 }, captureBeyondViewport: true })
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(shot.data, 'base64'))
    console.log('wrote', `${OUT}/${name}.png`, JSON.stringify(rect))
  }

  async function shootCell(label, name) {
    await cellRect(label, true)
    await delay(400)
    const rect = await cellRect(label)
    if (!rect) { console.log('cell not found', label); return null }
    await shootRect(rect, name)
    return rect
  }

  async function sliderMetrics(tag) {
    return await evaluate(client, `(() => {
      const s = document.querySelector('.docs-gallery .tx-slider')
      const main = s.querySelector('.tx-slider__main')
      const surf = s.querySelector('.tx-slider__surface')
      const track = s.querySelector('.tx-slider__track')
      const range = s.querySelector('.tx-slider__range')
      const input = s.querySelector('.tx-slider__input')
      const mcs = getComputedStyle(main)
      const scs = getComputedStyle(surf), tcs = getComputedStyle(track)
      const ics = getComputedStyle(input, '::-webkit-slider-thumb')
      const sr = surf.getBoundingClientRect(), rr = range.getBoundingClientRect(), tr = track.getBoundingClientRect()
      return {
        tag: '${tag}', cls: s.className,
        thumbSizeVar: mcs.getPropertyValue('--tx-slider-thumb-size').trim(),
        surface: { w: +sr.width.toFixed(2), h: +sr.height.toFixed(2), centerX: +(sr.left + sr.width / 2).toFixed(2), left: +(sr.left - tr.left).toFixed(2), right: +(tr.right - sr.right).toFixed(2), radius: scs.borderRadius, bg: scs.backgroundColor, opacity: scs.opacity, backdrop: scs.backdropFilter, shadow: scs.boxShadow, transition: scs.transitionTimingFunction.slice(0, 60), duration: scs.transitionDuration },
        fill: { w: +rr.width.toFixed(2), endX: +rr.right.toFixed(2) },
        track: { h: tcs.height, bg: tcs.backgroundColor },
        thumb: { bg: ics.backgroundColor, shadow: ics.boxShadow, border: ics.borderTopWidth + ' ' + ics.borderTopColor, w: ics.width, h: ics.height },
      }
    })()`)
  }

  // Positive control: whole viewport.
  { const shot = await client.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${OUT}/_viewport.png`, Buffer.from(shot.data, 'base64')) }

  // --- Radio (reference) ---
  await shootCell('Radio', 'radio-rest')
  const radio = await evaluate(client, `(() => {
    const el = document.querySelector('.docs-gallery .tx-radio-group__indicator-plain')
    if (!el) return null
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect()
    return { w: r.width, h: r.height, radius: cs.borderRadius, bg: cs.backgroundColor, border: cs.borderTopColor, shadow: cs.boxShadow }
  })()`)
  console.log('RADIO', JSON.stringify(radio))

  // --- Slider rest ---
  await shootCell('Slider', 'slider-rest')
  console.log('SLIDER', JSON.stringify(await sliderMetrics('rest')))

  const thumb = await evaluate(client, `(() => { const s = document.querySelector('.docs-gallery .tx-slider__surface'); const r = s.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
  const tx = Math.round(thumb.x), ty = Math.round(thumb.y)

  // --- hover ---
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tx, y: ty })
  await delay(700)
  await shootRect(await cellRect('Slider'), 'slider-hover')
  console.log('SLIDER', JSON.stringify(await sliderMetrics('hover')))

  // --- press + drag ---
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: tx, y: ty, button: 'left', clickCount: 1 })
  await delay(120)
  await shootRect(await cellRect('Slider'), 'slider-press-120ms')
  console.log('SLIDER', JSON.stringify(await sliderMetrics('press-120ms')))
  await delay(700)
  await shootRect(await cellRect('Slider'), 'slider-drag')
  console.log('SLIDER', JSON.stringify(await sliderMetrics('drag')))
  // drag to both ends to check the pill stays inside the track
  const trackRect = await evaluate(client, `(() => { const r = document.querySelector('.docs-gallery .tx-slider__track').getBoundingClientRect(); return { left: r.left, right: r.right, y: r.top + r.height / 2 } })()`)
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(trackRect.right + 40), y: ty, button: 'left' })
  await delay(500)
  await shootRect(await cellRect('Slider'), 'slider-drag-max')
  console.log('SLIDER', JSON.stringify(await sliderMetrics('drag-max')))
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(trackRect.left - 40), y: ty, button: 'left' })
  await delay(500)
  await shootRect(await cellRect('Slider'), 'slider-drag-min')
  console.log('SLIDER', JSON.stringify(await sliderMetrics('drag-min')))
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tx, y: ty, button: 'left' })
  await delay(300)
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tx, y: ty, button: 'left', clickCount: 1 })
  await delay(600)
  // move the pointer away so hover clears
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 })
  await delay(600)

  // --- keyboard focus: put focus on a sentinel before the input, then a real Tab ---
  await evaluate(client, `(() => {
    const input = document.querySelector('.docs-gallery .tx-slider__input')
    let b = document.getElementById('__focus-sentinel')
    if (!b) { b = document.createElement('button'); b.id = '__focus-sentinel'; b.textContent = ''; b.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;'; input.parentElement.insertBefore(b, input) }
    b.focus()
    return document.activeElement === b
  })()`)
  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 })
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 })
  await delay(700)
  const focusState = await evaluate(client, `(() => { const s = document.querySelector('.docs-gallery .tx-slider'); const i = s.querySelector('.tx-slider__input'); return { active: document.activeElement === i, focusVisible: i.matches(':focus-visible'), cls: s.className } })()`)
  console.log('FOCUS', JSON.stringify(focusState))
  await shootRect(await cellRect('Slider'), 'slider-focus')
  console.log('SLIDER', JSON.stringify(await sliderMetrics('focus')))
  await evaluate(client, `document.getElementById('__focus-sentinel')?.remove(); document.activeElement?.blur()`)
}
finally {
  client.close()
  await closeTarget(target.id)
}
console.log('done')
