// Server-independent visual check: SSR-render the built TxProgressBar against the
// built CSS (dist/es/base.css + dist/es/progress-bar/style.css), then screenshot
// the static page in my own headless Chrome. Animations are frozen at a mid-frame
// so the five indeterminate sweeps are readable.
//   TUFFEX_CDP_URL=http://127.0.0.1:9228 node ssr-render.mjs
// Output: research/after/ssr-{dark,light}.png + ssr-metrics.json
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { closeTarget, createClient, createTarget, delay, evaluate, setViewport, waitFor } from '/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/scripts/audit-cdp-client.mjs'

const ROOT = '/Users/talexdreamsoul/Workspace/Projects/talex-touch'
const TUFFEX = `${ROOT}/packages/tuffex`
const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, 'after')
mkdirSync(OUT, { recursive: true })

const req = createRequire(`${TUFFEX}/package.json`)
const { createSSRApp, defineComponent, h } = await import(pathToFileURL(req.resolve('vue')).href)
const { renderToString } = await import(pathToFileURL(req.resolve('vue/server-renderer')).href)
const { TxProgressBar } = await import(pathToFileURL(`${TUFFEX}/dist/es/progress-bar/index.js`).href)

const cases = [
  ['gallery default 62%', { percentage: 62 }],
  ['gallery indeterminate (sweep)', { indeterminate: true }],
  ['indeterminate classic', { indeterminate: true, indeterminateVariant: 'classic' }],
  ['indeterminate bounce', { indeterminate: true, indeterminateVariant: 'bounce' }],
  ['indeterminate elastic', { indeterminate: true, indeterminateVariant: 'elastic' }],
  ['indeterminate split', { indeterminate: true, indeterminateVariant: 'split' }],
  ['top text + detail (upload)', { percentage: 65, showText: true, textPlacement: 'top', detail: '1.4 MB of 2.3 MB', format: p => `Uploading ${p}%`, height: '6px' }],
  ['top text, message only, indeterminate', { indeterminate: true, textPlacement: 'top', message: 'Syncing', detail: '3 files' }],
  ['outside text 40% (glow must sit on the tip)', { percentage: 40, showText: true, textPlacement: 'outside' }],
  ['inside text 80% (14px)', { percentage: 80, showText: true, height: '14px' }],
  ['status warning 68%', { percentage: 68, status: 'warning', showText: true }],
  ['success message', { success: true, message: 'Done' }],
  ['error 30%', { percentage: 30, error: true }],
  ['gradient color prop 8px (storage.vue)', { percentage: 54, height: '8px', color: 'linear-gradient(90deg, #3b82f6, #2563eb)' }],
  ['segments 14px glass (segments demo)', { segments: [{ value: 25, color: 'linear-gradient(90deg, #60a5fa, #34d399)' }, { value: 18, color: 'linear-gradient(90deg, #a78bfa, #f472b6)' }, { value: 12, color: 'linear-gradient(90deg, #fb7185, #f59e0b)' }], segmentsTotal: 100, height: '14px', showText: true, indicatorEffect: 'sparkle', maskBackground: 'glass' }],
  ['opt-in solid rim + blur mask (old default)', { percentage: 62, maskVariant: 'solid', maskBackground: 'blur' }],
  ['opt-in dashed rim 8px warning (release-policy demo)', { percentage: 50, height: '8px', status: 'warning', maskVariant: 'dashed' }],
  ['shimmer 10px success (operations demo)', { percentage: 86, status: 'success', height: '10px', showText: true, flowEffect: 'shimmer', maskVariant: 'dashed' }],
  ['sparkle + hover-glow 6px (core-app PluginStorage)', { percentage: 48, height: '6px', indicatorEffect: 'sparkle', hoverEffect: 'glow' }],
  ['0% (glow hidden)', { percentage: 0 }],
  ['100% (glow hidden)', { percentage: 100 }],
  ['tooltip-wrapped 40%', { percentage: 40, tooltip: true }],
]

const Root = defineComponent({
  render: () => h('main', cases.map(([title, props], i) => h('section', { class: 'case', 'data-case': i }, [
    h('h3', title),
    h(TxProgressBar, props),
  ]))),
})

let body
try {
  body = await renderToString(createSSRApp(Root))
}
catch (error) {
  console.error('SSR failed', error)
  process.exit(1)
}

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="${pathToFileURL(`${TUFFEX}/dist/es/base.css`).href}">
<link rel="stylesheet" href="${pathToFileURL(`${TUFFEX}/dist/es/progress-bar/style.css`).href}">
<link rel="stylesheet" href="${pathToFileURL(`${TUFFEX}/dist/es/tooltip/style.css`).href}">
<style>
  body { margin: 0; padding: 24px 32px; font-family: -apple-system, system-ui, sans-serif; background: #fff; color: var(--tx-text-color-primary); }
  html.dark body { background: #141414; }
  main { display: grid; gap: 18px; width: 360px; }
  .case h3 { margin: 0 0 8px; font-size: 11px; font-weight: 500; color: var(--tx-text-color-secondary); }
  /* Freeze every animation at a readable mid-frame. */
  * { animation-play-state: paused !important; animation-delay: -0.45s !important; }
  .tx-progress-bar { transition: none !important; }
  .tx-progress-bar__glow { transition: none !important; }
</style>
</head>
<body>${body}</body>
</html>`
const htmlPath = path.join(OUT, 'ssr.html')
writeFileSync(htmlPath, html)

const target = await createTarget('about:blank')
const client = createClient(target.webSocketDebuggerUrl)
await client.send('Page.enable')
await client.send('Runtime.enable')
await setViewport(client, { width: 440, height: 900, deviceScaleFactor: 2 })

const metricsExpr = `(() => [...document.querySelectorAll('.case')].map((c) => {
  const w = c.querySelector('.tx-progress-bar-wrapper')
  const track = w.querySelector('.tx-progress-bar__track')
  const bar = w.querySelector('.tx-progress-bar')
  const glow = w.querySelector('.tx-progress-bar__glow')
  const head = w.querySelector('.tx-progress-bar__head')
  const tr = track.getBoundingClientRect(), br = bar.getBoundingClientRect()
  const acs = getComputedStyle(track, '::after'), bcs = getComputedStyle(bar), pcs = getComputedStyle(bar, '::before')
  const gr = glow ? glow.getBoundingClientRect() : null
  return {
    title: c.querySelector('h3').textContent,
    cls: w.className.replace(/tx-progress-bar-wrapper/g, 'W'),
    track: { w: tr.width, h: tr.height, bg: getComputedStyle(track).backgroundColor, afterContent: acs.content, afterBorderW: acs.borderTopWidth },
    mask: !!w.querySelector('.tx-progress-bar__mask'),
    bar: { w: br.width, bg: bcs.backgroundImage !== 'none' ? bcs.backgroundImage.slice(0, 90) : bcs.backgroundColor, shadow: bcs.boxShadow, transition: bcs.transitionProperty },
    sweep: pcs.animationName !== 'none' ? { name: pcs.animationName, transform: pcs.transform, left: pcs.left, width: pcs.width } : null,
    glow: glow ? { visible: glow.classList.contains('is-visible'), opacity: getComputedStyle(glow).opacity, cx: +(gr.left + gr.width / 2).toFixed(1), tipX: +(tr.left + br.width).toFixed(1), parent: glow.parentElement.className.split(' ')[0], w: gr.width, h: gr.height } : null,
    head: head ? { text: head.textContent.trim(), labelColor: getComputedStyle(head.querySelector('.tx-progress-bar__head-label')).color, detail: head.querySelector('.tx-progress-bar__head-detail')?.textContent.trim() ?? null, detailColor: head.querySelector('.tx-progress-bar__head-detail') ? getComputedStyle(head.querySelector('.tx-progress-bar__head-detail')).color : null } : null,
    aria: track.getAttribute('aria-label'),
  }
}))()`

const metrics = {}
for (const mode of ['dark', 'light']) {
  await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: mode }, { name: 'prefers-reduced-motion', value: 'no-preference' }] })
  await client.send('Page.navigate', { url: pathToFileURL(htmlPath).href })
  await waitFor(client, `document.readyState === 'complete' && document.querySelectorAll('.tx-progress-bar-wrapper').length === ${cases.length}`, 20000)
  await evaluate(client, mode === 'dark' ? `document.documentElement.classList.add('dark')` : `document.documentElement.classList.remove('dark')`)
  await delay(500)
  const { contentSize } = await client.send('Page.getLayoutMetrics')
  const shot = await client.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: contentSize.width, height: contentSize.height, scale: 2 }, captureBeyondViewport: true })
  writeFileSync(path.join(OUT, `ssr-${mode}.png`), Buffer.from(shot.data, 'base64'))
  metrics[mode] = await evaluate(client, metricsExpr)
  console.log(`wrote ssr-${mode}.png`, JSON.stringify(contentSize))
}

// Reduced motion: the sweep must stop and become a still translucent track.
await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }, { name: 'prefers-reduced-motion', value: 'reduce' }] })
await delay(300)
metrics.reducedMotion = await evaluate(client, `(() => { const b = document.querySelector('[data-case="1"] .tx-progress-bar'); const cs = getComputedStyle(b, '::before'); return { animation: cs.animationName, transform: cs.transform, width: cs.width, bg: cs.backgroundColor } })()`)
{
  const rect = await evaluate(client, `(() => { const r = document.querySelector('[data-case="1"]').getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height } })()`)
  const shot = await client.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 2 }, captureBeyondViewport: true })
  writeFileSync(path.join(OUT, 'ssr-dark-reduced-motion-sweep.png'), Buffer.from(shot.data, 'base64'))
}

writeFileSync(path.join(OUT, 'ssr-metrics.json'), JSON.stringify(metrics, null, 2))
console.log(JSON.stringify(metrics, null, 1))
client.close()
await closeTarget(target.id)
console.log('done')
