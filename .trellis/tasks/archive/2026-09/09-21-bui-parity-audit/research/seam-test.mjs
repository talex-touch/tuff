// Does `captureBeyondViewport: true` produce a compositing seam?
// Shoot the same element two ways and diff them.
import fs from 'node:fs/promises'
import {
  createTarget, closeTarget, createClient, setViewport, evaluate, delay,
} from '/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/scripts/audit-cdp-client.mjs'

const url = 'http://localhost:3200/zh/docs/dev/components/flowchart'
const sel = '.tx-bui-flowchart'

const { targetId, webSocketDebuggerUrl } = await createTarget('about:blank')
const client = createClient(webSocketDebuggerUrl)
await client.ready
await client.send('Page.enable', {})
await client.send('Runtime.enable', {})
await setViewport(client, { width: 1440, height: 1400, deviceScaleFactor: 2 })
await client.send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-color-scheme', value: 'light' }],
})
await client.send('Page.addScriptToEvaluateOnNewDocument', {
  source: `try{localStorage.setItem('nuxt-color-mode','light')}catch(e){}`,
})
await client.send('Page.navigate', { url })
await delay(14000)
await evaluate(client, `(async()=>{const h=document.body.scrollHeight;for(let y=0;y<h+1500;y+=600){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,110))}return h})()`)
await delay(2500)

// Park the element fully inside the viewport, then wait for scrolling to settle.
await evaluate(client, `(() => {
  document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: 'center', behavior: 'instant' })
  return String(window.scrollY)
})()`)
await delay(2000)

const geo = JSON.parse(await evaluate(client, `(() => {
  const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect()
  return JSON.stringify({
    vx: r.x, vy: r.y, w: r.width, h: r.height,
    dx: r.x + window.scrollX, dy: r.y + window.scrollY,
    inViewport: r.top >= 0 && r.bottom <= window.innerHeight,
  })
})()`))
console.log('geometry', geo)

// A: current approach — document coords + captureBeyondViewport
const a = await client.send('Page.captureScreenshot', {
  format: 'png', captureBeyondViewport: true,
  clip: { x: geo.dx, y: geo.dy, width: geo.w, height: geo.h, scale: 2 },
})
await fs.writeFile('/tmp/tuff-ref/seam-A-beyond.png', Buffer.from(a.data, 'base64'))

// B: element parked in the viewport, viewport coords, no beyond-viewport
const b = await client.send('Page.captureScreenshot', {
  format: 'png', captureBeyondViewport: false,
  clip: { x: geo.vx, y: geo.vy, width: geo.w, height: geo.h, scale: 2 },
})
await fs.writeFile('/tmp/tuff-ref/seam-B-viewport.png', Buffer.from(b.data, 'base64'))

console.log('A bytes', a.data.length, 'B bytes', b.data.length, 'identical:', a.data === b.data)
client.close?.()
await closeTarget(targetId)
