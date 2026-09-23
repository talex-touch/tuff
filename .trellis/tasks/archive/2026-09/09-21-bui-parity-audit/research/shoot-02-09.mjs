// Visual proof for 02 / 09: full-viewport shots (never clip + captureBeyondViewport —
// that tiles the region and an unfinished tile reads as a real opacity bug).
//
//   TUFFEX_CDP_URL=http://127.0.0.1:9231 node shoot-02-09.mjs
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  closeTarget, createClient, createTarget, delay, evaluate, setViewport, waitFor,
} from '../../../../apps/nexus/scripts/audit-cdp-client.mjs'

const OUT = process.env.OUT_DIR || '/tmp/tuff-ref/verify-02-09'
const BASE = process.env.DOCS || 'http://localhost:3200'

async function open(docPath) {
  const { targetId, webSocketDebuggerUrl } = await createTarget('about:blank')
  const client = createClient(webSocketDebuggerUrl)
  await client.ready
  await client.send('Page.enable', {})
  await client.send('Runtime.enable', {})
  await setViewport(client, { width: 1000, height: 780, deviceScaleFactor: 2 })
  await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })
  await client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try{localStorage.setItem('nuxt-color-mode','light')}catch(e){}`,
  })
  await client.send('Page.navigate', { url: `${BASE}${docPath}` })
  await delay(13000)
  await evaluate(client, `(() => { document.documentElement.classList.remove('dark'); document.documentElement.classList.add('light') })()`)
  await evaluate(client, `(async () => {
    const h = document.body.scrollHeight
    for (let y = 0; y < h + 1500; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 110)) }
    window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 500)); return h
  })()`)
  await delay(3000)
  return { client, targetId }
}

async function park(client, selector) {
  // Demos mount on intersection and the first paint after a cold route can lag
  // the scroll sweep, so wait for the element instead of assuming it is there.
  await waitFor(client, `document.querySelector(${JSON.stringify(selector)})`, 20000)
  return JSON.parse(await evaluate(client, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return JSON.stringify({ error: 'not found' })
    el.scrollIntoView({ block: 'center', behavior: 'instant' })
    const r = el.getBoundingClientRect()
    return JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height) })
  })()`))
}

async function shoot(client, name) {
  const png = await client.send('Page.captureScreenshot', { format: 'png' })
  await fs.mkdir(OUT, { recursive: true })
  const file = path.join(OUT, `${name}.png`)
  await fs.writeFile(file, Buffer.from(png.data, 'base64'))
  return file
}

{
  const { client, targetId } = await open('/zh/docs/dev/components/recommendation-card')
  console.log('09 card:', await park(client, '.tx-bui-recommendation-card'))
  await delay(1000)
  console.log('09 shot:', await shoot(client, '09-recommendation-card'))
  client.close?.()
  await closeTarget(targetId)
}

{
  const { client, targetId } = await open('/zh/docs/dev/components/agent-trace')
  for (let i = 0; i < 4; i++) {
    const box = JSON.parse(await evaluate(client, `(() => {
      const radio = [...document.querySelectorAll('.tx-flat-radio')].find(r => r.closest('.tuff-demo'))
      const item = radio.querySelectorAll('.tx-flat-radio-item')[${i}]
      radio.closest('.tuff-demo').scrollIntoView({ block: 'center', behavior: 'instant' })
      const r = item.getBoundingClientRect()
      return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), label: item.innerText.trim() })
    })()`))
    await delay(300)
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await client.send('Input.dispatchMouseEvent', {
        type, x: box.x, y: box.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1,
      })
    }
    await delay(1100)
    console.log(`02 ${box.label}:`, await shoot(client, `02-agent-trace-${i}-${['steps', 'reasoning', 'search', 'coding'][i]}`))
  }
  client.close?.()
  await closeTarget(targetId)
}
