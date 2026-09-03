process.env.TUFFEX_CDP_URL ||= 'http://127.0.0.1:9227'
import { writeFileSync } from 'node:fs'
const { createTarget, closeTarget, createClient, evaluate, waitFor, delay, setViewport } = await import('/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/scripts/audit-cdp-client.mjs')
const target = await createTarget('about:blank')
const client = createClient(target.webSocketDebuggerUrl)
const watchdog = setTimeout(() => { console.log('WATCHDOG'); process.exit(2) }, 150000)
const cell = `[...document.querySelectorAll('.docs-gallery__cell')].find(c => c.querySelector('.docs-gallery__label')?.textContent.trim().startsWith('Slider'))`
try {
  await client.send('Page.enable'); await client.send('Runtime.enable')
  await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }, { name: 'prefers-reduced-motion', value: 'reduce' }] })
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('nuxt-color-mode', 'dark') } catch {}` })
  await setViewport(client, { width: 1280, height: 900, deviceScaleFactor: 2 })
  await client.send('Page.navigate', { url: 'http://localhost:3200/zh/docs/dev/components' })
  await waitFor(client, `document.readyState === 'complete' && document.querySelector('.docs-gallery .tx-slider__surface')`, 90000)
  await delay(1500)
  await evaluate(client, `document.documentElement.classList.add('dark')`)
  await delay(500)
  const reduced = await evaluate(client, `(() => { const s = document.querySelector('.docs-gallery .tx-slider'); const cs = getComputedStyle(s); return { mediaMatches: matchMedia('(prefers-reduced-motion: reduce)').matches, stateDuration: cs.getPropertyValue('--tx-slider-state-duration').trim(), hoverDuration: cs.getPropertyValue('--tx-slider-hover-duration').trim(), ease: cs.getPropertyValue('--tx-slider-ease').trim().slice(0, 24), surfaceDurations: getComputedStyle(s.querySelector('.tx-slider__surface')).transitionDuration, trackDurations: getComputedStyle(s.querySelector('.tx-slider__track')).transitionDuration } })()`)
  console.log('REDUCED', JSON.stringify(reduced))
  // Flat path: drop the class and read exactly what refreshMetrics() reads.
  const flat = await evaluate(client, `(() => { const s = document.querySelector('.docs-gallery .tx-slider'); const main = s.querySelector('.tx-slider__main'); const before = getComputedStyle(main).getPropertyValue('--tx-slider-thumb-size').trim(); s.classList.remove('has-surface'); const after = getComputedStyle(main).getPropertyValue('--tx-slider-thumb-size').trim(); s.querySelector('.tx-slider__surface').style.display = 'none'; return { withSurface: before, flat: after } })()`)
  console.log('FLAT', JSON.stringify(flat))
  await evaluate(client, `(() => { const c = ${cell}; c.scrollIntoView({ block: 'center' }) })()`)
  await delay(500)
  const rect = await evaluate(client, `(() => { const c = ${cell}; const r = c.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height } })()`)
  const shot = await client.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 2 }, captureBeyondViewport: true })
  writeFileSync('/tmp/slider-pill/shots/after/dark/slider-flat-path-simulated.png', Buffer.from(shot.data, 'base64'))
  console.log('wrote flat-path shot')
} finally { clearTimeout(watchdog); client.close(); await closeTarget(target.id) }
console.log('done')
