/**
 * Step the `bead` drop one rAF at a time and screenshot every frame.
 *
 * A CDP screenshot costs far more than 16ms, so the animation would be over
 * before the second shot landed. Instead the page's clock and rAF queue are
 * taken over before the anchor opens: `runLiquid` reads `performance.now()` for
 * both its start stamp and every frame, so driving those two by hand replays the
 * exact frame sequence the unit tests model — at whatever pace the capture needs.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
  closeTarget,
  createClient,
  createTarget,
  delay,
  evaluate,
  repoRoot,
  screenshot,
  setViewport,
} from './audit-cdp-client.mjs'

const baseUrl = process.env.NEXUS_URL || 'http://127.0.0.1:3200'
const outDir = path.resolve(repoRoot, process.env.BEAD_OUT || 'output/playwright/bead-frames')
const pageUrl = `${baseUrl}/zh/docs/dev/components/base-anchor`
const FRAME_MS = 1000 / 60

const INSTALL_CLOCK = `(() => {
  const w = window
  w.__beadRaf = []
  w.__beadNow = 0
  const realRaf = w.requestAnimationFrame.bind(w)
  w.__beadRealRaf = realRaf
  performance.now = () => w.__beadNow
  w.requestAnimationFrame = (cb) => { w.__beadRaf.push(cb); return w.__beadRaf.length }
  w.cancelAnimationFrame = () => {}
  w.__beadStep = (dt) => {
    w.__beadNow += dt
    const queued = w.__beadRaf.splice(0, w.__beadRaf.length)
    for (const cb of queued) { try { cb(w.__beadNow) } catch {} }
    return queued.length
  }
  return 'installed'
})()`

/** Read back the geometry the frame actually wrote, so the shot has numbers attached. */
const READ_GEOMETRY = `(() => {
  // The floating layer is teleported out of the demo, and several anchors share
  // the page, so find the one whose liquid stage is actually showing.
  const stage = Array.from(document.querySelectorAll('.tx-base-anchor__liquid'))
    .find(el => el.style.visibility !== 'hidden' && el.getClientRects().length)
  if (!stage) return JSON.stringify({ missing: 'stage' })
  // Two rects in the shapes group: the trigger ghost, then the panel sheet.
  const sheet = Array.from(stage.querySelectorAll('g > rect')).at(-1)
  const layer = stage.closest('[data-tx-base-anchor], .tx-base-anchor__floating') || stage.parentElement
  const content = layer?.querySelector('.tx-base-anchor__content')
  return JSON.stringify({
    sheet: sheet && {
      x: Number(sheet.getAttribute('x')),
      w: Number(sheet.getAttribute('width')),
      h: Number(sheet.getAttribute('height')),
    },
    clip: content ? (content.style.clipPath || 'none') : 'no-content',
  })
})()`

async function main() {
  await mkdir(outDir, { recursive: true })
  const target = await createTarget(pageUrl)
  const client = createClient(target.webSocketDebuggerUrl)
  const frames = []

  try {
    await client.send('Page.enable', {})
    await client.send('Runtime.enable', {})
    await setViewport(client, { width: 620, height: 720, deviceScaleFactor: 2 })
    await client.send('Page.navigate', { url: pageUrl })
    await delay(9000)

    // The demo wrappers mount lazily, so the element does not exist until the page
    // has been scrolled far enough down for its wrapper to hydrate. Walk down.
    let found = false
    for (let attempt = 0; attempt < 40 && !found; attempt += 1) {
      found = await evaluate(client, `(() => {
        const el = document.querySelector('.base-anchor-bead-demo')
        if (el) { el.scrollIntoView({ block: 'center' }); return true }
        window.scrollBy(0, 600)
        return false
      })()`)
      await delay(350)
    }
    if (!found)
      throw new Error('bead demo never mounted')
    await delay(1500)

    const installed = await evaluate(client, INSTALL_CLOCK)
    if (installed !== 'installed')
      throw new Error(`clock takeover failed: ${JSON.stringify(installed)}`)

    // Open the anchor. The click handler runs synchronously; every frame after it
    // is ours to release one at a time.
    await evaluate(client, `(() => {
      const btn = document.querySelector('.base-anchor-bead-demo__trigger')
      if (!btn) return 'missing'
      btn.click()
      return 'clicked'
    })()`)

    // Vue needs its own microtask flush plus a couple of frames to mount the panel
    // and let floating-ui place it before the drop starts writing geometry.
    for (let i = 0; i < 3; i += 1) {
      await evaluate(client, `window.__beadStep(0)`)
      await delay(120)
    }

    for (let frame = 0; frame <= 16; frame += 1) {
      const geometry = await evaluate(client, READ_GEOMETRY)
      const parsed = JSON.parse(geometry ?? '{}')
      const sheet = parsed.sheet
      frames.push({ frame, t: +(frame * FRAME_MS / 260).toFixed(3), sheet, clip: parsed.clip })
      await screenshot(client, `bead-frame-${String(frame).padStart(2, '0')}`, outDir)
      await evaluate(client, `window.__beadStep(${FRAME_MS})`)
    }

    await writeFile(path.join(outDir, 'frames.json'), `${JSON.stringify(frames, null, 2)}\n`)
    for (const f of frames)
      console.log(`frame ${String(f.frame).padStart(2)} t=${String(f.t).padEnd(5)} sheet w=${f.sheet?.w?.toFixed?.(1) ?? '?'} h=${f.sheet?.h?.toFixed?.(1) ?? '?'}  clip=${f.clip}`)
    console.log(`\nscreenshots -> ${outDir}`)
  }
  finally {
    client.close()
    await closeTarget(target.id).catch(() => {})
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
