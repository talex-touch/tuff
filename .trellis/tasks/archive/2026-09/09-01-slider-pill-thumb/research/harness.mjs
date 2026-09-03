// Static harness: real built CSS (dist/es/base.css + dist/es/slider/style.css) on hand-written
// slider markup, in my own Chrome on 9227. Independent of the nexus dev server. Covers what the
// gallery shots cannot: prefers-reduced-motion durations, the thumbSurface:false flat path, and
// the tooltip/pill gap while dragging.
process.env.TUFFEX_CDP_URL ||= 'http://127.0.0.1:9227'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const { createTarget, closeTarget, createClient, evaluate, delay, setViewport } = await import('/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/scripts/audit-cdp-client.mjs')

const ROOT = '/Users/talexdreamsoul/Workspace/Projects/talex-touch/packages/tuffex/dist/es'
const base = readFileSync(`${ROOT}/base.css`, 'utf8')
const slider = readFileSync(`${ROOT}/slider/style.css`, 'utf8')
if (!slider.includes('linear(0, 0.0526')) throw new Error('dist slider css is stale: spring string missing')
const OUT = '/tmp/slider-pill/shots/after/harness'
mkdirSync(OUT, { recursive: true })

// value 62 on a 240px track: thumbCenter = size/2 + (240 - size) * 0.62
const center = size => size / 2 + (240 - size) * 0.62
function sliderHtml({ id, surface, extraClass = '', tooltip = false }) {
  const size = surface ? 40 : 18
  const c = center(size).toFixed(2)
  return `<div id="${id}" class="tx-slider ${surface ? 'has-surface' : ''} ${extraClass}" style="width:240px">
    <div class="tx-slider__main">
      <div class="tx-slider__track" aria-hidden="true"><div class="tx-slider__range" style="width:${c}px"></div></div>
      ${surface ? `<div class="tx-slider__surface" aria-hidden="true" style="left:${c}px"></div>` : ''}
      ${tooltip ? `<div class="tx-slider__tooltip" data-motion="blur" style="left:${c}px;top:50%;transform-origin:50% 100%;transform:translateX(-50%) translateY(-50%) rotate(0deg) skewX(0deg) scaleX(1) scaleY(1) translateY(-28px)">62</div>` : ''}
      <input class="tx-slider__input" type="range" min="0" max="100" step="1" value="62" aria-label="harness">
    </div>
  </div>`
}
const page = (dark) => `<!doctype html><html class="${dark ? 'dark' : ''}"><head><meta charset="utf-8"><style>${base}\n${slider}
  body{margin:0;background:var(--tx-bg-color);color:var(--tx-text-color-primary);font-family:-apple-system,sans-serif;padding:24px}
  .row{display:flex;align-items:center;gap:24px;padding:18px 0}.row label{width:170px;font-size:12px;color:var(--tx-text-color-secondary)}
  </style></head><body>
  <div class="row"><label>pill rest</label>${sliderHtml({ id: 'pill', surface: true })}</div>
  <div class="row"><label>pill drag + tooltip</label>${sliderHtml({ id: 'pillDrag', surface: true, extraClass: 'is-hovering is-dragging', tooltip: true })}</div>
  <div class="row"><label>flat rest</label>${sliderHtml({ id: 'flat', surface: false })}</div>
  <div class="row"><label>flat hover</label>${sliderHtml({ id: 'flatHover', surface: false, extraClass: 'is-hovering' })}</div>
  <div class="row"><label>flat focus</label>${sliderHtml({ id: 'flatFocus', surface: false, extraClass: 'is-focused' })}</div>
  <div class="row"><label>flat drag</label>${sliderHtml({ id: 'flatDrag', surface: false, extraClass: 'is-hovering is-dragging' })}</div>
  </body></html>`

for (const dark of [true, false]) {
  const mode = dark ? 'dark' : 'light'
  const target = await createTarget('about:blank')
  const client = createClient(target.webSocketDebuggerUrl)
  const watchdog = setTimeout(() => { console.log('WATCHDOG'); process.exit(2) }, 60000)
  try {
    await client.send('Page.enable'); await client.send('Runtime.enable')
    await setViewport(client, { width: 620, height: 520, deviceScaleFactor: 2 })
    await client.send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(page(dark)) })
    await delay(1200)
    const metrics = await evaluate(client, `(() => {
      const read = (id) => { const s = document.getElementById(id); const main = s.querySelector('.tx-slider__main'); const cs = getComputedStyle(main); const surf = s.querySelector('.tx-slider__surface'); const ics = getComputedStyle(s.querySelector('.tx-slider__input'), '::-webkit-slider-thumb'); const out = { id, thumbSizeVar: cs.getPropertyValue('--tx-slider-thumb-size').trim(), thumb: { bg: ics.backgroundColor, w: ics.width, h: ics.height, shadow: ics.boxShadow.slice(0, 90), transform: ics.transform } }; if (surf) { const r = surf.getBoundingClientRect(); const scs = getComputedStyle(surf); out.surface = { w: +r.width.toFixed(2), h: +r.height.toFixed(2), top: +r.top.toFixed(2), radius: scs.borderRadius, durations: scs.transitionDuration } } return out }
      const tip = document.querySelector('#pillDrag .tx-slider__tooltip').getBoundingClientRect()
      const pill = document.querySelector('#pillDrag .tx-slider__surface').getBoundingClientRect()
      return { rows: ['pill', 'pillDrag', 'flat', 'flatHover', 'flatFocus', 'flatDrag'].map(read), tooltipGapPx: +(pill.top - tip.bottom).toFixed(2), tooltip: { h: +tip.height.toFixed(2), bottom: +tip.bottom.toFixed(2) }, pillTop: +pill.top.toFixed(2) }
    })()`)
    console.log(mode.toUpperCase(), 'METRICS', JSON.stringify(metrics))
    let shot = await client.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(`${OUT}/harness-${mode}.png`, Buffer.from(shot.data, 'base64'))
    // reduced motion
    await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    await delay(300)
    const reduced = await evaluate(client, `(() => { const s = document.getElementById('pill'); const cs = getComputedStyle(s); return { matches: matchMedia('(prefers-reduced-motion: reduce)').matches, stateDuration: cs.getPropertyValue('--tx-slider-state-duration').trim(), hoverDuration: cs.getPropertyValue('--tx-slider-hover-duration').trim(), surface: getComputedStyle(s.querySelector('.tx-slider__surface')).transitionDuration, track: getComputedStyle(s.querySelector('.tx-slider__track')).transitionDuration, range: getComputedStyle(s.querySelector('.tx-slider__range')).transitionDuration, flatThumb: getComputedStyle(document.querySelector('#flat .tx-slider__input'), '::-webkit-slider-thumb').transitionDuration } })()`)
    console.log(mode.toUpperCase(), 'REDUCED', JSON.stringify(reduced))
    await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
  } finally { clearTimeout(watchdog); client.close(); await closeTarget(target.id) }
}
console.log('done')
