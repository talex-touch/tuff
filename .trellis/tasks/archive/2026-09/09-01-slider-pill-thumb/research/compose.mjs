// Compose Radio cell + Slider states side by side (per theme) into one PNG via Chrome.
process.env.TUFFEX_CDP_URL ||= 'http://127.0.0.1:9227'
import { readFileSync, writeFileSync } from 'node:fs'
const { createTarget, closeTarget, createClient, delay, setViewport, evaluate } = await import('/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/scripts/audit-cdp-client.mjs')
const S = '/tmp/slider-pill/shots'
const img = p => `data:image/png;base64,${readFileSync(p).toString('base64')}`
for (const mode of ['dark', 'light']) {
  const tiles = [
    ['Radio (reference)', `${S}/after/${mode}/radio-rest.png`],
    ['Slider rest', `${S}/after/${mode}/slider-rest.png`],
    ['Slider hover', `${S}/after/${mode}/slider-hover.png`],
    ['Slider drag', `${S}/after/${mode}/slider-drag.png`],
    ['Slider focus (Tab)', `${S}/after/${mode}/slider-focus.png`],
    ['Slider rest — before', `${S}/before/${mode}/slider-rest.png`],
  ]
  const html = `<!doctype html><html><body style="margin:0;background:${mode === 'dark' ? '#0b0b0b' : '#f3f3f3'};font:12px -apple-system,sans-serif;color:${mode === 'dark' ? '#ddd' : '#222'}">
  <div style="display:grid;grid-template-columns:repeat(3,356px);gap:12px;padding:12px">
  ${tiles.map(([label, p]) => `<figure style="margin:0"><img src="${img(p)}" style="width:356px;display:block;border:1px solid #8884"><figcaption style="padding:4px 2px">${label}</figcaption></figure>`).join('')}
  </div></body></html>`
  const target = await createTarget('about:blank')
  const client = createClient(target.webSocketDebuggerUrl)
  try {
    await client.send('Page.enable'); await client.send('Runtime.enable')
    await setViewport(client, { width: 1128, height: 560, deviceScaleFactor: 2 })
    await client.send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(html) })
    await delay(1500)
    const h = await evaluate(client, `document.body.scrollHeight`)
    await setViewport(client, { width: 1128, height: Math.ceil(h), deviceScaleFactor: 2 })
    await delay(300)
    const shot = await client.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(`${S}/after/${mode}/side-by-side.png`, Buffer.from(shot.data, 'base64'))
    console.log('wrote', `${S}/after/${mode}/side-by-side.png`, 'height', h)
  } finally { client.close(); await closeTarget(target.id) }
}
console.log('done')
